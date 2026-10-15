"""Stage9G crop, full-frame guards, cleanup and process deadline; synthetic pixels only."""
import io
import sys
import time
import unittest
from pathlib import Path
from unittest.mock import patch
import numpy as np
from PIL import Image
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import pad_inference as pad
from pad_server import run_bounded, PadServer
from mn3_offline import prepare_patch

def hanging_child(payload, connection):
    time.sleep(10)

class Detector:
    def __init__(self, boxes):
        self.faces = None if not boxes else np.array([list(b) + [0] * 10 + [0.95] for b in boxes], np.float32)
    def setInputSize(self, size):
        self.size = size
    def detect(self, frame):
        self.frame = frame
        return None, self.faces

class PadCameraTests(unittest.TestCase):
    def test_context_crop_center_exact_pixels_no_mirror(self):
        frame = np.arange(200 * 240 * 3, dtype=np.uint32).reshape(200, 240, 3).astype(np.uint8)
        copy = frame.copy()
        crop = pad.crop_frame(frame, [80, 60, 40, 60])
        np.testing.assert_array_equal(crop, frame[54:126, 64:136])
        np.testing.assert_array_equal(frame, copy)
        self.assertEqual(prepare_patch(crop).shape, (1, 3, 128, 128))

    def test_edge_context_clips_without_shift_padding_or_warp(self):
        frame = np.zeros((200, 240, 3), np.uint8)
        self.assertEqual(pad.crop_frame(frame, [0, 0, 40, 60]).shape, (66, 56, 3))
        self.assertEqual(pad.crop_frame(frame, [200, 140, 40, 60]).shape, (66, 56, 3))

    def test_invalid_boxes_rejected(self):
        for box in ([1, 2, 0, 2], [-1, 2, 3, 3], [230, 0, 40, 60], [0, 0, float('nan'), 2], [1, 2, 3], [0, 0, 1, float('inf')]):
            with self.subTest(box=box), self.assertRaises(pad.Mn3Error):
                pad.crop_frame(np.zeros((200, 240, 3), np.uint8), box)

    def test_detector_scaled_to_original_coordinates_and_cleared(self):
        detector = Detector([[30, 20, 100, 50]])
        box = pad.detect_box(np.zeros((720, 1280, 3), np.uint8), detector)
        np.testing.assert_array_equal(box, [60, 40, 200, 100])
        self.assertEqual(detector.size, (640, 360))
        self.assertFalse(detector.frame.any())
        self.assertFalse(detector.faces.any())

    def test_zero_and_multiple_no_adapter(self):
        for boxes, code in (([], 'FACE_NONE'), ([[20, 20, 30, 30]] * 2, 'FACE_MULTIPLE')):
            with patch.object(pad, 'decode_image', return_value=np.ones((200, 240, 3), np.uint8)), patch.object(pad, 'detector_bytes', return_value=np.empty(0, np.uint8)), patch.object(pad.cv2.FaceDetectorYN, 'create', return_value=Detector(boxes)), patch.object(pad, 'Mn3CpuAdapter') as adapter:
                result = pad.inspect_photo(b'synthetic')
                self.assertEqual(result['reason'], code)
                self.assertIsNone(result['probabilities'])
                self.assertIsNone(result['prediction'])
                adapter.assert_not_called()

    def test_invalid_detection_bbox_fails_before_model(self):
        with patch.object(pad, 'decode_image', return_value=np.ones((200, 240, 3), np.uint8)), patch.object(pad, 'detector_bytes', return_value=np.empty(0, np.uint8)), patch.object(pad.cv2.FaceDetectorYN, 'create', return_value=Detector([[-10, 20, 30, 30]])), patch.object(pad, 'Mn3CpuAdapter') as adapter:
            self.assertEqual(pad.inspect_photo(b'x')['reason'], 'PAD_BBOX_INVALID')
            adapter.assert_not_called()

    def test_one_face_full_frame_context_and_cleanup(self):
        frame = np.ones((200, 240, 3), np.uint8) * 40
        captured = []
        class Adapter:
            def __init__(self, _): pass
            def infer_patch(self, crop):
                captured.append(crop)
                self.assertion = crop.shape == (72, 72, 3)
                return {'status': 'SUCCESS', 'probabilities': [0.2, 0.8]}
        with patch.object(pad, 'decode_image', return_value=frame), patch.object(pad, 'detector_bytes', return_value=np.empty(0, np.uint8)), patch.object(pad.cv2.FaceDetectorYN, 'create', return_value=Detector([[80, 60, 40, 60]])), patch.object(pad, 'Mn3CpuAdapter', Adapter):
            result = pad.inspect_photo(b'synthetic-original-full-frame')
        self.assertEqual(result['status'], 'SUCCESS')
        self.assertEqual(captured[0].shape, (72, 72, 3))
        self.assertEqual(result['probabilities'], {'real': 0.2, 'spoof': 0.8})
        self.assertFalse(frame.any()); self.assertFalse(captured[0].any())
        self.assertNotIn('embedding', result)
        self.assertEqual(result['provenance']['cropVersion'], pad.CROP_VERSION)

    def test_missing_model_and_exception_no_scores_safe_reason(self):
        for error, reason in ((pad.Mn3Error('MODEL_UNAVAILABLE'), 'PAD_MODEL_UNAVAILABLE'), (RuntimeError('private payload'), 'PAD_PROCESS_FAILED')):
            with patch.object(pad, 'decode_image', return_value=np.ones((200, 240, 3), np.uint8)), patch.object(pad, 'detector_bytes', return_value=np.empty(0, np.uint8)), patch.object(pad.cv2.FaceDetectorYN, 'create', return_value=Detector([[80, 60, 40, 60]])), patch.object(pad, 'Mn3CpuAdapter', side_effect=error):
                result = pad.inspect_photo(b'x')
            self.assertEqual(result['reason'], reason)
            self.assertIsNone(result['probabilities']); self.assertIsNone(result['prediction'])
            self.assertNotIn('private', str(result))

    def test_corrupt_image_and_dimensions_fail(self):
        self.assertEqual(pad.inspect_photo(b'not an image')['reason'], 'FACE_IMAGE_INVALID')
        data = io.BytesIO(); Image.new('RGB', (64, 64)).save(data, 'PNG')
        self.assertEqual(pad.inspect_photo(data.getvalue())['reason'], 'FACE_INPUT_LIMIT')

    def test_timeout_and_cancel_terminate_owned_child(self):
        import multiprocessing as mp
        before = {p.pid for p in mp.active_children()}
        for cancelled in (lambda: False, lambda: True):
            result = run_bounded(b'x', timeout=0.15, target=hanging_child, cancelled=cancelled)
            self.assertEqual(result['code'], 'FACE_TIMEOUT')
            self.assertEqual({p.pid for p in mp.active_children()}, before)

    def test_server_refuses_non_loopback_and_short_key(self):
        for host, key in (('0.0.0.0', 'x' * 64), ('127.0.0.1', 'short')):
            with self.assertRaises(ValueError): PadServer((host, 0), key)

    def test_center_crop_diagnostics_are_actual_coordinates_and_roi(self):
        d = pad.empty_diagnostics()
        patch_image = pad.crop_frame(np.zeros((200, 240, 3), np.uint8), [80, 60, 40, 60], d)
        self.assertEqual(d['cropBeforeClip'], {'left': 64, 'top': 54, 'right': 136, 'bottom': 126})
        self.assertEqual(d['cropAfterClip'], d['cropBeforeClip'])
        self.assertEqual(d['roi'], {'width': patch_image.shape[1], 'height': patch_image.shape[0]})
        self.assertEqual(d['clipped'], dict.fromkeys(('left', 'top', 'right', 'bottom'), False))

    def test_each_clipped_edge_matches_legacy_crop_pixels(self):
        frame = np.arange(200 * 240 * 3, dtype=np.uint32).reshape(200, 240, 3).astype(np.uint8)
        for bbox, edges in (([0, 0, 40, 60], ['left', 'top']), ([200, 140, 40, 60], ['right', 'bottom']), ([0, 80, 40, 60], ['left']), ([200, 80, 40, 60], ['right'])):
            d = pad.empty_diagnostics(); actual = pad.crop_frame(frame, bbox, d)
            x, y, bw, bh = bbox; side = max(bw, bh) * 1.2; cx, cy = x + bw / 2, y + bh / 2
            # Original pre-9I expressions, independent of diagnostic coordinates.
            left, top = max(0, int(np.floor(cx - side / 2))), max(0, int(np.floor(cy - side / 2)))
            right, bottom = min(240, int(np.ceil(cx + side / 2))), min(200, int(np.ceil(cy + side / 2)))
            np.testing.assert_array_equal(actual, frame[top:bottom, left:right])
            self.assertEqual([k for k, v in d['clipped'].items() if v], edges)
            self.assertEqual(d['roi'], {'width': right-left, 'height': bottom-top})

    def test_same_detection_provides_count_bbox_confidence_once(self):
        detector = Detector([[30, 20, 100, 50]])
        d = pad.empty_diagnostics()
        with patch.object(detector, 'detect', wraps=detector.detect) as detect:
            box = pad.detect_box(np.zeros((720, 1280, 3), np.uint8), detector, d)
            detect.assert_called_once()
        self.assertEqual(d['faceCount'], 1)
        self.assertEqual(d['bbox'], {'x': float(box[0]), 'y': float(box[1]), 'width': float(box[2]), 'height': float(box[3]), 'confidence': float(np.float32(.95))})
        self.assertFalse(detector.faces.any(), 'Diagnostic numbers survive existing face-buffer cleanup')

    def test_failures_keep_only_obtained_geometry(self):
        for boxes, error, count in (([], 'FACE_NONE', 0), ([[20,20,30,30]]*2, 'FACE_MULTIPLE', 2), ([[-1,20,30,30]], 'PAD_BBOX_INVALID', 1)):
            with patch.object(pad, 'decode_image', return_value=np.ones((200,240,3), np.uint8)), patch.object(pad, 'detector_bytes', return_value=np.empty(0,np.uint8)), patch.object(pad.cv2.FaceDetectorYN, 'create', return_value=Detector(boxes)):
                result = pad.inspect_photo(b'synthetic')
            self.assertEqual(result['reason'], error)
            d = result['diagnostics']; self.assertEqual(d['frame'], {'width':240,'height':200}); self.assertEqual(d['faceCount'], count)
            for k in ('bbox','cropBeforeClip','cropAfterClip','roi','clipped'): self.assertIsNone(d[k])
        d = pad.inspect_photo(b'broken')['diagnostics']
        for k, v in d.items():
            if k != 'version': self.assertIsNone(v)

    def test_detector_exception_has_frame_without_fake_zero_count(self):
        detector = Detector([])
        with patch.object(pad, 'decode_image', return_value=np.ones((200,240,3), np.uint8)), patch.object(pad, 'detector_bytes', return_value=np.empty(0,np.uint8)), patch.object(pad.cv2.FaceDetectorYN, 'create', return_value=detector), patch.object(detector, 'detect', side_effect=RuntimeError('private raw error')):
            result = pad.inspect_photo(b'synthetic')
        self.assertEqual(result['diagnostics']['frame'], {'width':240,'height':200})
        self.assertIsNone(result['diagnostics']['faceCount']); self.assertIsNone(result['probabilities'])
        self.assertNotIn('private', str(result))

    def test_missing_model_preserves_geometry_not_probability(self):
        with patch.object(pad, 'decode_image', return_value=np.ones((200,240,3), np.uint8)), patch.object(pad, 'detector_bytes', return_value=np.empty(0,np.uint8)), patch.object(pad.cv2.FaceDetectorYN, 'create', return_value=Detector([[80,60,40,60]])), patch.object(pad, 'Mn3CpuAdapter', side_effect=pad.Mn3Error('MODEL_UNAVAILABLE')):
            result = pad.inspect_photo(b'synthetic')
        self.assertEqual(result['reason'], 'PAD_MODEL_UNAVAILABLE'); self.assertIsNone(result['probabilities'])
        self.assertEqual(result['diagnostics']['roi'], {'width':72,'height':72})
        self.assertEqual(result['diagnostics']['faceCount'], 1)

    def test_nonfinite_confidence_is_null_without_changing_crop(self):
        detector = Detector([[80,60,40,60]]); detector.faces[0,14] = np.nan
        d = pad.empty_diagnostics(); frame = np.zeros((200,240,3),np.uint8)
        box = pad.detect_box(frame, detector, d); roi = pad.crop_frame(frame, box, d)
        self.assertIsNone(d['bbox']['confidence']); self.assertEqual(roi.shape, (72,72,3))

    def test_diagnostics_do_not_change_tensor_or_probability_mapping(self):
        import mn3_offline as mn3
        y,x = np.indices((200,240)); frame = np.stack((x%256,y%256,(x+y)%256),axis=2).astype(np.uint8)
        expected = mn3.prepare_patch(frame[54:126,64:136])
        class Net:
            def setInput(self, tensor, name): self.tensor = tensor.copy()
            def forward(self, name): return np.array([[.2,.8]],np.float32)
        adapter = object.__new__(mn3.Mn3CpuAdapter); adapter.net = Net()
        with patch.object(pad, 'decode_image', return_value=frame), patch.object(pad, 'detector_bytes', return_value=np.empty(0,np.uint8)), patch.object(pad.cv2.FaceDetectorYN, 'create', return_value=Detector([[80,60,40,60]])), patch.object(pad, 'Mn3CpuAdapter', return_value=adapter):
            result = pad.inspect_photo(b'synthetic')
        np.testing.assert_array_equal(adapter.net.tensor, expected)
        self.assertEqual(result['probabilities'], {'real':float(np.float32(.2)), 'spoof':float(np.float32(.8))})
        self.assertEqual(set(result['diagnostics']), {'version','frame','faceCount','bbox','cropBeforeClip','cropAfterClip','roi','clipped'})

if __name__ == '__main__':
    unittest.main(verbosity=2)
