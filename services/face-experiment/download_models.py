"""Download only public pinned model assets; never download user images."""
import hashlib
import json
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parent

def verify_models():
    manifest = json.loads((ROOT / "models-manifest.json").read_text())
    for item in manifest["models"]:
        path = ROOT / "models" / item["file"]
        if not path.exists() or path.stat().st_size != item["bytes"]:
            raise RuntimeError("Pinned model missing; run download_models.py")
        if hashlib.sha256(path.read_bytes()).hexdigest() != item["sha256"]:
            raise RuntimeError("Pinned model checksum mismatch")
    return manifest

if __name__ == "__main__":
    (ROOT / "models").mkdir(exist_ok=True)
    for item in json.loads((ROOT / "models-manifest.json").read_text())["models"]:
        target = ROOT / "models" / item["file"]
        if not target.exists():
            pending = target.with_suffix(".download")
            try:
                with urllib.request.urlopen(item["url"], timeout=60) as response:
                    pending.write_bytes(response.read(item["bytes"] + 1))
                if hashlib.sha256(pending.read_bytes()).hexdigest() != item["sha256"]:
                    raise RuntimeError("Download checksum mismatch")
                pending.replace(target)
            finally:
                pending.unlink(missing_ok=True)
    verify_models()
    print("Pinned SFace/YuNet model checksums verified.")
