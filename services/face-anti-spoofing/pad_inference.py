"""Stage 9G full-frame YuNet -> versioned context crop -> MN3; no identity inference."""
from __future__ import annotations
import hashlib
import json
import platform
import sys
from datetime import datetime, timezone
from pathlib import Path
from time import perf_counter
import cv2
import numpy as np

IDENTITY_ROOT = Path(__file__).resolve().parents[1] / "face-experiment"
sys.path.insert(0, str(IDENTITY_ROOT))
# Reuse the bounded, oriented PNG/JPEG decoder, not SFace alignment/embeddings.
from inference import decode_image, InputError
from mn3_offline import Mn3CpuAdapter, Mn3Error, DEFAULT_MODEL, MODEL_SHA256, PREPROCESSING_VERSION

CROP_VERSION = "yunet-max-side-square-context-1.2-clip-v1"
DETECTOR_SHA256 = "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4"

def empty_diagnostics():
    return {"version": "pad-geometry-v1", "frame": None, "faceCount": None,
            "bbox": None, "cropBeforeClip": None, "cropAfterClip": None,
            "roi": None, "clipped": None}

def detector_bytes():
    path = IDENTITY_ROOT / "models/face_detection_yunet_2023mar.onnx"
    try:
        if path.stat().st_size != 232589:
            raise Mn3Error("PAD_DETECTOR_UNAVAILABLE")
        data = path.read_bytes()
    except OSError:
        raise Mn3Error("PAD_DETECTOR_UNAVAILABLE") from None
    if hashlib.sha256(data).hexdigest() != DETECTOR_SHA256:
        raise Mn3Error("PAD_DETECTOR_UNAVAILABLE")
    return np.frombuffer(data, dtype=np.uint8)

def provenance():
    return {"model": "anti-spoof-mn3", "modelSha256": MODEL_SHA256,
            "detector": "yunet-2023mar", "detectorSha256": DETECTOR_SHA256,
            "cropVersion": CROP_VERSION, "preprocessingVersion": PREPROCESSING_VERSION,
            "runtimeVersion": cv2.__version__, "pythonVersion": platform.python_version()}

def crop_frame(frame, bbox, diagnostics=None):
    """No warp/mirror: centered max-side square *1.2, then clip (may become rectangular)."""
    h, w = frame.shape[:2]
    box = np.asarray(bbox, dtype=np.float64)
    if box.shape != (4,) or not np.isfinite(box).all():
        raise Mn3Error("PAD_BBOX_INVALID")
    x, y, bw, bh = box
    if bw <= 0 or bh <= 0 or x < 0 or y < 0 or x + bw > w or y + bh > h:
        raise Mn3Error("PAD_BBOX_INVALID")
    side = max(bw, bh) * 1.2
    cx, cy = x + bw / 2, y + bh / 2
    raw_left, raw_top = int(np.floor(cx - side / 2)), int(np.floor(cy - side / 2))
    raw_right, raw_bottom = int(np.ceil(cx + side / 2)), int(np.ceil(cy + side / 2))
    left, top = max(0, raw_left), max(0, raw_top)
    right, bottom = min(w, raw_right), min(h, raw_bottom)
    if diagnostics is not None:
        diagnostics["cropBeforeClip"] = {"left": raw_left, "top": raw_top, "right": raw_right, "bottom": raw_bottom}
        diagnostics["cropAfterClip"] = {"left": left, "top": top, "right": right, "bottom": bottom}
        diagnostics["clipped"] = {"left": left != raw_left, "top": top != raw_top,
                                  "right": right != raw_right, "bottom": bottom != raw_bottom}
    if right - left < 2 or bottom - top < 2:
        raise Mn3Error("PAD_BBOX_INVALID")
    patch = frame[top:bottom, left:right].copy()
    if diagnostics is not None:
        diagnostics["roi"] = {"width": patch.shape[1], "height": patch.shape[0]}
    return patch

def detect_box(frame, detector, diagnostics=None):
    h, w = frame.shape[:2]
    scale = min(1, 640 / max(w, h))
    size = (max(1, round(w * scale)), max(1, round(h * scale)))
    scaled = cv2.resize(frame, size)  # Same scale/interpolation/confidence/NMS as existing YuNet.
    faces = None
    try:
        detector.setInputSize(size)
        _, faces = detector.detect(scaled)
        count = 0 if faces is None else len(faces)
        if diagnostics is not None:
            diagnostics["faceCount"] = count
        if count != 1:
            raise InputError("FACE_NONE" if count == 0 else "FACE_MULTIPLE")
        box = faces[0, :4].astype(np.float64).copy()
        box[[0, 2]] *= w / size[0]
        box[[1, 3]] *= h / size[1]
        # Read only this detection once, before its existing cleanup. Never expose landmarks.
        if diagnostics is not None and np.isfinite(box).all():
            x, y, bw, bh = box
            if bw > 0 and bh > 0 and x >= 0 and y >= 0 and x + bw <= w and y + bh <= h:
                confidence = float(faces[0, 14])
                diagnostics["bbox"] = {"x": float(x), "y": float(y), "width": float(bw), "height": float(bh),
                                       "confidence": confidence if np.isfinite(confidence) and 0 <= confidence <= 1 else None}
        return box
    finally:
        scaled.fill(0)
        if faces is not None:
            faces.fill(0)

def inspect_photo(content, model_path=DEFAULT_MODEL):
    started = perf_counter()
    frame = patch = box = None
    detector = adapter = None
    p = None
    diagnostics = empty_diagnostics()
    try:
        frame = decode_image(content, "PAD")
        diagnostics["frame"] = {"width": frame.shape[1], "height": frame.shape[0]}
        cv2.setNumThreads(1)
        detector = cv2.FaceDetectorYN.create("onnx", detector_bytes(), np.empty(0, np.uint8), (640, 640), 0.9, 0.3, 5000)
        box = detect_box(frame, detector, diagnostics)
        patch = crop_frame(frame, box, diagnostics)
        adapter = Mn3CpuAdapter(model_path)
        p = provenance()  # Both actual assets verified and loaded; no SFace model loaded.
        result = adapter.infer_patch(patch)
        if result["status"] != "SUCCESS":
            raise Mn3Error("PAD_PROCESS_FAILED")
        return {"status": "SUCCESS", "reason": None,
                "probabilities": {"real": result["probabilities"][0], "spoof": result["probabilities"][1]},
                "provenance": p, "imageSha256": hashlib.sha256(content).hexdigest(),
                "processedAt": datetime.now(timezone.utc).isoformat(),
                "durationMs": (perf_counter() - started) * 1000, "prediction": None, "diagnostics": diagnostics}
    except InputError as error:
        reason = error.code
    except Mn3Error as error:
        reason = error.reason if error.reason in ("PAD_BBOX_INVALID", "PAD_DETECTOR_UNAVAILABLE") else "PAD_MODEL_UNAVAILABLE" if error.reason.startswith("MODEL_") else "PAD_PROCESS_FAILED"
    except Exception:
        reason = "PAD_PROCESS_FAILED"
    finally:
        for value in (frame, patch, box):
            if value is not None:
                value.fill(0)
        del detector, adapter
    return {"status": "ERROR", "reason": reason, "probabilities": None, "prediction": None,
            "provenance": p, "imageSha256": None, "processedAt": datetime.now(timezone.utc).isoformat(),
            "durationMs": (perf_counter() - started) * 1000, "diagnostics": diagnostics}

def pad_child(payload, connection):
    try:
        result = inspect_photo(payload)
        connection.send(result)
    except Exception:
        connection.send({"status": "ERROR", "reason": "PAD_PROCESS_FAILED", "probabilities": None, "prediction": None, "diagnostics": None})
    finally:
        connection.close()
