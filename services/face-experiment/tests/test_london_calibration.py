"""Synthetic runner tests only. No inference import, model, real dataset or services."""
import csv
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from evaluate_london_calibration import load_calibration, run_calibration
from generate_london_manifest import COLUMNS, make_pairs, make_splits

PROFILE = {"modelVersion": "2021dec", "modelSha256": "a" * 64,
           "detectorVersion": "2023mar", "detectorSha256": "b" * 64,
           "preprocessingVersion": "opencv-sface-five-landmark-112-v1",
           "runtimeVersion": "4.13.0", "embeddingDimensions": 128}


class SafeFailure(Exception):
    code, photo = "FACE_NONE", "A"


class CalibrationRunnerTests(unittest.TestCase):
    def test_calibration_only_failure_coverage_and_overwrite(self):
        with tempfile.TemporaryDirectory(prefix="workflow-stage6b-synthetic-") as folder:
            root = Path(folder)
            dataset, manifests, output = root / "dataset", root / "stage6a", root / "stage6b"
            dataset.mkdir(); manifests.mkdir()
            ids = [f"{i:03d}" for i in range(1, 103)]
            metadata = dataset / "london_faces_info.csv"
            metadata.write_text("face_id\n" + "\n".join(ids) + "\n", encoding="utf-8")
            images = {"neutral_front": {}, "smiling_front": {}}
            hashes, contents = {}, {}
            for group, suffix in (("neutral_front", "03"), ("smiling_front", "08")):
                for participant in ids:
                    relative = f"{group}/{group}/{participant}_{suffix}.jpg"
                    content = b"\xff\xd8\xffsynthetic:" + relative.encode()
                    images[group][participant] = relative
                    contents[relative] = content
                    hashes[relative] = hashlib.sha256(content).hexdigest()
            splits = make_splits(ids, hashes, hashlib.sha256(metadata.read_bytes()).hexdigest())
            rows = make_pairs(splits["participants"], images)
            (manifests / "splits.json").write_text(json.dumps(splits), encoding="utf-8")
            with (manifests / "manifest.csv").open("w", newline="", encoding="utf-8") as handle:
                writer = csv.DictWriter(handle, fieldnames=COLUMNS); writer.writeheader(); writer.writerows(rows)
            selected = [r for r in rows if r["split"] == "calibration"]
            allowed = {dataset / r[k] for r in selected for k in ("image_a", "image_b")}
            # Test images deliberately do not exist. Reading/statting them would fail.
            for file in allowed:
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_bytes(contents[file.relative_to(dataset).as_posix()])
            reads, calls = set(), []
            original_read = Path.read_bytes
            def guarded_read(file):
                if file.is_relative_to(dataset) and file.suffix.lower() == ".jpg":
                    self.assertIn(file, allowed, "Runner must not read any test JPEG")
                    reads.add(file)
                return original_read(file)
            def compare(a, b):
                calls.append((a, b))
                if len(calls) == 1:
                    raise SafeFailure("Synthetic raw error must not be recorded")
                return {"model": "opencv-sface-2021dec", "metric": "cosine",
                        "score": 0.6027477979660034, "provenance": PROFILE}
            with patch.object(Path, "read_bytes", guarded_read):
                result = run_calibration(dataset, manifests, output, compare, PROFILE)
            self.assertEqual(reads, allowed)
            self.assertEqual(len(calls), 102)
            self.assertEqual(result["test_pairs_processed"], 0)
            self.assertEqual(result["inputs"]["test_image_reads"], 0)
            with (output / "results.csv").open(newline="", encoding="utf-8") as handle:
                recorded = list(csv.DictReader(handle))
            self.assertEqual(len(recorded), 102)
            self.assertEqual(len({r["pair_id"] for r in recorded}), 102)
            self.assertEqual({r["pair_id"] for r in recorded}, {r["pair_id"] for r in selected})
            self.assertEqual(recorded[0]["outcome"], "FAILED")
            self.assertEqual(recorded[0]["score"], "")
            self.assertEqual(recorded[0]["reason"], "FACE_NONE")
            self.assertEqual(recorded[0]["failure_photo"], "A")
            self.assertEqual(recorded[1]["score"], "0.6027477979660034")
            self.assertEqual(result["labels"]["SAME"]["failed"], 1)
            self.assertEqual(result["labels"]["DIFFERENT"]["succeeded"], 51)
            self.assertNotIn("Synthetic raw error", (output / "results.csv").read_text())
            before = {p.name: p.read_bytes() for p in output.iterdir()}
            with self.assertRaisesRegex(ValueError, "refusing to overwrite"):
                run_calibration(dataset, manifests, output, compare, PROFILE)
            self.assertEqual(before, {p.name: p.read_bytes() for p in output.iterdir()})
            self.assertEqual(len(calls), 102, "Overwrite refusal happens before inference")
            # Corrupt a synthetic label: manifest validation must refuse it before model use.
            rows[0]["truth"] = "DIFFERENT"
            with (manifests / "manifest.csv").open("w", newline="", encoding="utf-8") as handle:
                writer = csv.DictWriter(handle, fieldnames=COLUMNS); writer.writeheader(); writer.writerows(rows)
            with self.assertRaisesRegex(ValueError, "Truth label"):
                run_calibration(dataset, manifests, root / "invalid-run", compare, PROFILE)
            self.assertEqual(len(calls), 102)
            self.assertFalse((root / "invalid-run").exists())


if __name__ == "__main__":
    unittest.main()
