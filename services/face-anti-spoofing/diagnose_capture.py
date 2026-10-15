"""Temporary same-capture analysis over stdin; returns numbers only, never image files."""
import hashlib
import json
import sys
import cv2
import numpy as np
import pad_inference as pad
import mn3_offline as mn3
from compare_cpu_runtimes import verified_model_bytes, load_runtimes, compare_patch, package_inventory

VERSION = "pad-capture-analysis-v1"


def reference_tensor(patch):
    resized = rgb = normalized = None
    try:
        resized = cv2.resize(patch, (128, 128), interpolation=cv2.INTER_CUBIC)
        rgb = resized[:, :, ::-1].astype(np.float32)
        # Original ONNX contract, constants independent of the project adapter.
        normalized = (rgb - np.array([151.2405, 119.5950, 107.8395], np.float32)) / np.array([63.0105, 56.4570, 55.0035], np.float32)
        return np.ascontiguousarray(np.moveaxis(normalized, -1, 0)[None], dtype=np.float32)
    finally:
        for value in (resized, rgb, normalized):
            if value is not None:
                value.fill(0)


def comparison_rect(frame, box, expanded):
    """Pinned original-demo expansion applied to the SAME YuNet box, not SSD parity."""
    height, width = frame.shape[:2]
    x, y, w, h = box
    left, top, right, bottom = int(x), int(y), int(x + w), int(y + h)
    if expanded:
        dx, dy = (right - left) * .1 / 2, (bottom - top) * .05 / 2
        left, top, right, bottom = int(left - dx), int(top - dy), int(right + dx), int(bottom + dy)
    rect = {"left": max(0, left), "top": max(0, top), "right": min(width, right), "bottom": min(height, bottom)}
    if rect["right"] - rect["left"] < 2 or rect["bottom"] - rect["top"] < 2:
        raise mn3.Mn3Error("PAD_BBOX_INVALID")
    return rect


def analyse_capture(content):
    frame = decoded = box = patch = actual = reference = gray = None
    try:
        # Browser captures are PNG. JPEG decoder/EXIF differences are deliberately
        # excluded from this comparison, rather than mislabeled as an input bug.
        if not content.startswith(b"\x89PNG\r\n\x1a\n"):
            raise pad.InputError("FACE_IMAGE_INVALID")
        frame = pad.decode_image(content, "DIAGNOSTIC")
        decoded = cv2.imdecode(np.frombuffer(content, np.uint8), cv2.IMREAD_COLOR)
        if decoded is None or decoded.shape != frame.shape:
            raise mn3.Mn3Error("PAD_PROCESS_FAILED")
        decoder_error = int(np.abs(frame.astype(np.int16) - decoded.astype(np.int16)).max())
        d = pad.empty_diagnostics()
        d["frame"] = {"width": frame.shape[1], "height": frame.shape[0]}
        cv2.setNumThreads(1)
        detector = cv2.FaceDetectorYN.create("onnx", pad.detector_bytes(), np.empty(0, np.uint8), (640, 640), .9, .3, 5000)
        box = pad.detect_box(frame, detector, d)
        patch = pad.crop_frame(frame, box, d)
        actual, reference = mn3.prepare_patch(patch), reference_tensor(patch)
        preprocessing_error = float(np.abs(actual.astype(np.float64) - reference.astype(np.float64)).max())
        actual.fill(0); reference.fill(0); actual = reference = None
        patch.fill(0); patch = None
        package_inventory()
        cv_forward, ort_forward, _ = load_runtimes(verified_model_bytes(mn3.DEFAULT_MODEL))
        # Set the variants before inference. No sweep or choosing the highest real score.
        rectangles = [("CURRENT", d["cropAfterClip"]),
                      ("REFERENCE_RECT", comparison_rect(frame, box, True)),
                      ("FACE_BOX", comparison_rect(frame, box, False))]
        rows = []
        for name, rect in rectangles:
            patch = frame[rect["top"]:rect["bottom"], rect["left"]:rect["right"]].copy()
            compared = compare_patch(patch, cv_forward, ort_forward)
            cv_values, ort_values = compared["outputs"]["opencv"][0], compared["outputs"]["ort"][0]
            rows.append({"id": name, "rect": rect,
                         "opencv": {"real": cv_values[0], "spoof": cv_values[1]},
                         "onnx": {"real": ort_values[0], "spoof": ort_values[1]},
                         "maxDifference": compared["max_absolute_difference"],
                         "runtimeMatches": all(x["within_tolerance"] for x in compared["differences"]),
                         "deterministic": all(x["bit_exact_outputs"] for x in compared["determinism"].values())})
            patch.fill(0); patch = None
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        return {"schemaVersion": VERSION, "status": "SUCCESS", "prediction": None,
                "imageSha256": hashlib.sha256(content).hexdigest(), "modelSha256": mn3.MODEL_SHA256,
                "frame": d["frame"], "decoderMaxDifference": decoder_error,
                "preprocessingMaxDifference": preprocessing_error,
                "brightnessMean": float(gray.mean()), "contrastStd": float(gray.std()),
                "laplacianVariance": float(cv2.Laplacian(gray, cv2.CV_64F).var()),
                "cropResults": rows}
    except pad.InputError as error:
        reason = error.code
    except Exception:
        reason = "PAD_PROCESS_FAILED"
    finally:
        for value in (frame, decoded, box, patch, actual, reference, gray):
            if value is not None:
                value.fill(0)
    return {"status": "ERROR", "reason": reason, "prediction": None}


if __name__ == "__main__":
    payload = sys.stdin.buffer.read(4 * 1024 * 1024 + 1)
    try:
        result = analyse_capture(payload) if 0 < len(payload) <= 4 * 1024 * 1024 else {"status": "ERROR", "reason": "FACE_INPUT_LIMIT", "prediction": None}
        sys.stdout.write(json.dumps(result, allow_nan=False))
    finally:
        payload = None
