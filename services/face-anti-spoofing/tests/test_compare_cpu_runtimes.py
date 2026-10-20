"""Stage 9J comparison guards only; no pretrained/private images in unit tests."""
import contextlib
import hashlib
import io
import json
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import compare_cpu_runtimes as compare


def probabilities(real=0.25):
    return np.array([[real, 1-real]], dtype=np.float32)


class ComparisonTests(unittest.TestCase):
    def test_prepare_once_same_tensor_each_runtime_and_cleanup(self):
        source = compare.mn3.synthetic_patch("noise")
        original = source.copy()
        seen = []
        outputs = []

        def forward(tensor):
            seen.append(tensor)
            self.assertTrue(np.isfinite(tensor).all())
            value = probabilities()
            outputs.append(value)
            return value

        with patch.object(compare.mn3, "prepare_patch", wraps=compare.mn3.prepare_patch) as prepare:
            result = compare.compare_patch(source, forward, forward)
        prepare.assert_called_once_with(source)
        self.assertEqual(result["status"], "PASS")
        self.assertEqual(result["outputs"]["opencv"], [[0.25, 0.75]] * 3)
        self.assertEqual(len(seen), 6)
        self.assertTrue(all(tensor is seen[0] for tensor in seen))
        self.assertEqual(np.count_nonzero(seen[0]), 0)
        self.assertTrue(all(np.count_nonzero(value) == 0 for value in outputs))
        np.testing.assert_array_equal(source, original)

    def test_material_difference_fails_without_class_swap_or_softmax(self):
        result = compare.compare_patch(compare.mn3.synthetic_patch("constant"),
                                       lambda x: probabilities(0.25), lambda x: probabilities(0.75))
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["outputs"]["opencv"][0], [0.25, 0.75])
        self.assertEqual(result["outputs"]["ort"][0], [0.75, 0.25])
        self.assertEqual(result["max_absolute_difference"], 0.5)
        self.assertIsNone(result["prediction"])

    def test_fixed_tolerance_boundary_and_relative_definition(self):
        at_limit = compare.difference([compare.ATOL, 1.0], [0.0, 1.0])
        beyond = compare.difference([compare.ATOL * 1.001, 1.0], [0.0, 1.0])
        self.assertTrue(at_limit["within_tolerance"])
        self.assertFalse(beyond["within_tolerance"])
        self.assertEqual(at_limit["relative"][0], compare.ATOL / np.finfo(np.float32).eps)
        self.assertEqual((compare.ATOL, compare.RTOL, compare.REPEATS), (1e-5, 1e-4, 3))

    def test_nonfinite_and_invalid_probability_outputs_rejected(self):
        invalid = [np.array([[np.nan, 1]], np.float32), np.array([[np.inf, 0]], np.float32),
                   np.array([[0, 0]], np.float32), np.array([[-1, 2]], np.float32),
                   np.zeros((1, 3), np.float32), np.array([[0.25, 0.75]], np.float64)]
        for output in invalid:
            with self.subTest(shape=output.shape, dtype=output.dtype), self.assertRaises(ValueError):
                compare.compare_patch(compare.mn3.synthetic_patch("constant"), lambda x: output.copy(), lambda x: probabilities())

    def test_mutated_tensor_rejected_before_other_runtime(self):
        def modifies_input(tensor):
            tensor[0, 0, 0, 0] = 42
            return probabilities()
        with patch.object(compare, "tensor_hash", wraps=compare.tensor_hash):
            with self.assertRaisesRegex(compare.ComparisonError, "INPUT_TENSOR_CHANGED"):
                compare.compare_patch(compare.mn3.synthetic_patch("constant"), modifies_input,
                                      lambda x: self.fail("changed input reached ORT"))

    def test_forward_failure_also_cleans_tensor(self):
        captured = []

        def fails(tensor):
            captured.append(tensor)
            raise RuntimeError("exception not propagated by CLI")

        with self.assertRaises(RuntimeError):
            compare.compare_patch(compare.mn3.synthetic_patch("constant"), fails, lambda x: probabilities())
        self.assertEqual(np.count_nonzero(captured[0]), 0)

    def test_nondeterministic_repeat_is_a_failure(self):
        calls = iter([0.25, 0.250001, 0.25])
        result = compare.compare_patch(compare.mn3.synthetic_patch("constant"),
                                       lambda x: probabilities(next(calls)), lambda x: probabilities())
        self.assertEqual(result["status"], "FAIL")
        self.assertFalse(result["determinism"]["opencv"]["bit_exact_outputs"])
        self.assertTrue(all(x["within_tolerance"] for x in result["differences"]))

    def test_ort_catalog_requires_cpu_exact_names_shapes_types(self):
        session = SimpleNamespace(
            get_inputs=lambda: [SimpleNamespace(name=compare.INPUT_NAME, type="tensor(float)", shape=compare.INPUT_SHAPE)],
            get_outputs=lambda: [SimpleNamespace(name=compare.OUTPUT_NAME, type="tensor(float)", shape=[1, 2])],
            get_providers=lambda: ["CPUExecutionProvider"])
        self.assertEqual(compare.validate_ort_catalog(session)["providers"], ["CPUExecutionProvider"])
        for changed in (
            {"get_providers": lambda: ["CUDAExecutionProvider", "CPUExecutionProvider"]},
            {"get_inputs": lambda: [SimpleNamespace(name="other", type="tensor(float)", shape=compare.INPUT_SHAPE)]},
            {"get_inputs": lambda: [SimpleNamespace(name=compare.INPUT_NAME, type="tensor(float16)", shape=compare.INPUT_SHAPE)]},
            {"get_outputs": lambda: [SimpleNamespace(name=compare.OUTPUT_NAME, type="tensor(float)", shape=[1, 3])]}):
            bad = SimpleNamespace(**(vars(session) | changed))
            with self.assertRaisesRegex(compare.ComparisonError, "RUNTIME_CATALOG_UNEXPECTED"):
                compare.validate_ort_catalog(bad)

    def test_model_bytes_read_once_and_both_hashes_required(self):
        data = b"synthetic test bytes; not an ONNX asset"
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "synthetic.bin"
            path.write_bytes(data)
            with patch.object(compare.mn3, "MODEL_SIZE", len(data)), \
                    patch.object(compare.mn3, "MODEL_SHA256", hashlib.sha256(data).hexdigest()), \
                    patch.object(compare.mn3, "MODEL_SHA384", hashlib.sha384(data).hexdigest()), \
                    patch.object(Path, "read_bytes", autospec=True, return_value=data) as read:
                self.assertEqual(compare.verified_model_bytes(path), data)
                read.assert_called_once_with(path)
                with patch.object(compare.mn3, "MODEL_SHA384", "0" * 96):
                    with self.assertRaisesRegex(compare.ComparisonError, "MODEL_CHECKSUM_MISMATCH"):
                        compare.verified_model_bytes(path)
            with self.assertRaisesRegex(compare.ComparisonError, "MODEL_SIZE_MISMATCH"):
                compare.verified_model_bytes(path)

    def test_private_path_not_accepted_as_fixture(self):
        with patch.object(Path, "read_bytes", side_effect=AssertionError("Private path read")):
            with self.assertRaisesRegex(compare.ComparisonError, "FIXTURE_NOT_ALLOWED"):
                compare.public_patch("private-photo.jpg")

    def test_error_does_not_print_exception_or_fake_scores(self):
        with patch.object(compare, "package_inventory", side_effect=RuntimeError("secret exception")):
            result = compare.run_comparison(Path("not-read"))
        self.assertEqual(result["status"], "ERROR")
        self.assertEqual(result["cases"], [])
        self.assertNotIn("secret", json.dumps(result))
        self.assertIsNone(result["prediction"])

    def test_cli_refuses_overwrite_before_any_model_or_image_read(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / "evidence.json"
            output.write_bytes(b"preserve previous evidence")
            with patch.object(compare, "run_comparison", side_effect=AssertionError("run started")), \
                    contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                compare.main(["--output", str(output)])
            self.assertEqual(output.read_bytes(), b"preserve previous evidence")


if __name__ == "__main__":
    unittest.main(verbosity=2)
