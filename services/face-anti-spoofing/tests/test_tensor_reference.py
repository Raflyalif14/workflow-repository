"""Stage 9D: exact upstream ndarray conversion, synthetic pixels, CPU only."""
import hashlib
import importlib.util
import json
from pathlib import Path
import unittest

import numpy as np
import torch

import offline_pad as pad


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("minivision_functional_reference", ROOT / "reference/functional.py")
reference = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reference)


class TensorReferenceTests(unittest.TestCase):
    def test_pinned_reference_integrity(self):
        meta = json.loads((ROOT / "reference/functional.sources.json").read_text(encoding="utf-8"))
        text = (ROOT / "reference/functional.py").read_text(encoding="utf-8")
        self.assertEqual(meta["commit"], pad.UPSTREAM_COMMIT)
        self.assertIn("/" + pad.UPSTREAM_COMMIT + "/", meta["source"])
        self.assertEqual(meta["upstream_path"], "src/data_io/functional.py")
        self.assertEqual(hashlib.sha256(text.encode("utf-8")).hexdigest(), meta["sha256_lf_utf8"])

    def test_runtime_is_cpu_and_environment_isolation(self):
        import sys
        self.assertTrue(torch.__version__.endswith("+cpu"))
        self.assertIsNone(torch.version.cuda)
        self.assertNotEqual(sys.prefix, sys.base_prefix)
        self.assertEqual(torch.from_numpy(np.zeros((1,), np.uint8)).device.type, "cpu")

    def test_patterned_crops_are_identical_to_original_function(self):
        y, x = np.indices((320, 240))
        frame = np.stack((x % 256, y % 256, (x + 3 * y) % 256), axis=2).astype(np.uint8)
        before = frame.copy()
        boxes = ([105, 125, 30, 30], [0, 0, 20, 30], [220, 290, 20, 30],
                 [102.5, 91.25, 27.75, 38.5], [0, 0, 240, 320])
        for bbox in boxes:
            for scale in (2.7, 4.0):
                with self.subTest(bbox=bbox, scale=scale):
                    patch, actual, _ = pad.prepare_patch(frame, bbox, scale)
                    expected = reference.to_tensor(patch).unsqueeze(0)
                    self.assertEqual(expected.dtype, torch.float32)
                    self.assertEqual(expected.device.type, "cpu")
                    self.assertEqual(tuple(expected.shape), (1, 3, 80, 80))
                    self.assertEqual(actual.dtype, np.float32)
                    np.testing.assert_array_equal(actual, expected.numpy())
                    np.testing.assert_array_equal(actual[0, 0], patch[:, :, 0].astype(np.float32))
        np.testing.assert_array_equal(frame, before)

    def test_bgr_and_extremes_have_no_normalization(self):
        frame = np.empty((320, 240, 3), dtype=np.uint8)
        for color in ([7, 99, 255], [0, 128, 255], [255, 0, 7]):
            frame[:] = color
            patch, actual, _ = pad.prepare_patch(frame, [100, 100, 30, 30], 2.7)
            expected = reference.to_tensor(patch).unsqueeze(0)
            np.testing.assert_array_equal(actual, expected.numpy())
            for channel, value in enumerate(color):
                np.testing.assert_array_equal(actual[0, channel], np.full((80, 80), value, np.float32))
        self.assertEqual(float(expected.max()), 255.0)
        self.assertEqual(float(expected.min()), 0.0)

    def test_reference_accepts_noncontiguous_bgr_input_without_mirroring(self):
        y, x = np.indices((80, 80))
        patch = np.stack((x, y, x + y), axis=2).astype(np.uint8)
        # A strided view, still in the original left-to-right pixel order.
        padded = np.zeros((80, 160, 3), dtype=np.uint8)
        padded[:, ::2] = patch
        view = padded[:, ::2]
        self.assertFalse(view.flags.c_contiguous)
        converted = reference.to_tensor(view).unsqueeze(0).numpy()
        expected = np.ascontiguousarray(view.transpose(2, 0, 1)[None], dtype=np.float32)
        np.testing.assert_array_equal(converted, expected)
        self.assertLess(float(converted[0, 0, 0, 0]), float(converted[0, 0, 0, -1]))


if __name__ == "__main__":
    unittest.main()
