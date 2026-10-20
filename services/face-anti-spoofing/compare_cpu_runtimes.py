"""Stage 9J: fixed synthetic/public fixtures, identical MN3 bytes and input.

Offline numerical parity only; no participant input, PAD ground truth or labels.
Reuses production preprocessing/crop without changing the application runtime.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import json
from pathlib import Path
import platform
from time import perf_counter

import cv2
import numpy as np

import mn3_offline as mn3
import pad_inference as pad


# Fixed before any Stage 9J forward. CPU float32 reductions/fusions can differ.
# Absolute tolerance protects near-zero probabilities; relative uses ORT reference.
ATOL = 1e-5
RTOL = 1e-4
REPEATS = 3
INPUT_NAME = "actual_input_1"
OUTPUT_NAME = "output1"
INPUT_SHAPE = [1, 3, 128, 128]
PUBLIC_HASHES = {
    "same-person-a.jpg": "b773e77fea6d53f44a1d2e14c850fcf0af07eed159959b7423f646983b422111",
    "same-person-b.jpg": "a90f4c8a5e2ae04a692b993fa243dad79645d1ef2a0f19262f4bcf52c4176a69",
}
EXPECTED_PACKAGES = {"onnxruntime": "1.23.2", "numpy": "2.2.6",
                     "opencv-python-headless": "4.13.0.92", "pillow": "12.3.0"}


class ComparisonError(ValueError):
    pass


def verified_model_bytes(path):
    """Read once; both runtimes import the same verified immutable bytes object."""
    try:
        if Path(path).stat().st_size != mn3.MODEL_SIZE:
            raise ComparisonError("MODEL_SIZE_MISMATCH")
        data = Path(path).read_bytes()
    except OSError:
        raise ComparisonError("MODEL_UNAVAILABLE") from None
    if (len(data) != mn3.MODEL_SIZE or hashlib.sha256(data).hexdigest() != mn3.MODEL_SHA256
            or hashlib.sha384(data).hexdigest() != mn3.MODEL_SHA384):
        raise ComparisonError("MODEL_CHECKSUM_MISMATCH")
    return data


def validate_ort_catalog(session):
    inputs, outputs = session.get_inputs(), session.get_outputs()
    if (session.get_providers() != ["CPUExecutionProvider"] or len(inputs) != 1 or len(outputs) != 1
            or (inputs[0].name, inputs[0].type, inputs[0].shape) != (INPUT_NAME, "tensor(float)", INPUT_SHAPE)
            or (outputs[0].name, outputs[0].type, outputs[0].shape) != (OUTPUT_NAME, "tensor(float)", [1, 2])):
        raise ComparisonError("RUNTIME_CATALOG_UNEXPECTED")
    return {"inputs": [{"name": inputs[0].name, "type": inputs[0].type, "shape": inputs[0].shape}],
            "outputs": [{"name": outputs[0].name, "type": outputs[0].type, "shape": outputs[0].shape}],
            "providers": session.get_providers()}


def load_runtimes(data):
    import onnxruntime as ort  # Only this offline harness; not app/module startup.
    cv2.setNumThreads(1)
    net = cv2.dnn.readNetFromONNX(np.frombuffer(data, dtype=np.uint8))
    net.setPreferableBackend(cv2.dnn.DNN_BACKEND_OPENCV)
    net.setPreferableTarget(cv2.dnn.DNN_TARGET_CPU)
    names = net.getLayerNames()
    terminal = [{"name": n, "type": net.getLayer(net.getLayerId(n)).type} for n in names[-2:]]
    if ([n["type"] for n in terminal] != ["Softmax", "Identity"]
            or tuple(net.getUnconnectedOutLayersNames()) != (OUTPUT_NAME,)):
        raise ComparisonError("OPENCV_CATALOG_UNEXPECTED")
    options = ort.SessionOptions()
    options.intra_op_num_threads = options.inter_op_num_threads = 1
    options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    session = ort.InferenceSession(data, sess_options=options, providers=["CPUExecutionProvider"])
    session.disable_fallback()
    catalog = validate_ort_catalog(session)
    catalog["opencv"] = {"backend": "DNN_BACKEND_OPENCV", "target": "DNN_TARGET_CPU",
                         "outputs": list(net.getUnconnectedOutLayersNames()), "terminal_layers": terminal}
    catalog["configuration"] = {"threads": 1, "execution": "ORT_SEQUENTIAL",
                                "optimization": "ORT_ENABLE_ALL", "fallback_disabled": True}

    def opencv_forward(tensor):
        net.setInput(tensor, INPUT_NAME)
        return net.forward(OUTPUT_NAME)

    def ort_forward(tensor):
        return session.run([OUTPUT_NAME], {INPUT_NAME: tensor})[0]

    # Closures retain each native runtime until the offline run completes.
    return opencv_forward, ort_forward, catalog


def tensor_hash(tensor):
    return hashlib.sha256(memoryview(tensor).cast("B")).hexdigest()


def difference(opencv, ort):
    a, b = np.asarray(opencv, np.float64), np.asarray(ort, np.float64)
    absolute = np.abs(a - b)
    relative = absolute / np.maximum(np.abs(b), np.finfo(np.float32).eps)
    return {"absolute": absolute.tolist(), "relative": relative.tolist(),
            "max_absolute": float(absolute.max()), "max_relative": float(relative.max()),
            "within_tolerance": bool(np.all(absolute <= ATOL + RTOL * np.abs(b)))}


def compare_patch(patch, opencv_forward, ort_forward):
    """Prepare exactly once. Same ndarray supplied to every call, never persisted."""
    tensor = None
    all_values = {"opencv": [], "ort": []}
    timings = {"opencv": [], "ort": []}
    try:
        tensor = mn3.prepare_patch(patch)
        if (list(tensor.shape) != INPUT_SHAPE or tensor.dtype != np.float32
                or not tensor.flags.c_contiguous or not np.isfinite(tensor).all()):
            raise ComparisonError("INPUT_TENSOR_INVALID")
        before = tensor_hash(tensor)
        comparisons = []
        for _ in range(REPEATS):
            for name, forward in (("opencv", opencv_forward), ("ort", ort_forward)):
                output = None
                try:
                    started = perf_counter()
                    output = forward(tensor)
                    timings[name].append((perf_counter() - started) * 1000)
                    if not isinstance(output, np.ndarray) or output.dtype != np.float32:
                        raise ComparisonError("OUTPUT_TYPE_INVALID")
                    values = mn3.validate_probabilities(output)  # No softmax/class swap.
                    if tensor_hash(tensor) != before:
                        raise ComparisonError("INPUT_TENSOR_CHANGED")
                    all_values[name].append(values)
                finally:
                    if isinstance(output, np.ndarray):
                        output.fill(0)
            comparisons.append(difference(all_values["opencv"][-1], all_values["ort"][-1]))
        repeat_checks = {}
        for name in all_values:
            values = np.asarray(all_values[name], np.float64)
            repeat_checks[name] = {"bit_exact_outputs": bool(np.all(values == values[0])),
                                  "max_absolute_from_first": float(np.abs(values - values[0]).max())}
        match = all(x["within_tolerance"] for x in comparisons)
        deterministic = all(x["bit_exact_outputs"] for x in repeat_checks.values())
        return {"status": "PASS" if match and deterministic else "FAIL", "reason": None,
                "tensor": {"shape": list(tensor.shape), "dtype": str(tensor.dtype), "contiguous": True,
                           "finite": True, "sha256": before, "unchanged_after_each_call": True,
                           "prepared_once": True},
                "output_shape": [1, 2], "output_dtype": "float32", "class_order": ["real", "spoof"],
                "outputs": all_values, "differences": comparisons, "determinism": repeat_checks,
                "max_absolute_difference": max(x["max_absolute"] for x in comparisons),
                "max_relative_difference": max(x["max_relative"] for x in comparisons),
                "forward_ms": timings, "prediction": None}
    finally:
        if tensor is not None:
            tensor.fill(0)


def public_patch(filename):
    """Fixed attributed fixtures only; no CLI for private/user image paths."""
    if filename not in PUBLIC_HASHES:
        raise ComparisonError("FIXTURE_NOT_ALLOWED")
    fixture_root = pad.IDENTITY_ROOT / "tests/fixtures"
    entries = json.loads((fixture_root / "manifest.json").read_text(encoding="utf8"))
    entry = next(x for x in entries if x["file"] == filename)
    data = (fixture_root / filename).read_bytes()
    if entry["sha256"] != PUBLIC_HASHES[filename] or hashlib.sha256(data).hexdigest() != PUBLIC_HASHES[filename]:
        raise ComparisonError("FIXTURE_CHECKSUM_MISMATCH")
    frame = box = None
    try:
        frame = pad.decode_image(data, "PUBLIC_FIXTURE")
        diagnostics = pad.empty_diagnostics()
        diagnostics["frame"] = {"width": frame.shape[1], "height": frame.shape[0]}
        detector = cv2.FaceDetectorYN.create("onnx", pad.detector_bytes(), np.empty(0, np.uint8),
                                            (640, 640), 0.9, 0.3, 5000)
        box = pad.detect_box(frame, detector, diagnostics)
        patch = pad.crop_frame(frame, box, diagnostics)
        return patch, {"file": filename, "sha256": PUBLIC_HASHES[filename], "source": entry["source"],
                       "license": entry["license"], "license_evidence": entry["licenseEvidence"],
                       "existing_fixture_processing": entry["processing"], "diagnostics": diagnostics,
                       "pad_ground_truth": None}
    finally:
        for array in (frame, box):
            if array is not None:
                array.fill(0)


def package_inventory():
    versions = {d.metadata["Name"].lower(): d.version for d in importlib.metadata.distributions()}
    if any(versions.get(n) != v for n, v in EXPECTED_PACKAGES.items()):
        raise ComparisonError("RUNTIME_VERSION_MISMATCH")
    return dict(sorted(versions.items()))


def run_comparison(model_path):
    result = {"stage": "9J", "started_at": datetime.now(timezone.utc).isoformat(),
              "status": "ERROR", "reason": None, "cases": [], "prediction": None,
              "purpose": "NUMERICAL_RUNTIME_PARITY_NOT_PAD_ACCURACY",
              "policy": {"atol": ATOL, "rtol": RTOL, "repeats": REPEATS,
                         "comparison": "abs(OpenCV-ORT) <= atol + rtol*abs(ORT)",
                         "relative_denominator": "max(abs(ORT), float32 epsilon)",
                         "repeat_requirement": "bit-exact outputs within each runtime"}}
    try:
        result["environment"] = {"python": platform.python_version(), "platform": platform.platform(),
                                 "machine": platform.machine(), "opencv_runtime": cv2.__version__,
                                 "packages": package_inventory()}
        data = verified_model_bytes(model_path)
        result["model"] = {"name": "anti-spoof-mn3", "size_bytes": len(data),
                           "sha256": hashlib.sha256(data).hexdigest(), "sha384": hashlib.sha384(data).hexdigest(),
                           "verified": True, "same_bytes_for_both_runtimes": True,
                           "source": mn3.MODEL_URL, "omz_commit": mn3.OMZ_COMMIT}
        result["preprocessing"] = {"version": mn3.PREPROCESSING_VERSION, "crop_version": pad.CROP_VERSION,
                                   "detector": "yunet-2023mar", "detector_sha256": pad.DETECTOR_SHA256,
                                   "method": "existing prepare_patch once, no extra normalization/softmax"}
        cv_forward, ort_forward, result["catalog"] = load_runtimes(data)
        fixtures = [("synthetic-" + n, n) for n in ("constant", "pattern", "noise")]
        fixtures += [("public-" + name.removesuffix(".jpg"), name) for name in PUBLIC_HASHES]
        for case_id, source in fixtures:
            patch = None
            case = {"id": case_id, "status": "ERROR", "reason": None, "prediction": None}
            try:
                if case_id.startswith("synthetic-"):
                    patch = mn3.synthetic_patch(source)
                    case["fixture"] = {"kind": "synthetic", "pattern": source,
                                       "rng": "numpy.default_rng PCG64", "seed": 42 if source == "noise" else None,
                                       "pad_ground_truth": None}
                else:
                    patch, case["fixture"] = public_patch(source)
                before = tensor_hash(patch)
                case.update(compare_patch(patch, cv_forward, ort_forward))
                case["source_patch_unchanged"] = tensor_hash(patch) == before
                if not case["source_patch_unchanged"]:
                    case["status"], case["reason"] = "FAIL", "SOURCE_PATCH_CHANGED"
            except (ComparisonError, mn3.Mn3Error) as error:
                case["reason"] = str(error)
            except pad.InputError:
                case["reason"] = "PUBLIC_FIXTURE_FACE_INVALID"
            except Exception:
                case["reason"] = "CASE_EXECUTION_FAILED"
            finally:
                if patch is not None:
                    patch.fill(0)
            result["cases"].append(case)
        result["status"] = "PASS" if all(x["status"] == "PASS" for x in result["cases"]) else "FAIL"
        measured = [x for x in result["cases"] if "max_absolute_difference" in x]
        result["summary"] = {"cases": len(result["cases"]), "passed": sum(x["status"] == "PASS" for x in result["cases"]),
                             "max_absolute_difference": max((x["max_absolute_difference"] for x in measured), default=None),
                             "max_relative_difference": max((x["max_relative_difference"] for x in measured), default=None)}
    except (ComparisonError, mn3.Mn3Error) as error:
        result["reason"] = str(error)
    except Exception:
        result["reason"] = "RUNTIME_INITIALIZATION_FAILED"
    result["completed_at"] = datetime.now(timezone.utc).isoformat()
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", type=Path, default=mn3.DEFAULT_MODEL)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(argv)
    # Reserve output before any model/fixture load. Existing evidence never overwritten.
    try:
        output = args.output.open("x", encoding="utf8", newline="\n")
    except FileExistsError:
        parser.error("Output already exists; select a new evidence file.")
    with output:
        result = run_comparison(args.model)
        json.dump(result, output, indent=2, allow_nan=False)
        output.write("\n")
    print(json.dumps({"status": result["status"], "reason": result["reason"], "summary": result.get("summary")}))
    return 0 if result["status"] == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
