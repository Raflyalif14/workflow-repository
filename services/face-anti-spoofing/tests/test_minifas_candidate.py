"""Candidate wiring checks; public/synthetic fixtures are not PAD accuracy evidence."""
import hashlib
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import minifas_candidate as candidate
from reference.generate_patches import CropImage


class CandidateTests(unittest.TestCase):
    def test_preprocessing_matches_upstream_pixels(self):
        rng = np.random.default_rng(142)
        for width, height in ((640, 480), (480, 640), (513, 511)):
            frame = rng.integers(0, 256, (height, width, 3), dtype=np.uint8)
            for box in ((100, 80, 140, 190), (1, 2, 140, 190), (width-151, height-201, 140, 190)):
                for scale in (2.7, 4):
                    with self.subTest(width=width, height=height, box=box, scale=scale):
                        expected = CropImage().crop(frame, box, scale, 80, 80)
                        actual, rect = candidate.prepare(frame, box, scale)
                        np.testing.assert_array_equal(actual, expected.transpose(2, 0, 1)[None].astype(np.float32))
                        left, top, right, bottom = CropImage._get_new_box(width, height, box, scale)
                        self.assertEqual(rect, dict(left=left, top=top, right=right+1, bottom=bottom+1))
                        self.assertGreater(float(actual.max()), 1, 'BGR byte range is retained')

    def test_untrusted_model_bytes_rejected_before_runtime(self):
        with patch.object(Path, 'read_bytes', return_value=b'invalid'), patch.object(candidate.ort, 'InferenceSession') as runtime:
            with self.assertRaises(candidate.mn3.Mn3Error):
                candidate.load_model(candidate.MODELS[0])
            runtime.assert_not_called()

    def test_class_one_and_two_model_average(self):
        class Model:
            def __init__(self, probabilities): self.probabilities = probabilities
            def run(self, *_): return [np.array([self.probabilities], dtype=np.float32)]
        with patch.object(candidate, 'load_model', side_effect=[Model([.2, .7, .1]), Model([.1, .3, .6])]):
            result = candidate.infer(np.zeros((480, 640, 3), np.uint8), [100, 100, 140, 190])
        self.assertAlmostEqual(result['probabilities']['real'], .5, places=7)
        self.assertAlmostEqual(result['probabilities']['spoof'], .5, places=7)
        self.assertEqual(len(result['models']), 2)

    def test_invalid_output_fails(self):
        class Model:
            def run(self, *_): return [np.array([[0, np.nan, 1]], dtype=np.float32)]
        with patch.object(candidate, 'load_model', return_value=Model()):
            with self.assertRaises(candidate.mn3.Mn3Error):
                candidate.infer(np.zeros((480, 640, 3), np.uint8), [100, 100, 140, 190])

    def test_actual_pinned_pipeline_and_no_face(self):
        content = (ROOT.parent / 'face-experiment/tests/fixtures/same-person-a.jpg').read_bytes()
        result = candidate.inspect_candidate(content)
        self.assertEqual(result['status'], 'SUCCESS')
        self.assertIsNone(result['prediction'])
        self.assertEqual(result['imageSha256'], hashlib.sha256(content).hexdigest())
        self.assertAlmostEqual(result['baseline']['real'], .8580116034, places=5)
        self.assertAlmostEqual(result['candidate']['probabilities']['real'], .7488130331, places=5)
        blank = cv2.imencode('.png', np.zeros((480, 640, 3), np.uint8))[1].tobytes()
        self.assertEqual(candidate.inspect_candidate(blank)['reason'], 'FACE_NONE')
        self.assertEqual(candidate.inspect_candidate(b'not-an-image')['status'], 'ERROR')


if __name__ == '__main__':
    unittest.main()
