"""Fetch the two pinned official MiniFASNet weights into ignored local cache."""
import hashlib
import json
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
COMMIT = "b6d5f04ad78778917853b25c778acef6d5626d15"
ASSETS = (
    ("2.7_80x80_MiniFASNetV2.pth", 1849453, "47c4af2023fb072c0f5b0e0ade4824053a0558e1"),
    ("4_0_0_80x80_MiniFASNetV1SE.pth", 1856130, "55a25b316ef33ced3925687007a31a5e306990db"),
)


def main():
    target = ROOT / ".cache/face-pad-candidate/models"
    target.mkdir(parents=True, exist_ok=True)
    records = []
    for name, size, blob in ASSETS:
        url = f"https://raw.githubusercontent.com/minivision-ai/Silent-Face-Anti-Spoofing/{COMMIT}/resources/anti_spoof_models/{name}"
        path = target / name
        if path.exists():
            data = path.read_bytes()
        else:
            with urllib.request.urlopen(url, timeout=30) as response:
                data = response.read(size + 1)
        digest = hashlib.sha1(f"blob {len(data)}\0".encode() + data).hexdigest()
        if len(data) != size or digest != blob:
            raise ValueError("Official pinned model bytes do not match")
        if not path.exists():
            path.write_bytes(data)
        records.append({"name": name, "size": size, "gitBlob": blob,
                        "sha256": hashlib.sha256(data).hexdigest(), "source": url})
    license_text = (ROOT / "services/face-anti-spoofing/reference/LICENSE").read_bytes()
    (target / "LICENSE").write_bytes(license_text)
    manifest = {"commit": COMMIT, "assets": records,
                "scope": "Local candidate evaluation; YuNet detector, not the upstream Caffe detector."}
    (target / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf8")
    print(json.dumps(manifest))


if __name__ == "__main__":
    main()
