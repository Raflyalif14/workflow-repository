"""Same-capture diagnostic checks; synthetic input and public fixture only."""
import hashlib
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import diagnose_capture as capture


class CaptureTests(unittest.TestCase):
    def test_reference_keeps_channels_byte_scale_and_input(self):
        source = np.full((12, 19, 3), [17, 99, 231], np.uint8)
        tensor = capture.reference_tensor(source)
        expected = [(231-151.2405)/63.0105, (99-119.5950)/56.4570, (17-107.8395)/55.0035]
        np.testing.assert_allclose(tensor[0, :, 0, 0], expected, rtol=1e-6)
        self.assertEqual(tensor.shape, (1, 3, 128, 128))
        self.assertTrue(tensor.flags.c_contiguous)
        np.testing.assert_array_equal(source[0, 0], [17, 99, 231])
        tensor.fill(0)

    def test_rectangles_are_fixed_and_clipped(self):
        frame = np.empty((128, 160, 3), np.uint8)
        self.assertEqual(capture.comparison_rect(frame, [20.5, 10.5, 100, 100], True),
                         dict(left=15, top=7, right=125, bottom=112))
        self.assertEqual(capture.comparison_rect(frame, [0, 0, 160, 128], True),
                         dict(left=0, top=0, right=160, bottom=128))
        with self.assertRaises(capture.mn3.Mn3Error):
            capture.comparison_rect(frame, [200, 200, 5, 5], False)

    def test_invalid_format_never_loads_models(self):
        with patch.object(capture, "load_runtimes") as load:
            for data in [b"", b"not-an-image", b"\xff\xd8\xff"]:
                result = capture.analyse_capture(data)
                self.assertEqual(result, {"status": "ERROR", "reason": "FACE_IMAGE_INVALID", "prediction": None})
            load.assert_not_called()

    def test_failure_wipes_decoded_pixels_and_hides_exception(self):
        pixels = np.full((128, 128, 3), 100, np.uint8)
        decoded = pixels.copy()
        with patch.object(capture.pad, "decode_image", return_value=pixels), \
             patch.object(capture.cv2, "imdecode", return_value=decoded), \
             patch.object(capture.pad, "detector_bytes", side_effect=RuntimeError("private detail")):
            result = capture.analyse_capture(b"\x89PNG\r\n\x1a\nsynthetic")
        self.assertEqual(result, {"status": "ERROR", "reason": "PAD_PROCESS_FAILED", "prediction": None})
        self.assertFalse(pixels.any())
        self.assertFalse(decoded.any())

    def test_public_fixture_matches_production_without_selecting_a_crop(self):
        source = capture.pad.IDENTITY_ROOT / "tests/fixtures/same-person-a.jpg"
        frame = cv2.imread(str(source))
        ok, png = cv2.imencode(".png", frame)
        self.assertTrue(ok)
        data = png.tobytes()
        result = capture.analyse_capture(data)
        self.assertEqual(result["status"], "SUCCESS")
        self.assertEqual(result["imageSha256"], hashlib.sha256(data).hexdigest())
        self.assertEqual(result["decoderMaxDifference"], 0)
        self.assertEqual(result["preprocessingMaxDifference"], 0)
        self.assertIsNone(result["prediction"])
        self.assertEqual([r["id"] for r in result["cropResults"]], ["CURRENT", "REFERENCE_RECT", "FACE_BOX"])
        self.assertTrue(all(r["runtimeMatches"] and r["deterministic"] for r in result["cropResults"]))
        # Independent production adapter on the exact CURRENT rectangle.
        rect = result["cropResults"][0]["rect"]
        roi = frame[rect["top"]:rect["bottom"], rect["left"]:rect["right"]].copy()
        production = capture.mn3.Mn3CpuAdapter(capture.mn3.DEFAULT_MODEL).infer_patch(roi)
        np.testing.assert_allclose(production["probabilities"],
                                   list(result["cropResults"][0]["opencv"].values()), atol=1e-7, rtol=0)
        for value in [frame, png, roi]:
            value.fill(0)


if __name__ == "__main__":
    unittest.main()
