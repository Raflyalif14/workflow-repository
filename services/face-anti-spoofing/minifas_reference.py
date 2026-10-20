"""Pinned MiniFASNet candidate on native YuNet frames, compared with current MN3.

Project adapter; context geometry from Minivision (Apache-2.0, reference/LICENSE).
Different detector/native aspect ratios from upstream Android demo: validate locally.
No enrollment, authentication decision, images on disk or automatic model promotion.
"""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sys
from time import perf_counter

import cv2
import numpy as np
import torch
import pad_inference as pad
import mn3_offline as mn3
from offline_pad import context_box, validate_bbox

ROOT = Path(__file__).resolve().parent
ASSET_ROOT = ROOT.parents[1] / ".cache/face-pad-candidate/models"
VERSION = "minifas-yunet-native-v1"
MODELS = (
    ("MiniFASNetV2", "2.7_80x80_MiniFASNetV2.pth", 2.7, 1849453,
     "a5eb02e1843f19b5386b953cc4c9f011c3f985d0ee2bb9819eea9a142099bec0"),
    ("MiniFASNetV1SE", "4_0_0_80x80_MiniFASNetV1SE.pth", 4.0, 1856130,
     "84ee1d37d96894d5e82de5a57df044ef80a58be2b218b5ed7cdfd875ec2f5990"),
)


def architecture_module():
    source = ROOT / "reference/MiniFASNet.py"
    normalized = source.read_text(encoding="utf8").replace("\r\n", "\n").encode()
    if hashlib.sha256(normalized).hexdigest() != "e498c4ec5e1ddfaba62b941a126c19d65aa564999f3309661fe43ee8bf38acd7":
        raise mn3.Mn3Error("PAD_MODEL_UNAVAILABLE")
    spec = importlib.util.spec_from_file_location("candidate_architecture", source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_model(module, spec):
    name, filename, _, size, digest = spec
    data = (ASSET_ROOT / filename).read_bytes()
    if len(data) != size or hashlib.sha256(data).hexdigest() != digest:
        raise mn3.Mn3Error("PAD_MODEL_UNAVAILABLE")
    state = torch.load(io.BytesIO(data), map_location="cpu", weights_only=True)
    if not isinstance(state, dict) or not state or not all(isinstance(k, str) for k in state):
        raise mn3.Mn3Error("PAD_MODEL_UNAVAILABLE")
    prefixed = [k.startswith("module.") for k in state]
    if any(prefixed):
        if not all(prefixed):
            raise mn3.Mn3Error("PAD_MODEL_UNAVAILABLE")
        state = {k[7:]: v for k, v in state.items()}
    model = getattr(module, name)(conv6_kernel=(5, 5)).to("cpu").eval()
    model.load_state_dict(state, strict=True)
    return model


def prepare(frame, box, scale):
    # Preserve the source pixels/aspect ratio. Only the model's own ROI is resized.
    x, y, w, h = validate_bbox(frame, box)
    left, top, right, bottom = context_box(frame.shape[1], frame.shape[0], (x, y, w, h), scale)
    patch = cv2.resize(frame[top:bottom+1, left:right+1], (80, 80), interpolation=cv2.INTER_LINEAR)
    tensor = torch.from_numpy(np.ascontiguousarray(patch.transpose(2, 0, 1)[None], dtype=np.float32))
    patch.fill(0)
    return tensor, {"left": left, "top": top, "right": right+1, "bottom": bottom+1}


def infer(frame, box):
    module = architecture_module()
    rows = []
    for spec in MODELS:
        tensor = output = None
        try:
            model = load_model(module, spec)
            tensor, rect = prepare(frame, box, spec[2])
            with torch.inference_mode():
                output = torch.softmax(model(tensor), dim=1)
            values = output.detach().cpu().numpy().astype(np.float64).reshape(-1)
            if values.shape != (3,) or not np.isfinite(values).all() or np.any(values < 0) or np.any(values > 1) or abs(values.sum()-1) > 1e-5:
                raise mn3.Mn3Error("PAD_PROCESS_FAILED")
            rows.append({"model": spec[0], "sha256": spec[4], "scale": spec[2], "rect": rect,
                         "classes": values.tolist()})
        finally:
            if tensor is not None:
                tensor.zero_()
            if output is not None:
                with torch.inference_mode():
                    output.zero_()
    combined = np.mean([row["classes"] for row in rows], axis=0)
    return {"version": VERSION, "probabilities": {"real": float(combined[1]),
            "spoof": float(combined[0] + combined[2])}, "models": rows}


def inspect_candidate(content):
    frame = box = current_patch = None
    started = perf_counter()
    try:
        torch.set_num_threads(1)
        cv2.setNumThreads(1)
        frame = pad.decode_image(content, "CANDIDATE")
        diagnostics = pad.empty_diagnostics()
        diagnostics["frame"] = {"width": frame.shape[1], "height": frame.shape[0]}
        detector = cv2.FaceDetectorYN.create("onnx", pad.detector_bytes(), np.empty(0, np.uint8), (640, 640), .9, .3, 5000)
        box = pad.detect_box(frame, detector, diagnostics)
        current_patch = pad.crop_frame(frame, box, diagnostics)
        baseline = mn3.Mn3CpuAdapter(mn3.DEFAULT_MODEL).infer_patch(current_patch)
        if baseline["status"] != "SUCCESS":
            raise mn3.Mn3Error("PAD_PROCESS_FAILED")
        candidate = infer(frame, box)
        return {"status": "SUCCESS", "prediction": None, "imageSha256": hashlib.sha256(content).hexdigest(),
                "frame": diagnostics["frame"], "baseline": {"real": baseline["probabilities"][0], "spoof": baseline["probabilities"][1]},
                "candidate": candidate, "durationMs": (perf_counter()-started)*1000}
    except pad.InputError as error:
        reason = error.code
    except (OSError, FileNotFoundError):
        reason = "PAD_MODEL_UNAVAILABLE"
    except mn3.Mn3Error as error:
        reason = error.reason if error.reason.startswith("PAD_") else "PAD_PROCESS_FAILED"
    except Exception:
        reason = "PAD_PROCESS_FAILED"
    finally:
        for value in (frame, box, current_patch):
            if value is not None:
                value.fill(0)
    return {"status": "ERROR", "reason": reason, "prediction": None}


if __name__ == "__main__":
    payload = sys.stdin.buffer.read(4*1024*1024+1)
    result = inspect_candidate(payload) if 0 < len(payload) <= 4*1024*1024 else {"status": "ERROR", "reason": "FACE_INPUT_LIMIT", "prediction": None}
    sys.stdout.write(json.dumps(result, allow_nan=False))
    payload = None
