"""One-time local ONNX export with Torch/ORT parity, public/synthetic inputs only."""
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / ".cache/face-pad-candidate/export-packages"))
sys.path.append(str(ROOT / ".cache/face-pad-runtime-comparison/Lib/site-packages"))
import onnx
import onnxruntime as ort
import numpy as np
import torch
import minifas_reference as reference


def main():
    torch.set_num_threads(1)
    records = []
    module = reference.architecture_module()
    rng = np.random.default_rng(20261014)
    inputs = [np.full((1, 3, 80, 80), 127, np.float32),
              rng.integers(0, 256, (1, 3, 80, 80)).astype(np.float32)]
    frames = []
    for name in ["same-person-a.jpg", "same-person-b.jpg"]:
        frame = reference.pad.decode_image((reference.pad.IDENTITY_ROOT / "tests/fixtures" / name).read_bytes(), "PUBLIC_FIXTURE")
        detector = reference.cv2.FaceDetectorYN.create("onnx", reference.pad.detector_bytes(), np.empty(0, np.uint8), (640, 640), .9, .3, 5000)
        frames.append((frame, reference.pad.detect_box(frame, detector)))
    for spec in reference.MODELS:
        model = torch.nn.Sequential(reference.load_model(module, spec), torch.nn.Softmax(dim=1)).eval()
        target = reference.ASSET_ROOT / (spec[0] + ".onnx")
        with torch.inference_mode():
            torch.onnx.export(model, torch.zeros(1, 3, 80, 80), str(target), input_names=["input"], output_names=["probabilities"],
                              opset_version=13, dynamo=False, external_data=False)
        onnx.checker.check_model(str(target))
        options = ort.SessionOptions(); options.intra_op_num_threads = options.inter_op_num_threads = 1
        session = ort.InferenceSession(target.read_bytes(), sess_options=options, providers=["CPUExecutionProvider"])
        session.disable_fallback()
        patches = [reference.prepare(frame, box, spec[2])[0].numpy() for frame, box in frames]
        differences = []
        for array in inputs + patches:
            with torch.inference_mode():
                expected = model(torch.from_numpy(array)).numpy()
            actual = session.run(["probabilities"], {"input": array})[0]
            if not np.all(np.abs(actual - expected) <= 1e-5 + 1e-4 * np.abs(expected)):
                raise ValueError("ONNX parity failed")
            differences.append(float(np.abs(actual-expected).max()))
        records.append({"model": spec[0], "sourceSha256": spec[4], "onnxSha256": hashlib.sha256(target.read_bytes()).hexdigest(),
                        "size": target.stat().st_size, "maxDifference": max(differences), "cases": len(differences)})
    result = {"status": "PASS", "torch": torch.__version__, "onnx": onnx.__version__, "onnxruntime": ort.__version__, "models": records}
    (reference.ASSET_ROOT / "onnx-parity.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf8")
    print(json.dumps(result))


if __name__ == "__main__":
    main()
