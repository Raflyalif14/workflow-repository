"""Local, bounded camera verifier. Embeddings only cross the private stdin/stdout boundary.

Not a certified PAD system. Device signature is verified by Node before invoking us.
No raw capture persistence. Policy is versioned and is not fitted to camera examples.
"""
import hashlib
import json
import struct
import sys

import cv2
import numpy as np
import minifas_candidate as candidate
import pad_inference as pad
from inference import decode_image, InputError
from download_models import ROOT, verify_models

VERSION = 'webcam-device-minifas-sface-v1'
PASSIVE_VERSION = 'webcam-passive-evaluation-v1'
# Deliberately stricter than OpenCV's general LFW 0.363 example; not a measured FAR.
MIN_IDENTITY_COSINE = .60


def verify_motion(yaws, direction):
    if len(yaws) != 3 or not np.isfinite(yaws).all() or direction not in ('left', 'right'):
        raise InputError('FACE_MOTION_REQUIRED')
    sign = 1 if direction == 'left' else -1
    if abs(yaws[0]) > .22 or (yaws[1]-yaws[0])*sign < .12 or abs(yaws[2]-yaws[0]) > .12:
        raise InputError('FACE_MOTION_REQUIRED')


def check_live(result):
    # Both official classifiers must independently choose class 1 AND favour
    # real over combined attack classes. No score inversion, best-model selection
    # or camera-specific threshold fitting.
    for model in result['models']:
        attack_a, real, attack_b = model['classes']
        if real <= attack_a + attack_b:
            raise InputError('FACE_LIVENESS_FAILED')


def detect(image, detector):
    height, width = image.shape[:2]
    scale = min(1, 640/max(width, height))
    size = (max(1, round(width*scale)), max(1, round(height*scale)))
    small = cv2.resize(image, size)
    faces = None
    try:
        detector.setInputSize(size)
        _, faces = detector.detect(small)
        count = 0 if faces is None else len(faces)
        if count != 1:
            raise InputError('FACE_NONE' if count == 0 else 'FACE_MULTIPLE')
        face = faces[0].copy()
        face[[0, 2, 4, 6, 8, 10, 12]] *= width/size[0]
        face[[1, 3, 5, 7, 9, 11, 13]] *= height/size[1]
        x, y, w, h = face[:4]
        if not np.isfinite(face).all() or x < 0 or y < 0 or w < 80 or h < 80 or x+w > width or y+h > height:
            raise InputError('FACE_POSITION_REQUIRED')
        eye_distance = float(np.linalg.norm(face[4:6]-face[6:8]))
        if eye_distance < 25:
            raise InputError('FACE_POSITION_REQUIRED')
        yaw = (float(face[8]) - float((face[4]+face[6])/2))/eye_distance
        return face, yaw
    finally:
        small.fill(0)
        if faces is not None: faces.fill(0)


def inspect(frames, direction, template=None, mode='motion'):
    cv2.setNumThreads(1)
    if mode not in ('motion', 'passive-test') or mode == 'passive-test' and template is None:
        raise InputError('FACE_IMAGE_INVALID')
    if len(frames) != 3 or len({hashlib.sha256(f).digest() for f in frames}) != 3:
        raise InputError('FACE_IMAGE_INVALID')
    verify_models()
    detector = cv2.FaceDetectorYN.create('onnx', pad.detector_bytes(), np.empty(0, np.uint8), (640, 640), .9, .3, 5000)
    recognizer = cv2.FaceRecognizerSF.create(str(ROOT / 'models/face_recognition_sface_2021dec.onnx'), '')
    features, yaws, diagnostics = [], [], []
    reference = None
    try:
        if template is not None:
            reference = np.asarray(template, dtype=np.float32)
            if reference.shape != (128,) or not np.isfinite(reference).all() or abs(np.linalg.norm(reference)-1) > 1e-4:
                raise InputError('FACE_PROCESS_FAILED')
        for frame in frames:
            image = face = aligned = feature = None
            try:
                image = decode_image(frame, 'CAMERA')
                face, yaw = detect(image, detector)
                pad_result = candidate.infer(image, face[:4])
                if mode == 'motion': check_live(pad_result)
                yaws.append(yaw)
                aligned = recognizer.alignCrop(image, face)
                feature = recognizer.feature(aligned).reshape(-1)
                if feature.shape != (128,) or not np.isfinite(feature).all() or np.linalg.norm(feature) < 1e-8:
                    raise InputError('FACE_PROCESS_FAILED')
                feature /= np.linalg.norm(feature)
                same_first = float(np.dot(features[0], feature)) if features else 1.0
                same_template = float(np.dot(reference, feature)) if reference is not None else None
                if mode == 'motion' and features and same_first < MIN_IDENTITY_COSINE:
                    raise InputError('FACE_NO_MATCH')
                if mode == 'motion' and reference is not None and same_template < MIN_IDENTITY_COSINE:
                    raise InputError('FACE_NO_MATCH')
                if mode == 'passive-test':
                    diagnostics.append({'classes': [model['classes'] for model in pad_result['models']],
                                        'identity': same_template, 'consistency': same_first,
                                        'yaw': float(yaw)})
                features.append(feature.copy())
            finally:
                for value in (image, face, aligned, feature):
                    if value is not None: value.fill(0)
        if mode == 'passive-test':
            return {'status': 'EVALUATED', 'version': PASSIVE_VERSION, 'frames': diagnostics,
                    'hashes': [hashlib.sha256(f).hexdigest() for f in frames]}
        verify_motion(yaws, direction)
        average = np.mean([features[0], features[2]], axis=0)
        average /= np.linalg.norm(average)
        try:
            return {'status': 'SUCCESS', 'version': VERSION, 'embedding': average.tolist(),
                    'hashes': [hashlib.sha256(f).hexdigest() for f in frames]}
        finally: average.fill(0)
    finally:
        for feature in features: feature.fill(0)
        if reference is not None: reference.fill(0)


def main(payload):
    frames = []
    try:
        if len(payload) < 4: raise InputError('FACE_IMAGE_INVALID')
        header_size = struct.unpack('>I', payload[:4])[0]
        if not 0 < header_size <= 8192: raise InputError('FACE_IMAGE_INVALID')
        header = json.loads(payload[4:4+header_size])
        lengths = header['lengths']
        if len(lengths) != 3 or any(type(n) is not int or not 0 < n <= 4*1024*1024 for n in lengths):
            raise InputError('FACE_INPUT_LIMIT')
        if 4+header_size+sum(lengths) != len(payload): raise InputError('FACE_IMAGE_INVALID')
        offset = 4+header_size
        for length in lengths:
            frames.append(payload[offset:offset+length]); offset += length
        return inspect(frames, header['direction'], header.get('template'), header.get('mode', 'motion'))
    except InputError as error:
        return {'status': 'ERROR', 'reason': error.code}
    except Exception:
        return {'status': 'ERROR', 'reason': 'FACE_PROCESS_FAILED'}
    finally:
        frames.clear()


if __name__ == '__main__':
    payload = sys.stdin.buffer.read(12*1024*1024+8197)
    result = main(payload)
    sys.stdout.write(json.dumps(result, allow_nan=False))
    if 'embedding' in result: result['embedding'][:] = [0]*128
    payload = None
