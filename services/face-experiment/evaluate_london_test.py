"""Stage 8: test-only offline evaluation with the frozen Stage 7 threshold."""
import argparse
import csv
import io
import json
import math
import sys
import uuid
from collections import Counter
from pathlib import Path

from evaluate_london_calibration import (RESULT_COLUMNS, SAFE_REASONS, clean_provenance,
    load_calibration, read_calibration_image as read_selected_image, sha, utc_now)
from freeze_london_threshold import EXPECTED_THRESHOLD, prediction
from generate_london_manifest import require

TEST_COLUMNS = RESULT_COLUMNS + ("prediction", "threshold", "threshold_sha256")


class IntegrityError(ValueError):
    pass


def integrity(condition, message):
    if not condition:
        raise IntegrityError(message)


def load_test_inputs(dataset, manifest_dir, calibration_run_file, threshold_file):
    paths = {"manifest": manifest_dir / "manifest.csv", "splits": manifest_dir / "splits.json",
             "calibration_run": calibration_run_file, "threshold": threshold_file}
    content = {key: file.read_bytes() for key, file in paths.items()}
    checksums = {key: sha(value) for key, value in content.items()}
    calibration = json.loads(content["calibration_run"])
    decision = json.loads(content["threshold"])
    splits = json.loads(content["splits"])
    require(calibration["status"] == "COMPLETED" and calibration["split"] == "calibration" and calibration["exactly_once"] is True, "Invalid calibration run.")
    require(calibration["test_pairs_processed"] == calibration["inputs"]["test_image_reads"] == 0, "Calibration did not establish held-out test exclusion.")
    require(checksums["calibration_run"] == decision["inputs"]["run_json_sha256"], "Calibration run checksum differs from frozen decision.")
    require(calibration["results_sha256"] == decision["inputs"]["results_csv_sha256"], "Calibration result checksum linkage differs.")
    for key in ("manifest", "splits"):
        require(checksums[key] == calibration["inputs"][key + "_sha256"] == decision["inputs"][key + "_sha256"], f"{key} checksum linkage differs.")
    require(decision["schema"] == "london-threshold-experiment-v1" and decision["method"] == "midpoint_of_calibration_gap", "Unexpected frozen decision protocol.")
    threshold = decision["threshold"]  # Use the artifact's value; the constant below is only an integrity expectation.
    require(type(threshold) in (float, int) and math.isfinite(threshold) and threshold == EXPECTED_THRESHOLD, "Unexpected threshold value in artifact; stop without retuning.")
    require(decision["rule"] == {"expression": "score >= threshold means SAME", "operator": ">=", "at_or_above": "SAME", "below": "DIFFERENT", "processing_failure_or_invalid_score": "NO_PREDICTION"}, "Frozen decision rule must use >= and abstain on failures.")
    require(decision["freeze_policy"] == {"frozen_before_test_evaluation": True, "retune_using_test_results": False, "installed_in_application": False}, "Frozen threshold policy differs.")
    require(decision["calibration"]["run_id"] == calibration["run_id"] and decision["calibration"]["pairs"] == calibration["attempted"] == 102 and decision["calibration"]["statistics"] == calibration["labels"], "Calibration decision/run linkage differs.")
    profile = clean_provenance(calibration["provenance"])
    require(clean_provenance(decision["provenance"]) == profile and decision["model"] == "opencv-sface-2021dec" and decision["metric"] == "cosine", "Frozen model provenance differs from calibration.")
    require(decision["pipeline"] == {"inference_source_sha256": calibration["inference_source_sha256"], "calibration_runner_sha256": calibration["runner_sha256"], "python_version": calibration["python_version"]}, "Frozen pipeline provenance differs.")
    require(calibration["python_version"] == sys.version.split()[0], "Python runtime differs from calibration.")
    require(sha(Path(__file__).with_name("inference.py").read_bytes()) == calibration["inference_source_sha256"], "Inference source changed since calibration.")
    require(sha(Path(__file__).with_name("evaluate_london_calibration.py").read_bytes()) == calibration["runner_sha256"], "Calibration helper source changed since the frozen run.")
    groups = splits["participants"]
    require(len(set(groups["calibration"])) == len(set(groups["test"])) == 51 and not set(groups["calibration"]) & set(groups["test"]), "Participant overlap or incomplete split.")
    # Existing helper validates the complete manifest metadata without opening any JPEG.
    _, hashes, validation = load_calibration(dataset, manifest_dir)
    require(validation["manifest_sha256"] == checksums["manifest"] and validation["splits_sha256"] == checksums["splits"] and validation["metadata_sha256"] == calibration["inputs"]["metadata_sha256"], "Manifest/metadata changed during input validation.")
    with io.StringIO(content["manifest"].decode("utf-8"), newline="") as handle:
        selected = [row for row in csv.DictReader(handle) if row["split"] == "test"]
    require(len(selected) == len({r["pair_id"] for r in selected}) == 102 and Counter(r["truth"] for r in selected) == {"SAME": 51, "DIFFERENT": 51}, "Expected 102 unique test pairs: 51 SAME/51 DIFFERENT.")
    require(all(r[k] in groups["test"] for r in selected for k in ("participant_a", "participant_b")), "Selected pair contains a non-test participant.")
    return selected, hashes, decision, calibration, checksums, paths, validation


def ratio(numerator, denominator):
    return {"numerator": numerator, "denominator": denominator,
            "rate": numerator / denominator if denominator else None}


def test_metrics(rows):
    labels = {}
    for truth in ("SAME", "DIFFERENT"):
        own = [row for row in rows if row["truth"] == truth]
        labels[truth] = {"attempted": len(own), "succeeded": sum(r["outcome"] == "SUCCESS" for r in own),
                         "failed": sum(r["outcome"] == "FAILED" for r in own),
                         "failure_reasons": dict(Counter(r["reason"] for r in own if r["outcome"] == "FAILED"))}
    scored = [r for r in rows if r["outcome"] == "SUCCESS"]
    matrix = {"TP": 0, "FN": 0, "FP": 0, "TN": 0}
    for row in scored:
        require(row["prediction"] in ("SAME", "DIFFERENT") and math.isfinite(float(row["score"])), "Invalid scored row in metrics.")
        key = ("TP" if row["prediction"] == "SAME" else "FN") if row["truth"] == "SAME" else ("FP" if row["prediction"] == "SAME" else "TN")
        matrix[key] += 1
    require(all(r["score"] == r["prediction"] == "" for r in rows if r["outcome"] == "FAILED"), "Failure must not have a score/prediction.")
    return {"labels": labels, "confusion_matrix": {"positive_class": "SAME", **matrix},
            "false_match": ratio(matrix["FP"], labels["DIFFERENT"]["succeeded"]),
            "false_non_match": ratio(matrix["FN"], labels["SAME"]["succeeded"]),
            "accuracy_successful_only": ratio(matrix["TP"] + matrix["TN"], len(scored)),
            "processing_coverage": ratio(len(scored), len(rows))}


def report_ratio(metric):
    if metric["denominator"] == 0:
        return f"not available ({metric['numerator']}/0)"
    return f"{metric['numerator']}/{metric['denominator']} ({metric['rate']:.2%})"


def read_test_image(dataset, relative, hashes, allowed):
    target = (dataset / relative).resolve(strict=True)
    require(target.is_relative_to(dataset) and target.relative_to(dataset).as_posix() in allowed,
            "Test image resolves outside the selected test paths.")
    return read_selected_image(dataset, relative, hashes, allowed)


def run_test(dataset, manifest_dir, calibration_run_file, threshold_file, output,
             compare=None, verified_provenance=None, progress=None):
    require(not output.exists(), "Output already exists; refusing to overwrite test results.")
    dataset = dataset.resolve(strict=True)
    selected, hashes, decision, calibration, checksums, input_paths, validation = load_test_inputs(dataset, manifest_dir, calibration_run_file, threshold_file)
    allowed = {r[k] for r in selected for k in ("image_a", "image_b")}
    for relative in sorted(allowed):
        read_test_image(dataset, relative, hashes, allowed)
    if compare is None:
        from inference import compare_images, model_provenance
        from download_models import verify_models
        compare = compare_images
        verified_provenance = model_provenance(verify_models())
    profile = clean_provenance(verified_provenance)
    integrity(profile == clean_provenance(calibration["provenance"]), "Installed model/detector/preprocessing/runtime differs from calibration; no test inference allowed.")
    threshold = decision["threshold"]
    run_id = str(uuid.uuid4())
    run = {"run_id": run_id, "split": "test", "started_at": utc_now(), "threshold": threshold,
           "threshold_sha256_before": checksums["threshold"], "threshold_decision_id": decision["decision_id"],
           "inputs": checksums, "provenance": profile, "pipeline": decision["pipeline"],
           "test_runner_sha256": sha(Path(__file__).read_bytes()), "test_images": len(allowed),
           "calibration_pairs_processed": 0, "calibration_image_reads": 0,
           "manifest_validation": validation["manifest_validation"], "source": decision["source"],
           "limitations": "Only 51 held-out London participants, neutral-versus-smiling. Pairs share photos/participants and are not all independent. Not login security, liveness or real-camera generalization evidence."}
    output.parent.mkdir(parents=True, exist_ok=True)
    output.mkdir(exist_ok=False)
    results = []
    with (output / "test-results.csv").open("x", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=TEST_COLUMNS); writer.writeheader()
        for index, pair in enumerate(selected, 1):
            row = {**pair, "run_id": run_id, "started_at": utc_now(), "outcome": "FAILED", "score": "", "prediction": "",
                   "reason": "", "failure_photo": "", "model": decision["model"], "metric": decision["metric"],
                   "provenance_scope": "run_verified_config", "threshold": repr(threshold), "threshold_sha256": checksums["threshold"], **profile}
            a = b = None
            try:
                a = read_test_image(dataset, pair["image_a"], hashes, allowed)
                b = read_test_image(dataset, pair["image_b"], hashes, allowed)
                value = compare(a, b)
                try:
                    returned_profile = clean_provenance(value.get("provenance"))
                except (ValueError, TypeError) as error:
                    raise IntegrityError("Missing/invalid inference provenance; test run stopped.") from error
                integrity(returned_profile == profile, "Inference provenance changed during test run.")
                integrity(value.get("model") == decision["model"] and value.get("metric") == decision["metric"], "Inference model/metric contract changed.")
                predicted = prediction(value.get("score"), threshold)
                if predicted is None:
                    row["reason"] = "FACE_SCORE_INVALID"
                else:
                    row.update(outcome="SUCCESS", score=repr(float(value["score"])), prediction=predicted, provenance_scope="inference_response")
            except IntegrityError:
                raise  # Preserve partial output and stop; never continue under a changed model.
            except Exception as error:
                row["reason"] = error.code if getattr(error, "code", None) in SAFE_REASONS else "FACE_PROCESS_FAILED"
                row["failure_photo"] = getattr(error, "photo", "") if getattr(error, "photo", None) in ("A", "B") else ""
            finally:
                a = b = None
            row["completed_at"] = utc_now()
            writer.writerow(row); handle.flush(); results.append(row)
            if progress:
                progress(index, len(selected))
    integrity(len(results) == len({r["pair_id"] for r in results}) == 102, "Test result coverage is not exactly once.")
    after = {key: sha(file.read_bytes()) for key, file in input_paths.items()}
    integrity(after == checksums, "Threshold or input artifact changed during test run; results remain partial/unconfirmed.")
    run.update(status="COMPLETED", completed_at=utc_now(), attempted=102, exactly_once=True,
               threshold_sha256_after=after["threshold"], threshold_unchanged=True,
               results_sha256=sha((output / "test-results.csv").read_bytes()), metrics=test_metrics(results))
    with (output / "test-run.json").open("x", encoding="utf-8") as handle:
        handle.write(json.dumps(run, indent=2, allow_nan=False) + "\n")
    matrix, labels = run["metrics"]["confusion_matrix"], run["metrics"]["labels"]
    report = f"""# London held-out test report

Frozen threshold: {threshold!r}, operator >=; no retuning.
Threshold SHA-256 before/after: {checksums['threshold']} (unchanged).

| Actual label | Attempted | Succeeded | Failed |
| --- | ---: | ---: | ---: |
| SAME | {labels['SAME']['attempted']} | {labels['SAME']['succeeded']} | {labels['SAME']['failed']} |
| DIFFERENT | {labels['DIFFERENT']['attempted']} | {labels['DIFFERENT']['succeeded']} | {labels['DIFFERENT']['failed']} |

Confusion matrix: SAME is positive. Successful pairs only; failures excluded.

| Actual / predicted | SAME | DIFFERENT |
| --- | ---: | ---: |
| SAME | TP={matrix['TP']} | FN={matrix['FN']} |
| DIFFERENT | FP={matrix['FP']} | TN={matrix['TN']} |

False match / successfully processed DIFFERENT: {report_ratio(run['metrics']['false_match'])}.
False non-match / successfully processed SAME: {report_ratio(run['metrics']['false_non_match'])}.
Accuracy, successful pairs only: {report_ratio(run['metrics']['accuracy_successful_only'])}.
Processing coverage, successes / all attempted pairs: {report_ratio(run['metrics']['processing_coverage'])}.
Processing failures have empty score/prediction, never score zero or DIFFERENT.
All 102 test pairs recorded exactly once; calibration inference/image reads: 0.

This covers 51 held-out participants from London neutral-front versus smiling-front.
Pairs share photos/participants, so observations are not all independent. This
is not an official benchmark or proof of login security, liveness or real-camera
generalization. No model/preprocessing/threshold was changed or installed in the app.

Dataset attribution: Lisa DeBruine and Benedict Jones (2017), Face Research Lab
London Set, DOI 10.6084/m9.figshare.5047666, CC BY 4.0.
"""
    with (output / "test-report.md").open("x", encoding="utf-8") as handle:
        handle.write(report)
    return run


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--manifest-dir", type=Path, required=True)
    parser.add_argument("--calibration-run", type=Path, required=True)
    parser.add_argument("--threshold", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    def progress(done, total):
        if done % 10 == 0 or done == total:
            print(f"Test progress: {done}/{total}", flush=True)
    run = run_test(args.dataset, args.manifest_dir, args.calibration_run, args.threshold, args.output, progress=progress)
    print(json.dumps({"status": run["status"], "threshold": run["threshold"], "metrics": run["metrics"],
                      "threshold_unchanged": run["threshold_unchanged"], "calibration_pairs_processed": 0}, indent=2, allow_nan=False))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, KeyError, TypeError, IndexError, csv.Error, RuntimeError) as error:
        print(f"Stage 8 stopped: {error}. Preserve any partial output; do not overwrite, retune or repeat calibration.", file=sys.stderr)
        raise SystemExit(1)
