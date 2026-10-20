"""Original ONNX anti-spoof-mn3: offline CPU patch inference and synthetic smoke.

Project adapter; no detector, camera, enrollment, login, or network operations.
Model notices and source interpretation: reference/mn3/NOTICE.md.
Synthetic inference is execution evidence, never PAD accuracy/liveness evidence.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import json
from pathlib import Path
import platform
import re
from time import perf_counter

import cv2
import numpy as np


OMZ_COMMIT = "eda1863a6d60b09551df9d039cff2377d6ddd4d6"
MODEL_SIZE = 12270179
MODEL_SHA384 = "6de4534964b723397b3e8c995cadcf43bc007cc2f9930b95ae25f76adccece5d1d4d058d0b15117b9e4a9f758424f92a"
MODEL_SHA256 = "c4c99af04603b62d7e44f6f4daeb33e0daeccc696008c0b1d62f6f5cebbb3262"
MODEL_URL = "https://storage.openvinotoolkit.org/repositories/open_model_zoo/public/2022.1/anti-spoof-mn3/anti-spoof-mn3.onnx"
MEAN = (151.2405, 119.5950, 107.8395)
STD = (63.0105, 56.4570, 55.0035)
PREPROCESSING_VERSION = "mn3-original-onnx-rgb-cubic-128-v1"
DEFAULT_MODEL = Path.home() / "Downloads/face-experiment-assets/anti-spoof-mn3/anti-spoof-mn3.onnx"


class Mn3Error(ValueError):
    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


def prepare_patch(bgr_patch: np.ndarray) -> np.ndarray:
    """Caller supplies a face ROI, NOT an aligned SFace crop or full camera view.

    This function proves no face presence. Detector/crop policy is a separate
    future experiment. RGB conversion and byte-scale normalization happen once.
    """
    if (not isinstance(bgr_patch, np.ndarray) or bgr_patch.dtype != np.uint8
            or bgr_patch.ndim != 3 or bgr_patch.shape[2] != 3):
        raise Mn3Error("PATCH_INVALID")
    h, w = bgr_patch.shape[:2]
    if not (2 <= h <= 4096 and 2 <= w <= 4096) or h * w > 8_000_000:
        raise Mn3Error("PATCH_DIMENSIONS_INVALID")
    resized = cv2.resize(bgr_patch, (128, 128), interpolation=cv2.INTER_CUBIC)
    rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB).astype(np.float32)
    normalized = (rgb - np.array(MEAN, dtype=np.float32)) / np.array(STD, dtype=np.float32)
    tensor = np.ascontiguousarray(normalized.transpose(2, 0, 1)[None], dtype=np.float32)
    resized.fill(0)
    rgb.fill(0)
    normalized.fill(0)
    return tensor


def validate_probabilities(output: np.ndarray) -> list[float]:
    values = np.asarray(output)
    if (values.shape != (1, 2) or values.dtype.kind != "f"
            or not np.isfinite(values).all() or np.any(values < 0) or np.any(values > 1)
            or not np.isclose(values.sum(), 1.0, rtol=0, atol=1e-5)):
        raise Mn3Error("MODEL_OUTPUT_INVALID")
    # Output is already a probability vector: do not apply softmax or threshold.
    return [float(x) for x in values[0]]


class Mn3CpuAdapter:
    """One caller-owned adapter per offline experiment; not thread-safe."""
    def __init__(self, model_path: Path):
        path = Path(model_path)
        try:
            if not path.is_file():
                raise Mn3Error("MODEL_UNAVAILABLE")
            if path.stat().st_size != MODEL_SIZE:
                raise Mn3Error("MODEL_SIZE_MISMATCH")
            data = path.read_bytes()
        except OSError:
            raise Mn3Error("MODEL_READ_FAILED") from None
        if (hashlib.sha384(data).hexdigest() != MODEL_SHA384
                or hashlib.sha256(data).hexdigest() != MODEL_SHA256):
            raise Mn3Error("MODEL_CHECKSUM_MISMATCH")
        try:
            # Import the verified bytes, rather than rereading a potentially
            # changed path. Checkpoint bytes contain no participant information.
            self.net = cv2.dnn.readNetFromONNX(np.frombuffer(data, dtype=np.uint8))
            self.net.setPreferableBackend(cv2.dnn.DNN_BACKEND_OPENCV)
            self.net.setPreferableTarget(cv2.dnn.DNN_TARGET_CPU)
            names = self.net.getLayerNames()
            self.terminal_layers = [
                {"name": name, "type": self.net.getLayer(self.net.getLayerId(name)).type}
                for name in names[-2:]
            ]
            if ([layer["type"] for layer in self.terminal_layers] != ["Softmax", "Identity"]
                    or self.net.getUnconnectedOutLayersNames() != ("output1",)):
                raise Mn3Error("MODEL_GRAPH_UNEXPECTED")
        except cv2.error:
            raise Mn3Error("MODEL_LOAD_FAILED") from None

    def infer_patch(self, patch: np.ndarray) -> dict:
        tensor = output = None
        started = perf_counter()
        try:
            tensor = prepare_patch(patch)
            self.net.setInput(tensor, "actual_input_1")
            forward_started = perf_counter()
            output = self.net.forward("output1")
            forward_ms = (perf_counter() - forward_started) * 1000
            probabilities = validate_probabilities(output)
            return {"status": "SUCCESS", "reason": None, "probabilities": probabilities,
                    "output_shape": list(output.shape), "forward_ms": forward_ms,
                    "duration_ms": (perf_counter() - started) * 1000,
                    "prediction": None, "evidence": "UNVALIDATED_PATCH_INFERENCE"}
        except Mn3Error as exc:
            reason = exc.reason
        except Exception:
            reason = "INFERENCE_FAILED"
        finally:
            if tensor is not None:
                tensor.fill(0)
            if output is not None:
                output.fill(0)
        return {"status": "ERROR", "reason": reason, "probabilities": None,
                "output_shape": None, "forward_ms": None,
                "duration_ms": (perf_counter() - started) * 1000,
                "prediction": None, "evidence": "UNVALIDATED_PATCH_INFERENCE"}


def synthetic_patch(name: str) -> np.ndarray:
    if name == "constant":
        return np.full((128, 128, 3), [17, 99, 231], dtype=np.uint8)
    if name == "pattern":
        y, x = np.indices((192, 160))
        return np.stack((x % 256, y % 256, (3 * x + y) % 256), axis=2).astype(np.uint8)
    if name == "noise":
        return np.random.default_rng(42).integers(0, 256, (128, 128, 3), dtype=np.uint8)
    raise Mn3Error("SYNTHETIC_CASE_INVALID")


def run_smoke(model_path: Path, trial_id: str = "stage9f-synthetic") -> dict:
    """Only synthetic pixels. Successful execution never becomes LIVE/SPOOF."""
    started = perf_counter()
    result = {
        "schema_version": 1, "stage": "9F", "trial_id": None,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "status": "ERROR", "reason": None, "prediction": None,
        "evidence": "SYNTHETIC_SMOKE_ONLY", "cases": [],
        "provenance": {
            "model": "anti-spoof-mn3", "omz_commit": OMZ_COMMIT,
            "source": MODEL_URL, "sha384": MODEL_SHA384, "sha256": MODEL_SHA256,
            "model_loaded": False, "model_inference_executed": False,
            "runtime": "OpenCV DNN", "backend": "DNN_BACKEND_OPENCV",
            "target": "DNN_TARGET_CPU", "python": platform.python_version(),
            "opencv_distribution": importlib.metadata.version("opencv-python-headless"),
            "opencv_runtime": cv2.__version__, "numpy": np.__version__,
            "preprocessing_version": PREPROCESSING_VERSION,
            "input": {"name": "actual_input_1", "shape": [1, 3, 128, 128],
                      "dtype": "float32", "color": "RGB", "mean": list(MEAN),
                      "std": list(STD), "resize": "INTER_CUBIC",
                      "formula": "(RGB_byte_scale - mean) / std"},
            "output": {"name": "output1", "shape": [1, 2],
                       "classes": ["real", "spoof"], "softmax_added": False},
            "detector_loaded": False, "participant_photos": False,
        },
    }
    patch = None
    try:
        if not isinstance(trial_id, str) or not re.fullmatch(r"[A-Za-z0-9_.:-]{1,64}", trial_id):
            raise Mn3Error("TRIAL_ID_INVALID")
        result["trial_id"] = trial_id
        load_started = perf_counter()
        adapter = Mn3CpuAdapter(model_path)
        result["load_ms"] = (perf_counter() - load_started) * 1000
        result["provenance"]["model_loaded"] = True
        result["terminal_layers"] = adapter.terminal_layers
        for name in ("constant", "pattern", "noise"):
            patch = synthetic_patch(name)
            before = patch.copy()
            outputs = [adapter.infer_patch(patch) for _ in range(3)]
            if any(row["status"] != "SUCCESS" for row in outputs):
                raise Mn3Error(next(row["reason"] for row in outputs if row["status"] != "SUCCESS"))
            result["provenance"]["model_inference_executed"] = True
            if not np.array_equal(patch, before):
                raise Mn3Error("SOURCE_PATCH_CHANGED")
            vectors = np.array([row["probabilities"] for row in outputs])
            if not np.allclose(vectors, vectors[0], rtol=1e-5, atol=1e-6):
                raise Mn3Error("REPEATED_FORWARD_MISMATCH")
            result["cases"].append({"name": name, "status": "PASS", "runs": 3,
                                    "output_shape": outputs[0]["output_shape"],
                                    "finite_probabilities": True, "probability_sum_valid": True,
                                    "max_abs_repeat_difference": float(np.max(np.abs(vectors - vectors[0]))),
                                    "forward_ms": [row["forward_ms"] for row in outputs],
                                    "source_unchanged": True, "prediction": None})
            patch.fill(0)
            before.fill(0)
            patch = None
        result["status"], result["reason"] = "SUCCESS", None
    except Mn3Error as exc:
        result["reason"] = exc.reason
        result["cases"] = []
    except Exception:
        result["reason"] = "SMOKE_FAILED"
        result["cases"] = []
    finally:
        if patch is not None:
            patch.fill(0)
    result["duration_ms"] = (perf_counter() - started) * 1000
    return result


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Pretrained ONNX CPU smoke; synthetic pixels only, no PAD decision.")
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL)
    parser.add_argument("--trial-id", default="stage9f-synthetic")
    parser.add_argument("--output", type=Path, help="Optional metadata JSON; refuses overwrite")
    args = parser.parse_args(argv)
    if args.output is not None and args.output.exists():
        parser.error("Output already exists; refusing overwrite")
    result = run_smoke(args.model, args.trial_id)
    if args.output is not None:
        with args.output.open("x", encoding="utf-8", newline="\n") as file:
            json.dump(result, file, indent=2, allow_nan=False)
            file.write("\n")
    print(json.dumps(result, allow_nan=False))
    return 0 if result["status"] == "SUCCESS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
