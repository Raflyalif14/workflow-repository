"""Stage 8 runner tests with synthetic files/models only; no actual inference."""
import csv
import json
import math
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from evaluate_london_calibration import sha
from evaluate_london_test import IntegrityError, ratio, report_ratio, run_test, test_metrics
from freeze_london_threshold import EXPECTED_THRESHOLD
from generate_london_manifest import COLUMNS, make_pairs, make_splits

PROFILE = {"modelVersion": "2021dec", "modelSha256": "a" * 64,
           "detectorVersion": "2023mar", "detectorSha256": "b" * 64,
           "preprocessingVersion": "opencv-sface-five-landmark-112-v1",
           "runtimeVersion": "4.13.0", "embeddingDimensions": 128}


class SafeFailure(Exception):
    code, photo = "FACE_NONE", "A"


def fixture(root):
    dataset, manifests = root / "dataset", root / "stage6a"
    dataset.mkdir(); manifests.mkdir()
    ids = [f"{i:03d}" for i in range(1, 103)]
    metadata = dataset / "london_faces_info.csv"
    metadata.write_text("face_id\n" + "\n".join(ids) + "\n", encoding="utf-8")
    images = {"neutral_front": {}, "smiling_front": {}}
    contents, hashes = {}, {}
    for group, suffix in (("neutral_front", "03"), ("smiling_front", "08")):
        for participant in ids:
            relative = f"{group}/{group}/{participant}_{suffix}.jpg"
            images[group][participant] = relative
            contents[relative] = b"\xff\xd8\xffsynthetic:" + relative.encode()
            hashes[relative] = sha(contents[relative])
    splits = make_splits(ids, hashes, sha(metadata.read_bytes()))
    (manifests / "splits.json").write_text(json.dumps(splits), encoding="utf-8")
    rows = make_pairs(splits["participants"], images)
    with (manifests / "manifest.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=COLUMNS); writer.writeheader(); writer.writerows(rows)
    selected = [r for r in rows if r["split"] == "test"]
    allowed = {dataset / r[k] for r in selected for k in ("image_a", "image_b")}
    # Calibration JPEGs deliberately do not exist; test code must not touch them.
    for file in allowed:
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_bytes(contents[file.relative_to(dataset).as_posix()])
    service = Path(__file__).resolve().parent.parent
    pipeline = {"inference_source_sha256": sha((service / "inference.py").read_bytes()),
                "calibration_runner_sha256": sha((service / "evaluate_london_calibration.py").read_bytes()),
                "python_version": sys.version.split()[0]}
    inputs = {"manifest_sha256": sha((manifests / "manifest.csv").read_bytes()),
              "splits_sha256": sha((manifests / "splits.json").read_bytes()),
              "metadata_sha256": sha(metadata.read_bytes()), "test_image_reads": 0}
    calibration = {"status": "COMPLETED", "split": "calibration", "exactly_once": True,
                   "test_pairs_processed": 0, "inputs": inputs, "results_sha256": "c" * 64,
                   "run_id": "synthetic-calibration", "attempted": 102, "labels": {}, "provenance": PROFILE,
                   "inference_source_sha256": pipeline["inference_source_sha256"],
                   "runner_sha256": pipeline["calibration_runner_sha256"], "python_version": pipeline["python_version"]}
    calibration_file = root / "calibration-run.json"
    calibration_file.write_text(json.dumps(calibration), encoding="utf-8")
    decision = {"schema": "london-threshold-experiment-v1", "method": "midpoint_of_calibration_gap",
                "threshold": EXPECTED_THRESHOLD, "decision_id": "synthetic-decision",
                "inputs": {**inputs, "run_json_sha256": sha(calibration_file.read_bytes()), "results_csv_sha256": calibration["results_sha256"]},
                "rule": {"expression": "score >= threshold means SAME", "operator": ">=", "at_or_above": "SAME", "below": "DIFFERENT", "processing_failure_or_invalid_score": "NO_PREDICTION"},
                "freeze_policy": {"frozen_before_test_evaluation": True, "retune_using_test_results": False, "installed_in_application": False},
                "calibration": {"run_id": calibration["run_id"], "pairs": 102, "statistics": {}},
                "provenance": PROFILE, "model": "opencv-sface-2021dec", "metric": "cosine", "pipeline": pipeline,
                "source": {"title": "Synthetic fixture only"}}
    threshold_file = root / "threshold.json"
    threshold_file.write_text(json.dumps(decision), encoding="utf-8")
    return dataset, manifests, calibration_file, threshold_file, allowed, selected


class TestRunnerTests(unittest.TestCase):
    def test_rule_failures_filter_metrics_overwrite_and_provenance(self):
        with tempfile.TemporaryDirectory(prefix="workflow-stage8-synthetic-") as folder:
            root = Path(folder)
            dataset, manifests, calibration, threshold, allowed, selected = fixture(root)
            reads, calls = set(), []
            original_read = Path.read_bytes
            def guarded_read(file):
                if file.is_relative_to(dataset) and file.suffix.lower() == ".jpg":
                    self.assertIn(file, allowed, "Calibration JPEG must not be read")
                    reads.add(file)
                return original_read(file)
            def compare(a, b):
                calls.append((a, b))
                index = len(calls)
                if index == 4:
                    raise SafeFailure("Raw synthetic payload must not be recorded")
                score = {1: EXPECTED_THRESHOLD, 2: math.nextafter(EXPECTED_THRESHOLD, -math.inf),
                         3: math.nextafter(EXPECTED_THRESHOLD, math.inf), 5: math.nan,
                         52: EXPECTED_THRESHOLD}.get(index, 0.9 if index <= 51 else 0.1)
                return {"model": "opencv-sface-2021dec", "metric": "cosine", "score": score, "provenance": PROFILE}
            output = root / "stage8"
            before_threshold = threshold.read_bytes()
            with patch.object(Path, "read_bytes", guarded_read):
                run = run_test(dataset, manifests, calibration, threshold, output, compare, PROFILE)
            self.assertEqual(reads, allowed); self.assertEqual(len(calls), 102)
            self.assertEqual(threshold.read_bytes(), before_threshold)
            with (output / "test-results.csv").open(newline="", encoding="utf-8") as handle:
                rows = list(csv.DictReader(handle))
            self.assertEqual(len(rows), 102)
            self.assertEqual({r["pair_id"] for r in rows}, {r["pair_id"] for r in selected})
            self.assertEqual({r["split"] for r in rows}, {"test"})
            self.assertEqual([r["prediction"] for r in rows[:3]], ["SAME", "DIFFERENT", "SAME"])
            for index, reason in ((3, "FACE_NONE"), (4, "FACE_SCORE_INVALID")):
                self.assertEqual(rows[index]["outcome"], "FAILED")
                self.assertEqual(rows[index]["score"], "")
                self.assertEqual(rows[index]["prediction"], "")
                self.assertEqual(rows[index]["reason"], reason)
            metrics = run["metrics"]
            self.assertEqual(metrics["confusion_matrix"], {"positive_class": "SAME", "TP": 48, "FN": 1, "FP": 1, "TN": 50})
            self.assertEqual(metrics["false_match"], ratio(1, 51))
            self.assertEqual(metrics["false_non_match"], ratio(1, 49))
            self.assertEqual(metrics["accuracy_successful_only"], ratio(98, 100))
            self.assertEqual(metrics["processing_coverage"], ratio(100, 102))
            self.assertIn("100/102", (output / "test-report.md").read_text())
            self.assertNotIn("Raw synthetic payload", (output / "test-results.csv").read_text())
            snapshots = {p.name: p.read_bytes() for p in output.iterdir()}
            with self.assertRaisesRegex(ValueError, "refusing to overwrite"):
                run_test(dataset, manifests, calibration, threshold, output, compare, PROFILE)
            self.assertEqual(len(calls), 102)
            self.assertEqual(snapshots, {p.name: p.read_bytes() for p in output.iterdir()})
            with self.assertRaisesRegex(IntegrityError, "differs from calibration"):
                run_test(dataset, manifests, calibration, threshold, root / "mismatch", compare, {**PROFILE, "runtimeVersion": "different"})
            self.assertEqual(len(calls), 102); self.assertFalse((root / "mismatch").exists())
            decision = json.loads(threshold.read_bytes()); decision["rule"]["operator"] = ">"
            threshold.write_text(json.dumps(decision), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "must use >="):
                run_test(dataset, manifests, calibration, threshold, root / "bad-rule", compare, PROFILE)
            self.assertEqual(len(calls), 102); self.assertFalse((root / "bad-rule").exists())

    def test_threshold_mutation_aborts_and_zero_denominators_are_unavailable(self):
        with tempfile.TemporaryDirectory(prefix="workflow-stage8-integrity-") as folder:
            root = Path(folder)
            dataset, manifests, calibration, threshold, _, _ = fixture(root)
            calls = 0
            def compare(a, b):
                nonlocal calls
                calls += 1
                if calls == 1:
                    threshold.write_bytes(threshold.read_bytes() + b"\n")
                return {"model": "opencv-sface-2021dec", "metric": "cosine", "score": 0.9, "provenance": PROFILE}
            with self.assertRaisesRegex(IntegrityError, "artifact changed"):
                run_test(dataset, manifests, calibration, threshold, root / "changed", compare, PROFILE)
            self.assertFalse((root / "changed" / "test-run.json").exists())
        failed = [{"truth": "SAME", "outcome": "FAILED", "score": "", "prediction": "", "reason": "FACE_NONE"}]
        metrics = test_metrics(failed)
        self.assertEqual(metrics["accuracy_successful_only"], ratio(0, 0))
        self.assertEqual(metrics["false_match"]["rate"], None)
        self.assertEqual(metrics["false_non_match"]["rate"], None)
        self.assertEqual(report_ratio(ratio(0, 0)), "not available (0/0)")


if __name__ == "__main__":
    unittest.main()
