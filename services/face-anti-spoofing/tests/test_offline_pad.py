"""Synthetic Stage 9B checks only. No face photos, detector, weights or inference."""
import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import cv2
import numpy as np

import offline_pad as pad


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("minivision_crop_reference", ROOT / "reference/generate_patches.py")
reference = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reference)


def synthetic_frame():
    y, x = np.indices((320, 240))
    return np.stack((x % 256, y % 256, (x + 3 * y) % 256), axis=2).astype(np.uint8)


def outputs(vector_a, vector_b=None):
    return {pad.MODELS[0]["name"]: vector_a, pad.MODELS[1]["name"]: vector_a if vector_b is None else vector_b}


class PreprocessingTests(unittest.TestCase):
    def test_reference_source_integrity(self):
        sources = json.loads((ROOT / "reference/sources.json").read_text(encoding="utf-8"))
        self.assertEqual(sources["commit"], pad.UPSTREAM_COMMIT)
        for item in sources["files"]:
            text = (ROOT / "reference" / item["path"]).read_text(encoding="utf-8")
            self.assertEqual(hashlib.sha256(text.encode("utf-8")).hexdigest(), item["sha256_lf_utf8"])
            self.assertIn(pad.UPSTREAM_COMMIT, item["source"])

    def assert_reference(self, frame, bbox, scale):
        actual, tensor, corners = pad.prepare_patch(frame, bbox, scale)
        expected = reference.CropImage().crop(frame, bbox, scale, 80, 80)
        np.testing.assert_array_equal(actual, expected)
        self.assertEqual(corners, reference.CropImage._get_new_box(frame.shape[1], frame.shape[0], bbox, scale))
        self.assertEqual(tensor.shape, (1, 3, 80, 80))

    def test_centre_geometry_and_both_scales(self):
        frame = synthetic_frame()
        for scale in (2.7, 4.0):
            self.assert_reference(frame, [105, 125, 30, 30], scale)
        self.assertEqual(pad.prepare_patch(frame, [105, 125, 30, 30], 2.7)[2], (79, 99, 160, 180))
        self.assertEqual(pad.prepare_patch(frame, [105, 125, 30, 30], 4.0)[2], (60, 80, 180, 200))

    def test_all_edges_and_scale_clamp_match_reference(self):
        frame = synthetic_frame()
        for bbox in ([0, 0, 20, 30], [220, 290, 20, 30], [220, 0, 20, 30],
                     [0, 290, 20, 30], [0, 0, 240, 320], [102.5, 91.25, 27.75, 38.5]):
            for scale in (2.7, 4.0):
                with self.subTest(bbox=bbox, scale=scale):
                    self.assert_reference(frame, bbox, scale)

    def test_random_valid_boxes_match_reference(self):
        frame = synthetic_frame()
        rng = np.random.default_rng(42)
        for _ in range(30):
            w, h = int(rng.integers(1, 241)), int(rng.integers(1, 321))
            bbox = [int(rng.integers(0, 241 - w)), int(rng.integers(0, 321 - h)), w, h]
            for scale in (2.7, 4.0):
                self.assert_reference(frame, bbox, scale)

    def test_bgr_float32_nchw_without_normalization_or_mirror(self):
        frame = np.empty((320, 240, 3), dtype=np.uint8)
        frame[:] = [7, 99, 255]
        frame_before = frame.copy()
        _, tensor, _ = pad.prepare_patch(frame, [80, 90, 20, 30], 2.7)
        self.assertEqual(tensor.dtype, np.float32)
        self.assertTrue(tensor.flags.c_contiguous)
        for channel, expected in enumerate((7, 99, 255)):
            np.testing.assert_array_equal(tensor[0, channel], np.full((80, 80), expected, dtype=np.float32))
        np.testing.assert_array_equal(frame, frame_before)
        patterned = synthetic_frame()
        patch_image, tensor, _ = pad.prepare_patch(patterned, [20, 40, 15, 25], 4.0)
        self.assertLess(float(tensor[0, 0, 0, 0]), float(tensor[0, 0, 0, -1]))
        np.testing.assert_array_equal(tensor[0, 2], patch_image[:, :, 2])

    def test_invalid_bbox_is_rejected_before_resize(self):
        invalid = [None, [], [0, 0, 0, 20], [0, 0, 20, -1], [-1, 0, 20, 20],
                   [230, 0, 20, 20], [0, 310, 20, 20], [0, 0, float("nan"), 10],
                   [0, float("inf"), 10, 10], [True, 0, 10, 10]]
        with patch.object(pad.cv2, "resize", side_effect=AssertionError("invalid input reached resize")):
            for bbox in invalid:
                with self.subTest(bbox=bbox), self.assertRaises(pad.PreparationError) as error:
                    pad.prepare_patch(synthetic_frame(), bbox, 2.7)
                self.assertEqual(error.exception.reason, "BBOX_INVALID")

    def test_invalid_frame_and_scale(self):
        for frame in (None, np.zeros((320, 240), np.uint8), np.zeros((320, 240, 3), np.float32),
                      np.zeros((1, 1, 3), np.uint8), np.zeros((320, 240, 4), np.uint8)):
            with self.subTest(shape=getattr(frame, "shape", None)), self.assertRaises(pad.PreparationError):
                pad.prepare_patch(frame, [1, 1, 10, 10], 2.7)
        with self.assertRaises(pad.PreparationError) as error:
            pad.prepare_patch(synthetic_frame(), [10, 10, 10, 10], 1.0)
        self.assertEqual(error.exception.reason, "CROP_SCALE_UNSUPPORTED")

    def test_16_9_refused_without_modifying_frame(self):
        frame = np.full((360, 640, 3), 11, np.uint8)
        with patch.object(pad.cv2, "resize", side_effect=AssertionError("ratio was silently adapted")):
            result = pad.run_preparation("synthetic-ratio", frame, [10, 10, 30, 30])
        self.assertEqual((result["status"], result["reason"]), ("INCONCLUSIVE", "FRAME_RATIO_UNSUPPORTED"))
        self.assertIsNone(result["prediction"])
        np.testing.assert_array_equal(frame, np.full_like(frame, 11))

    @unittest.skipUnless(importlib.util.find_spec("torch"), "PyTorch not installed: upstream ToTensor runtime parity unverified")
    def test_optional_pytorch_ndarray_conversion(self):
        # Numeric operation from functional.py lines 53/56, NOT a model forward.
        # This does not import the full upstream transform/model package.
        import torch
        patch_image, actual, _ = pad.prepare_patch(synthetic_frame(), [10, 20, 20, 30], 2.7)
        expected = torch.from_numpy(patch_image.transpose((2, 0, 1))).float().unsqueeze(0).numpy()
        np.testing.assert_array_equal(actual, expected)


class SyntheticAggregationTests(unittest.TestCase):
    def test_each_class_mapping(self):
        for label in range(3):
            vector = [0.1, 0.1, 0.1]
            vector[label] = 0.8
            result = pad.aggregate_synthetic_outputs(outputs(vector))
            self.assertEqual(result["combined"]["class_index"], label)
            self.assertEqual(result["prediction"], "LIVE" if label == 1 else "SPOOF")
            self.assertEqual(result["evidence"], "SYNTHETIC_LOGIC_ONLY")

    def test_ensemble_uses_both_models_and_correct_denominator(self):
        result = pad.aggregate_synthetic_outputs(outputs([0.1, 0.8, 0.1], [0.2, 0.3, 0.5]))
        np.testing.assert_allclose(result["combined"]["probabilities"], [0.15, 0.55, 0.30], rtol=0, atol=1e-15)
        self.assertEqual(result["combined"]["winning_score"], (0.8 + 0.3) / 2)
        expected = np.array([[0.1, 0.8, 0.1]]) + np.array([[0.2, 0.3, 0.5]])
        self.assertEqual(result["combined"]["class_index"], int(np.argmax(expected)))
        self.assertEqual(len(result["per_model"]), 2)

    def test_missing_extra_models_and_invalid_scores_never_predict(self):
        bad = [{}, {pad.MODELS[0]["name"]: [0, 1, 0]}, {**outputs([0, 1, 0]), "extra": [0, 1, 0]}]
        for vector in ([float("nan"), 1, 0], [float("inf"), 0, 0], [0, 0, 0], [-0.1, 1.1, 0],
                       [1, 0], ["0", "1", "0"], [False, True, False]):
            bad.append(outputs(vector))
        for data in bad:
            with self.subTest(data=data):
                result = pad.aggregate_synthetic_outputs(data)
                self.assertEqual(result["status"], "ERROR")
                self.assertIsNone(result["combined"])
                self.assertIsNone(result["prediction"])
                json.dumps(result, allow_nan=False)

    def test_tie_is_inconclusive_not_upstream_first_index(self):
        result = pad.aggregate_synthetic_outputs(outputs([0.5, 0.5, 0]))
        self.assertEqual((result["status"], result["reason"]), ("INCONCLUSIVE", "CLASS_TIE"))
        self.assertIsNone(result["prediction"])
        self.assertIsNone(result["combined"])


class RunnerTests(unittest.TestCase):
    def test_unavailable_model_retains_trial_but_no_fake_predictions(self):
        frame = synthetic_frame()
        before = frame.copy()
        with patch.object(pad, "aggregate_synthetic_outputs", side_effect=AssertionError("fixture utility used by runner")):
            result = pad.run_preparation("trial-9B-01", frame, [100, 100, 20, 30])
        self.assertEqual(result["trial_id"], "trial-9B-01")
        self.assertEqual((result["status"], result["reason"]), ("ERROR", "MODEL_UNAVAILABLE"))
        self.assertIsNone(result["prediction"])
        self.assertIsNone(result["combined"])
        self.assertEqual(len(result["prepared"]), 2)
        self.assertFalse(result["provenance"]["model_inference_enabled"])
        self.assertIsNone(result["provenance"]["torch"])
        for item in result["per_model"]:
            self.assertEqual(item["status"], "NOT_RUN")
            self.assertIsNone(item["probabilities"])
            self.assertIsNone(item["duration_ms"])
        self.assertGreaterEqual(result["duration_ms"], 0)
        self.assertIn("+00:00", result["started_at"])
        np.testing.assert_array_equal(frame, before)
        encoded = json.dumps(result, allow_nan=False)
        self.assertNotIn("embedding", encoded)

    def test_detector_unavailable(self):
        result = pad.run_preparation("trial-no-detector", synthetic_frame())
        self.assertEqual(result["reason"], "DETECTOR_UNAVAILABLE")
        self.assertEqual(result["prepared"], [])
        self.assertIsNone(result["prediction"])

    def test_processing_error_is_sanitized_and_resources_cleared(self):
        temporary_patch = np.ones((80, 80, 3), np.uint8)
        temporary_tensor = np.ones((1, 3, 80, 80), np.float32)
        with patch.object(pad, "prepare_patch", side_effect=[(temporary_patch, temporary_tensor, (0, 0, 10, 10)),
                                                           RuntimeError("private/path/should/not/leak")]):
            result = pad.run_preparation("trial-error", synthetic_frame(), [10, 20, 20, 30])
        self.assertEqual(result["reason"], "PREPROCESSING_FAILED")
        self.assertEqual(result["prepared"], [])
        self.assertIsNone(result["prediction"])
        self.assertEqual(np.count_nonzero(temporary_patch), 0)
        self.assertEqual(np.count_nonzero(temporary_tensor), 0)
        self.assertNotIn("private/path", json.dumps(result))

    def test_bad_trial_code_does_not_echo_input(self):
        result = pad.run_preparation("someone@example.invalid", synthetic_frame())
        self.assertEqual(result["reason"], "TRIAL_ID_INVALID")
        self.assertIsNone(result["trial_id"])

    def test_cli_temporary_synthetic_frame_only_and_no_output_files(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "synthetic.png"
            cv2.imwrite(str(path), synthetic_frame())
            stream = io.StringIO()
            with contextlib.redirect_stdout(stream):
                code = pad.main(["--trial-id", "cli-synthetic", "--frame", str(path), "--bbox", "100", "100", "20", "30"])
            result = json.loads(stream.getvalue())
            self.assertEqual(code, 2)
            self.assertEqual(result["reason"], "MODEL_UNAVAILABLE")
            self.assertNotIn(str(path), stream.getvalue())
            self.assertEqual(list(Path(directory).iterdir()), [path])

    def test_corrupt_or_missing_input_and_size_limit(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "synthetic.bin"
            cases = [(None, "FRAME_READ_FAILED"), (b"invalid", "FRAME_INVALID"),
                     (b"0" * (4 * 1024 * 1024 + 1), "FRAME_BYTES_EXCEEDED")]
            for contents, reason in cases:
                if contents is not None:
                    path.write_bytes(contents)
                stream = io.StringIO()
                with contextlib.redirect_stdout(stream):
                    self.assertEqual(pad.main(["--trial-id", "cli-error", "--frame", str(path)]), 2)
                result = json.loads(stream.getvalue())
                self.assertEqual(result["reason"], reason)
                self.assertIsNone(result["prediction"])


if __name__ == "__main__":
    unittest.main()
