"""Stage 9F guards and preprocessing; no model assets or participant photos."""
import contextlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import mn3_offline as mn3


class Mn3Tests(unittest.TestCase):
    def test_rgb_channel_mean_std_exactly_once(self):
        image = np.full((128, 128, 3), [17, 99, 231], dtype=np.uint8)
        before = image.copy()
        actual = mn3.prepare_patch(image)
        expected = [(np.float32(231) - np.float32(151.2405)) / np.float32(63.0105),
                    (np.float32(99) - np.float32(119.5950)) / np.float32(56.4570),
                    (np.float32(17) - np.float32(107.8395)) / np.float32(55.0035)]
        self.assertEqual(actual.shape, (1, 3, 128, 128))
        self.assertEqual(actual.dtype, np.float32)
        self.assertTrue(actual.flags.c_contiguous)
        for channel, value in enumerate(expected):
            np.testing.assert_array_equal(actual[0, channel], np.full((128, 128), value, np.float32))
        np.testing.assert_array_equal(image, before)

    def test_pattern_resize_is_cubic_and_not_mirrored(self):
        image = mn3.synthetic_patch("pattern")
        expected_rgb = cv2.resize(image, (128, 128), interpolation=cv2.INTER_CUBIC)[:, :, ::-1].astype(np.float32)
        expected = ((expected_rgb - np.array(mn3.MEAN, np.float32)) / np.array(mn3.STD, np.float32)).transpose(2, 0, 1)[None]
        np.testing.assert_array_equal(mn3.prepare_patch(image), expected)

    def test_invalid_patch_before_resize(self):
        invalid = [None, np.zeros((128, 128), np.uint8), np.zeros((128, 128, 4), np.uint8),
                   np.zeros((128, 128, 3), np.float32), np.zeros((0, 128, 3), np.uint8),
                   np.zeros((1, 128, 3), np.uint8), np.zeros((4097, 2, 3), np.uint8)]
        with patch.object(mn3.cv2, "resize", side_effect=AssertionError("Invalid input reached resize")):
            for image in invalid:
                with self.subTest(shape=getattr(image, "shape", None)), self.assertRaises(mn3.Mn3Error):
                    mn3.prepare_patch(image)

    def test_probabilities_are_not_softmaxed_twice(self):
        self.assertEqual(mn3.validate_probabilities(np.array([[0.25, 0.75]], np.float32)), [0.25, 0.75])

    def test_bad_output_rejected(self):
        for values in ([[0, 0]], [[-1, 2]], [[np.nan, 1]], [[np.inf, 0]], [[0, 2]], [0.2, 0.8], [[1, 0, 0]]):
            with self.subTest(values=values), self.assertRaises(mn3.Mn3Error):
                mn3.validate_probabilities(np.array(values, dtype=np.float32))
        with self.assertRaises(mn3.Mn3Error):
            mn3.validate_probabilities(np.array([[0, 1]], dtype=np.int32))

    def test_missing_model_is_error_without_prediction(self):
        with tempfile.TemporaryDirectory() as directory:
            result = mn3.run_smoke(Path(directory) / "missing.onnx")
        self.assertEqual((result["status"], result["reason"]), ("ERROR", "MODEL_UNAVAILABLE"))
        self.assertIsNone(result["prediction"])
        self.assertEqual(result["cases"], [])
        self.assertFalse(result["provenance"]["model_loaded"])

    def test_wrong_size_rejected_before_import(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / "invalid.onnx"
            file.write_bytes(b"invalid")
            with patch.object(mn3.cv2.dnn, "readNetFromONNX", side_effect=AssertionError("Invalid model imported")):
                with self.assertRaisesRegex(mn3.Mn3Error, "MODEL_SIZE_MISMATCH"):
                    mn3.Mn3CpuAdapter(file)

    def test_wrong_checksum_rejected_before_import(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / "invalid.onnx"
            file.write_bytes(b"invalid")
            with patch.object(mn3, "MODEL_SIZE", 7), patch.object(mn3.cv2.dnn, "readNetFromONNX", side_effect=AssertionError("Unverified model imported")):
                with self.assertRaisesRegex(mn3.Mn3Error, "MODEL_CHECKSUM_MISMATCH"):
                    mn3.Mn3CpuAdapter(file)

    def test_invalid_patch_in_adapter_returns_empty_error(self):
        adapter = object.__new__(mn3.Mn3CpuAdapter)
        result = adapter.infer_patch(None)
        self.assertEqual(result["status"], "ERROR")
        self.assertIsNone(result["prediction"])
        self.assertIsNone(result["probabilities"])

    def test_exception_does_not_expose_private_payload(self):
        adapter = object.__new__(mn3.Mn3CpuAdapter)
        with patch.object(mn3, "prepare_patch", side_effect=RuntimeError("private/photo/path")):
            result = adapter.infer_patch(None)
        self.assertEqual(result["reason"], "INFERENCE_FAILED")
        self.assertNotIn("private", json.dumps(result))

    def test_forward_failure_clears_tensor_and_returns_no_scores(self):
        class FailingNet:
            def setInput(self, tensor, name):
                self.retained = tensor

            def forward(self, name):
                raise RuntimeError("private/photo/path")

        adapter = object.__new__(mn3.Mn3CpuAdapter)
        adapter.net = FailingNet()
        result = adapter.infer_patch(mn3.synthetic_patch("constant"))
        self.assertEqual(result["reason"], "INFERENCE_FAILED")
        self.assertIsNone(result["probabilities"])
        self.assertIsNone(result["prediction"])
        self.assertEqual(np.count_nonzero(adapter.net.retained), 0)
        self.assertNotIn("private", json.dumps(result))

    def test_invalid_forward_output_is_not_a_prediction(self):
        class InvalidNet:
            def setInput(self, tensor, name):
                pass

            def forward(self, name):
                return np.array([[np.nan, 1]], dtype=np.float32)

        adapter = object.__new__(mn3.Mn3CpuAdapter)
        adapter.net = InvalidNet()
        result = adapter.infer_patch(mn3.synthetic_patch("constant"))
        self.assertEqual(result["reason"], "MODEL_OUTPUT_INVALID")
        self.assertIsNone(result["probabilities"])
        self.assertIsNone(result["prediction"])

    def test_trial_id_is_sanitized_before_model_load(self):
        with patch.object(mn3, "Mn3CpuAdapter", side_effect=AssertionError("Model load before validation")):
            result = mn3.run_smoke(Path("not-read"), "person@example.invalid")
        self.assertEqual(result["reason"], "TRIAL_ID_INVALID")
        self.assertIsNone(result["trial_id"])
        self.assertNotIn("example.invalid", json.dumps(result))

    def test_cli_error_and_refusal_to_overwrite_evidence(self):
        with tempfile.TemporaryDirectory() as directory:
            result_path = Path(directory) / "result.json"
            with contextlib.redirect_stdout(io.StringIO()):
                code = mn3.main(["--model", str(Path(directory) / "missing"), "--output", str(result_path)])
            self.assertEqual(code, 2)
            before = result_path.read_bytes()
            with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                mn3.main(["--output", str(result_path)])
            self.assertEqual(result_path.read_bytes(), before)


if __name__ == "__main__":
    unittest.main(verbosity=2)
