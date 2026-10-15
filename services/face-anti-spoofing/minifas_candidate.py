"""Pinned MiniFASNet candidate on native YuNet frames, compared with current MN3.

Project adapter; context geometry from Minivision (Apache-2.0, reference/LICENSE).
Different detector/native aspect ratios from upstream Android demo: validate locally.
No enrollment, authentication decision, images on disk or automatic model promotion.
"""
import hashlib
import json
from pathlib import Path
import sys
from time import perf_counter

import cv2
import numpy as np
import onnxruntime as ort
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
ONNX_ASSETS = {
    "MiniFASNetV2": (1744225, "2e4d897d506d2265ae3bf8c092002a527b2e78d940f8c60223a4ee03b7b65e11"),
    "MiniFASNetV1SE": (1743507, "6e4baab0c157a97f274f69bbd2bc3cf773c2ccd635a613930963963669dc3af5"),
}


def load_model(spec):
    name = spec[0]
    size, digest = ONNX_ASSETS[name]
    data = (ASSET_ROOT / (name + ".onnx")).read_bytes()
    if len(data) != size or hashlib.sha256(data).hexdigest() != digest:
        raise mn3.Mn3Error("PAD_MODEL_UNAVAILABLE")
    options = ort.SessionOptions()
    options.intra_op_num_threads = options.inter_op_num_threads = 1
    session = ort.InferenceSession(data, sess_options=options, providers=["CPUExecutionProvider"])
    session.disable_fallback()
    inputs, outputs = session.get_inputs(), session.get_outputs()
    if (session.get_providers() != ["CPUExecutionProvider"] or len(inputs) != 1 or len(outputs) != 1
            or (inputs[0].name, inputs[0].type, inputs[0].shape) != ("input", "tensor(float)", [1, 3, 80, 80])
            or (outputs[0].name, outputs[0].type, outputs[0].shape) != ("probabilities", "tensor(float)", [1, 3])):
        raise mn3.Mn3Error("PAD_MODEL_UNAVAILABLE")
    return session


def prepare(frame, box, scale):
    # Preserve the source pixels/aspect ratio. Only the model's own ROI is resized.
    x, y, w, h = validate_bbox(frame, box)
    left, top, right, bottom = context_box(frame.shape[1], frame.shape[0], (x, y, w, h), scale)
    patch = cv2.resize(frame[top:bottom+1, left:right+1], (80, 80), interpolation=cv2.INTER_LINEAR)
    tensor = np.ascontiguousarray(patch.transpose(2, 0, 1)[None], dtype=np.float32)
    patch.fill(0)
    return tensor, {"left": left, "top": top, "right": right+1, "bottom": bottom+1}


def infer(frame, box):
    rows = []
    for spec in MODELS:
        tensor = output = None
        try:
            model = load_model(spec)
            tensor, rect = prepare(frame, box, spec[2])
            output = model.run(["probabilities"], {"input": tensor})[0]
            values = output.astype(np.float64).reshape(-1)
            if values.shape != (3,) or not np.isfinite(values).all() or np.any(values < 0) or np.any(values > 1) or abs(values.sum()-1) > 1e-5:
                raise mn3.Mn3Error("PAD_PROCESS_FAILED")
            rows.append({"model": spec[0], "sha256": spec[4], "scale": spec[2], "rect": rect,
                         "onnxSha256": ONNX_ASSETS[spec[0]][1], "classes": values.tolist()})
        finally:
            if tensor is not None:
                tensor.fill(0)
            if output is not None:
                output.fill(0)
    combined = np.mean([row["classes"] for row in rows], axis=0)
    return {"version": VERSION, "probabilities": {"real": float(combined[1]),
            "spoof": float(combined[0] + combined[2])}, "models": rows}


def inspect_candidate(content):
    frame = box = current_patch = None
    started = perf_counter()
    try:
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
