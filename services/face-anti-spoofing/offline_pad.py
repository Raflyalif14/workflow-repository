"""Stage 9B offline preparation. No detector, weights, model loader or network.

Crop geometry adapted from Minivision, Copyright 2020 Minivision, Apache-2.0.
See reference/LICENSE and reference/NOTICE.md for attribution and changes.
Tensor arrays are NumPy preparations, not evidence of PyTorch/model inference.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import platform
import re
from time import perf_counter

import cv2
import numpy as np


UPSTREAM_COMMIT = "b6d5f04ad78778917853b25c778acef6d5626d15"
PREPROCESSING_VERSION = "minivision-bgr-context-80-numpy-v1"
MODELS = (
    {"name": "2.7_80x80_MiniFASNetV2.pth", "architecture": "MiniFASNetV2", "scale": 2.7},
    {"name": "4_0_0_80x80_MiniFASNetV1SE.pth", "architecture": "MiniFASNetV1SE", "scale": 4.0},
)


class PreparationError(ValueError):
    def __init__(self, reason: str, status: str = "INCONCLUSIVE"):
        super().__init__(reason)
        self.reason = reason
        self.status = status


def validate_frame(frame: np.ndarray) -> None:
    if (not isinstance(frame, np.ndarray) or frame.dtype != np.uint8
            or frame.ndim != 3 or frame.shape[2] != 3):
        raise PreparationError("FRAME_INVALID", "ERROR")
    height, width = frame.shape[:2]
    if not (2 <= width <= 4096 and 2 <= height <= 4096) or width * height > 8_000_000:
        raise PreparationError("FRAME_DIMENSIONS_INVALID", "ERROR")
    # Equivalent integer check to test.py's width/height == 3/4.
    # Refuse other ratios: no hidden stretch, centre crop, padding or mirror.
    if width * 4 != height * 3:
        raise PreparationError("FRAME_RATIO_UNSUPPORTED")


def validate_bbox(frame: np.ndarray, bbox) -> tuple[float, float, float, float]:
    try:
        if len(bbox) != 4 or any(isinstance(v, (bool, np.bool_)) for v in bbox):
            raise ValueError
        x, y, width, height = (float(v) for v in bbox)
    except (TypeError, ValueError, OverflowError):
        raise PreparationError("BBOX_INVALID") from None
    if not all(math.isfinite(v) for v in (x, y, width, height)):
        raise PreparationError("BBOX_INVALID")
    image_h, image_w = frame.shape[:2]
    if x < 0 or y < 0 or width <= 0 or height <= 0 or x + width > image_w or y + height > image_h:
        raise PreparationError("BBOX_INVALID")
    return x, y, width, height


def context_box(image_w: int, image_h: int, bbox, scale: float) -> tuple[int, int, int, int]:
    """Validated callers only. Preserve upstream scale clamp, shift and int truncation."""
    x, y, width, height = bbox
    scale = min((image_h - 1) / height, (image_w - 1) / width, scale)
    new_w, new_h = width * scale, height * scale
    center_x, center_y = width / 2 + x, height / 2 + y
    left, top = center_x - new_w / 2, center_y - new_h / 2
    right, bottom = center_x + new_w / 2, center_y + new_h / 2
    if left < 0:
        right -= left
        left = 0
    if top < 0:
        bottom -= top
        top = 0
    if right > image_w - 1:
        left -= right - image_w + 1
        right = image_w - 1
    if bottom > image_h - 1:
        top -= bottom - image_h + 1
        bottom = image_h - 1
    return int(left), int(top), int(right), int(bottom)


def prepare_patch(frame: np.ndarray, bbox, scale: float) -> tuple[np.ndarray, np.ndarray, tuple]:
    validate_frame(frame)
    box = validate_bbox(frame, bbox)
    if scale not in (2.7, 4.0):
        raise PreparationError("CROP_SCALE_UNSUPPORTED")
    height, width = frame.shape[:2]
    corners = context_box(width, height, box, scale)
    left, top, right, bottom = corners
    patch = cv2.resize(frame[top:bottom + 1, left:right + 1], (80, 80), interpolation=cv2.INTER_LINEAR)
    # Same numeric layout/range as functional.to_tensor on OpenCV's ndarray.
    # No RGB swap, /255, mean/std, alignment, rotation, or embedding here.
    tensor_array = np.ascontiguousarray(patch.transpose(2, 0, 1)[None], dtype=np.float32)
    return patch, tensor_array, corners


def aggregate_synthetic_outputs(outputs: dict) -> dict:
    """Logic-test utility only; never called by the runner as a model substitute.

    Input is each model's 3-class softmax output (not logits). Keep fixed
    two-model summation and /2 as test.py; reject ties instead of trusting argmax.
    """
    empty = {"per_model": [], "combined": None, "prediction": None}
    if not isinstance(outputs, dict) or set(outputs) != {m["name"] for m in MODELS}:
        return {**empty, "status": "ERROR", "reason": "MODEL_OUTPUTS_INCOMPLETE"}
    rows = []
    for model in MODELS:
        try:
            raw = np.asarray(outputs[model["name"]])
            if raw.dtype.kind not in "fiu" or raw.shape not in ((3,), (1, 3)):
                raise ValueError
            probabilities = raw.astype(np.float64).reshape(3)
            if (not np.isfinite(probabilities).all() or np.any(probabilities < 0)
                    or np.any(probabilities > 1)
                    or not math.isclose(float(probabilities.sum()), 1.0, rel_tol=0, abs_tol=1e-6)):
                raise ValueError
        except (TypeError, ValueError, OverflowError):
            return {**empty, "status": "ERROR", "reason": "MODEL_OUTPUT_INVALID"}
        rows.append({"name": model["name"], "probabilities": probabilities.tolist()})
    summed = np.sum([r["probabilities"] for r in rows], axis=0)
    winners = np.flatnonzero(summed == summed.max())
    if len(winners) != 1:
        return {**empty, "status": "INCONCLUSIVE", "reason": "CLASS_TIE"}
    label = int(winners[0])
    return {
        "status": "SUCCESS", "reason": None, "per_model": rows,
        "combined": {"probabilities": (summed / 2).tolist(), "class_index": label,
                     "winning_score": float(summed[label] / 2)},
        "prediction": "LIVE" if label == 1 else "SPOOF",
        "evidence": "SYNTHETIC_LOGIC_ONLY",
    }


def provenance() -> dict:
    return {
        "upstream_commit": UPSTREAM_COMMIT, "preprocessing_version": PREPROCESSING_VERSION,
        "device": "CPU", "python": platform.python_version(), "numpy": np.__version__,
        "opencv": cv2.__version__, "torch": None, "model_inference_enabled": False,
        "detector": {"name": "Widerface-RetinaFace.caffemodel", "sha256": None, "loaded": False},
        "models": [{**m, "input_hw": [80, 80], "sha256": None, "loaded": False} for m in MODELS],
        "tensor": {"backend": "NUMPY_PREPARATION_ONLY", "dtype": "float32",
                   "layout": "NCHW", "shape": [1, 3, 80, 80], "color": "BGR",
                   "range": [0, 255], "normalization": "NONE"},
    }


def run_preparation(trial_id: str, frame: np.ndarray, bbox=None) -> dict:
    """Accept one original BGR uint8 frame in memory. Return metadata only.

    No real prediction can succeed in Stage 9B, even when a caller supplies a
    bbox. A supplied bbox proves crop mechanics only, not that a face exists.
    """
    started = perf_counter()
    result = {
        "schema_version": 1, "trial_id": None, "started_at": datetime.now(timezone.utc).isoformat(),
        "status": "ERROR", "reason": None, "prediction": None, "combined": None,
        "per_model": [{"name": m["name"], "status": "NOT_RUN", "probabilities": None,
                       "duration_ms": None} for m in MODELS],
        "provenance": provenance(), "frame": None, "prepared": [],
    }
    patch = tensor = None
    try:
        if not isinstance(trial_id, str) or not re.fullmatch(r"[A-Za-z0-9_.:-]{1,64}", trial_id):
            raise PreparationError("TRIAL_ID_INVALID", "ERROR")
        result["trial_id"] = trial_id
        validate_frame(frame)
        result["frame"] = {"width": frame.shape[1], "height": frame.shape[0], "color": "BGR"}
        if bbox is None:
            raise PreparationError("DETECTOR_UNAVAILABLE", "ERROR")
        for model in MODELS:
            patch_started = perf_counter()
            patch, tensor, corners = prepare_patch(frame, bbox, model["scale"])
            result["prepared"].append({"name": model["name"], "crop_xyxy_inclusive": list(corners),
                                       "bbox_source": "CALLER_SUPPLIED_NOT_DETECTOR_VERIFIED",
                                       "shape": list(tensor.shape), "duration_ms": (perf_counter() - patch_started) * 1000})
            patch.fill(0)
            tensor.fill(0)
            patch = tensor = None
        raise PreparationError("MODEL_UNAVAILABLE", "ERROR")
    except PreparationError as exc:
        result["status"], result["reason"] = exc.status, exc.reason
    except Exception:
        # Never leak exception messages, input paths or pixels in the result.
        result["status"], result["reason"] = "ERROR", "PREPROCESSING_FAILED"
        result["prepared"] = []
    finally:
        if patch is not None:
            patch.fill(0)
        if tensor is not None:
            tensor.fill(0)
    result["duration_ms"] = (perf_counter() - started) * 1000
    return result


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Offline preprocessing only; PAD inference is unavailable.")
    parser.add_argument("--trial-id", required=True, help="Synthetic trial code, not a name/email")
    parser.add_argument("--frame", type=Path, required=True, help="Original frame; no image is written")
    parser.add_argument("--bbox", type=float, nargs=4, metavar=("X", "Y", "W", "H"),
                        help="Optional caller bbox for crop checks; does not assert a face")
    args = parser.parse_args(argv)
    frame = None
    try:
        if args.frame.stat().st_size > 4 * 1024 * 1024:
            raise PreparationError("FRAME_BYTES_EXCEEDED", "ERROR")
        # imdecode avoids path printing by OpenCV; bytes never enter JSON.
        data = bytearray(args.frame.read_bytes())
        try:
            frame = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_COLOR | cv2.IMREAD_IGNORE_ORIENTATION)
        finally:
            data[:] = b"\0" * len(data)
        result = run_preparation(args.trial_id, frame, args.bbox)
    except (OSError, PreparationError, cv2.error) as exc:
        result = run_preparation(args.trial_id, None)
        result["reason"] = exc.reason if isinstance(exc, PreparationError) else "FRAME_READ_FAILED"
    finally:
        if frame is not None:
            frame.fill(0)
    print(json.dumps(result, allow_nan=False))
    # Nonzero is deliberate: preprocessing does not mean PAD success.
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
