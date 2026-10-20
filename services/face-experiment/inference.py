"""CPU inference. All decoded pixels, aligned faces and embeddings are transient."""
import io
import os
os.environ.setdefault("OPENCV_LOG_LEVEL", "SILENT")
import warnings
import cv2
import numpy as np
from PIL import Image, ImageOps
from download_models import ROOT, verify_models

MAX_FILE = 4 * 1024 * 1024
MAX_PIXELS = 8_000_000
MAX_SIDE = 4096
Image.MAX_IMAGE_PIXELS = MAX_PIXELS
MODEL = "opencv-sface-2021dec"

PREPROCESSING_VERSION = "opencv-sface-five-landmark-112-v1"

def model_provenance(manifest):
    checksums = {item["file"]: item["sha256"] for item in manifest["models"]}
    return {"modelVersion": "2021dec", "modelSha256": checksums["face_recognition_sface_2021dec.onnx"],
            "detectorVersion": "2023mar", "detectorSha256": checksums["face_detection_yunet_2023mar.onnx"],
            "preprocessingVersion": PREPROCESSING_VERSION, "runtimeVersion": cv2.__version__, "embeddingDimensions": 128}

class InputError(Exception):
    def __init__(self, code, photo=None):
        self.code, self.photo = code, photo

def decode_image(content, slot):
    if not 0 < len(content) <= MAX_FILE:
        raise InputError("FACE_INPUT_LIMIT", slot)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(content)) as image:
                if image.format not in ("PNG", "JPEG") or getattr(image, "n_frames", 1) != 1:
                    raise InputError("FACE_IMAGE_INVALID", slot)
                w, h = image.size
                if min(w, h) < 128 or max(w, h) > MAX_SIDE or w * h > MAX_PIXELS:
                    raise InputError("FACE_INPUT_LIMIT", slot)
                image.load()
                with ImageOps.exif_transpose(image) as oriented:
                    with oriented.convert("RGB") as rgb:
                        return cv2.cvtColor(np.array(rgb), cv2.COLOR_RGB2BGR)
    except InputError:
        raise
    except Exception:
        raise InputError("FACE_IMAGE_INVALID", slot) from None

def compare_images(photo_a, photo_b):
    provenance = model_provenance(verify_models())
    cv2.setNumThreads(1)
    detector = cv2.FaceDetectorYN.create(str(ROOT / "models/face_detection_yunet_2023mar.onnx"), "", (640, 640), 0.9, 0.3, 5000)
    recognizer = cv2.FaceRecognizerSF.create(str(ROOT / "models/face_recognition_sface_2021dec.onnx"), "")
    features = []
    try:
        for slot, content in (("A", photo_a), ("B", photo_b)):
            image = decode_image(content, slot)
            scaled = aligned = feature = None
            try:
                h, w = image.shape[:2]
                size = (max(1, round(w * min(1, 640 / max(w, h)))), max(1, round(h * min(1, 640 / max(w, h)))))
                scaled = cv2.resize(image, size)
                detector.setInputSize(size)
                _, faces = detector.detect(scaled)
                count = 0 if faces is None else len(faces)
                if count != 1:
                    raise InputError("FACE_NONE" if count == 0 else "FACE_MULTIPLE", slot)
                face = faces[0].copy()
                face[[0, 2, 4, 6, 8, 10, 12]] *= w / size[0]
                face[[1, 3, 5, 7, 9, 11, 13]] *= h / size[1]
                # Five original-image landmarks -> OpenCV's 112x112 similarity warp.
                aligned = recognizer.alignCrop(image, face)
                feature = recognizer.feature(aligned).reshape(-1)
                if feature.size != 128 or not np.isfinite(feature).all():
                    raise RuntimeError("Model output contract mismatch")
                norm = np.linalg.norm(feature)
                if norm <= 0:
                    raise RuntimeError("Empty embedding")
                features.append((feature / norm).copy())
            finally:
                for value in (image, scaled, aligned, feature):
                    if value is not None:
                        value.fill(0)
        score = float(np.clip(np.dot(features[0], features[1]), -1, 1))
        return {"model": MODEL, "metric": "cosine", "score": score, "provenance": provenance}
    finally:
        for value in features:
            value.fill(0)
        del detector, recognizer

def inference_child(payload, connection):
    """Spawn boundary: the parent can terminate even a stuck native DNN call."""
    try:
        length = int.from_bytes(payload[:4], "big")
        result = compare_images(payload[4:4 + length], payload[4 + length:])
        connection.send({"ok": True, "result": result})
    except InputError as error:
        connection.send({"ok": False, "code": error.code, "photo": error.photo})
    except Exception:
        connection.send({"ok": False, "code": "FACE_PROCESS_FAILED"})
    finally:
        connection.close()
