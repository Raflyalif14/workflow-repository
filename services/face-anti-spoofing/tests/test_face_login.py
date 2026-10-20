from pathlib import Path
import sys
import unittest
from unittest.mock import patch, Mock
import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import face_login_inference as login


class LoginTests(unittest.TestCase):
    def test_passive_mode_is_evaluation_only_and_motion_stays_required_for_login(self):
        vector = np.zeros(128, np.float32); vector[0] = 1
        recognizer = Mock()
        recognizer.alignCrop.side_effect = lambda *_: np.zeros((112,112,3), np.uint8)
        recognizer.feature.side_effect = lambda *_: vector.copy()
        with patch.object(login, 'verify_models'), patch.object(login.pad, 'detector_bytes', return_value=np.zeros(1,np.uint8)), \
             patch.object(login.cv2, 'FaceDetectorYN'), patch.object(login.cv2, 'FaceRecognizerSF') as factory, \
             patch.object(login, 'decode_image', side_effect=lambda *_: np.zeros((480,640,3),np.uint8)), \
             patch.object(login, 'detect', side_effect=lambda *_: (np.zeros(15,np.float32), 0.0)), \
             patch.object(login.candidate, 'infer', return_value={'models':[{'classes':[.01,.98,.01]}]*2}):
            factory.create.return_value=recognizer
            frames=[b'first',b'second',b'third']
            result=login.inspect(frames,'left',vector.tolist(),mode='passive-test')
            self.assertEqual(result['status'],'EVALUATED'); self.assertEqual(len(result['frames']),3)
            self.assertNotIn('embedding',result)
            with self.assertRaises(login.InputError) as error: login.inspect(frames,'left',vector.tolist())
            self.assertEqual(error.exception.code,'FACE_MOTION_REQUIRED')
        with self.assertRaises(login.InputError): login.inspect(frames,'left',mode='passive-test')
        with self.assertRaises(login.InputError): login.inspect(frames,'left',vector.tolist(),mode='unknown')

    def test_motion_is_directional_and_requires_return(self):
        login.verify_motion([0, .2, .02], 'left')
        login.verify_motion([0, -.2, .02], 'right')
        for yaws, direction in (([0, 0, 0], 'left'), ([0, -.2, 0], 'left'), ([0, .2, .3], 'left'), ([.4, .6, .4], 'left'), ([0, float('nan'), 0], 'left')):
            with self.assertRaises(login.InputError): login.verify_motion(yaws, direction)

    def test_both_models_must_pass_instead_of_best_score(self):
        login.check_live({'models': [{'classes': [.01, .98, .01]}, {'classes': [.02, .95, .03]}]})
        for classes in ([.1, .45, .45], [.25, .5, .25], [.8, .1, .1]):
            with self.assertRaises(login.InputError): login.check_live({'models': [{'classes': [.01, .98, .01]}, {'classes': classes}]})

    def test_repeated_input_rejected_before_models(self):
        with patch.object(login, 'verify_models') as verify:
            with self.assertRaises(login.InputError): login.inspect([b'same']*3, 'left')
            verify.assert_not_called()

    def test_actual_models_blank_and_static_face_fail_closed(self):
        blanks = [cv2.imencode('.png', np.full((480,640,3), n, np.uint8))[1].tobytes() for n in (0, 20, 40)]
        with self.assertRaises(login.InputError) as error: login.inspect(blanks, 'left')
        self.assertEqual(error.exception.code, 'FACE_NONE')
        image = cv2.imread(str(ROOT.parent / 'face-experiment/tests/fixtures/same-person-a.jpg'))
        frames = [cv2.imencode('.png', np.clip(image.astype(np.int16)+n,0,255).astype(np.uint8))[1].tobytes() for n in (0,1,2)]
        with self.assertRaises(login.InputError) as error: login.inspect(frames, 'left')
        self.assertIn(error.exception.code, ('FACE_MOTION_REQUIRED', 'FACE_LIVENESS_FAILED', 'FACE_POSITION_REQUIRED'))


if __name__ == '__main__': unittest.main()
