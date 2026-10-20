"""Stage 7: freeze a calibration-only decision. No inference or image access."""
import argparse
import csv
import io
import json
import math
import re
import sys
import uuid
from collections import Counter
from pathlib import Path, PurePosixPath

# This module uses only stdlib at import; its inference import is inside run_calibration,
# which is never called here. Reuse existing result/provenance/statistics validation.
from evaluate_london_calibration import RESULT_COLUMNS, PROVENANCE, clean_provenance, sha, summarize, utc_now
from generate_london_manifest import require

EXPECTED_THRESHOLD = 0.5730850398540497


def prediction(score, threshold):
    if type(score) not in (int, float) or not math.isfinite(score) or not -1 <= score <= 1:
        return None
    return "SAME" if score >= threshold else "DIFFERENT"


def verify_calibration(input_dir):
    results_bytes = (input_dir / "results.csv").read_bytes()
    run_bytes = (input_dir / "run.json").read_bytes()
    run = json.loads(run_bytes)
    require(sha(results_bytes) == run["results_sha256"], "results.csv checksum differs from run.json.")
    require(run["status"] == "COMPLETED" and run["split"] == "calibration" and run["exactly_once"] is True, "Run must be completed calibration with exactly-once coverage.")
    require(run["test_pairs_processed"] == run["inputs"]["test_image_reads"] == 0, "Input run does not establish test exclusion.")
    with io.StringIO(results_bytes.decode("utf-8"), newline="") as handle:
        reader = csv.DictReader(handle)
        require(reader.fieldnames == list(RESULT_COLUMNS), "Unexpected result CSV schema.")
        rows = list(reader)
    require(len(rows) == run["attempted"] == len({r["pair_id"] for r in rows}) == 102, "Expected exactly 102 unique calibration pair results.")
    require(Counter(r["truth"] for r in rows) == {"SAME": 51, "DIFFERENT": 51}, "Expected 51 SAME and 51 DIFFERENT results.")
    profile = clean_provenance(run["provenance"])
    participants = sorted({r["participant_a"] for r in rows})
    require(len(participants) == 51 and all(re.fullmatch(r"\d{3}", p) for p in participants), "Expected 51 three-digit calibration participant IDs.")
    for truth in ("SAME", "DIFFERENT"):
        label_rows = [r for r in rows if r["truth"] == truth]
        require({r["participant_a"] for r in label_rows} == set(participants), "Missing participant pair in a calibration label.")
    for row in rows:
        a, b, truth = row["participant_a"], row["participant_b"], row["truth"]
        require(row["split"] == "calibration" and row["run_id"] == run["run_id"], "Result belongs to another split/run.")
        require(b in participants and (a == b) == (truth == "SAME"), "Pair label contradicts participant IDs.")
        require(row["pair_id"] == f"calibration-{truth.lower()}-{a}", "Unexpected calibration pair ID.")
        if truth == "DIFFERENT":
            require(b == participants[(participants.index(a) + 1) % 51], "DIFFERENT pair violates the frozen next-ID protocol.")
        for key, group, participant, suffix in (("image_a", "neutral_front", a, "03"), ("image_b", "smiling_front", b, "08")):
            path = PurePosixPath(row[key])
            require(not path.is_absolute() and ".." not in path.parts and "\\" not in row[key] and
                    path.parts[0] == group and path.name == f"{participant}_{suffix}.jpg", "Unexpected image reference; no image is opened.")
        require(row["source_a"] == row["source_b"] == "DATASET" and row["condition_a"] == "NEUTRAL_FRONT" and row["condition_b"] == "SMILING_FRONT", "Unexpected dataset sources/conditions.")
        require(row["model"] == "opencv-sface-2021dec" and row["metric"] == "cosine", "Unexpected model/score contract.")
        require(all(row[k] == str(profile[k]) for k in PROVENANCE), "Per-row provenance differs from the calibration run.")
        if row["outcome"] == "SUCCESS":
            score = float(row["score"])
            require(math.isfinite(score) and -1 <= score <= 1 and row["reason"] == "" and row["provenance_scope"] == "inference_response", "Invalid successful result.")
        else:
            require(row["outcome"] == "FAILED" and row["score"] == "" and row["reason"] != "" and row["provenance_scope"] == "run_verified_config", "A failed result must have an empty score and no prediction.")
    stats = summarize(rows)
    require(stats == run["labels"], "Recomputed full-precision statistics differ from run.json.")
    # This decision is specifically for the completed Stage 6B input, not a replacement run.
    require(all(s["succeeded"] == 51 and s["failed"] == 0 for s in stats.values()), "Expected the Stage 6B run with all 102 successful scores; stop to review changed input.")
    require(stats["DIFFERENT"]["score_max"] < stats["SAME"]["score_min"], "Calibration has no positive gap for this midpoint method.")
    threshold = (stats["DIFFERENT"]["score_max"] + stats["SAME"]["score_min"]) / 2
    require(threshold == EXPECTED_THRESHOLD, "Midpoint differs from the expected 0.5730850398540497; stop for input review.")
    return rows, run, stats, threshold, {"results_csv_sha256": sha(results_bytes), "run_json_sha256": sha(run_bytes)}


def freeze(input_dir, output):
    require(not output.exists(), "Output already exists; refusing to overwrite the frozen threshold.")
    rows, run, stats, threshold, checksums = verify_calibration(input_dir)
    boundaries = []
    for case, score, expected in (("below", math.nextafter(threshold, -math.inf), "DIFFERENT"),
                                  ("exactly_at", threshold, "SAME"),
                                  ("above", math.nextafter(threshold, math.inf), "SAME")):
        actual = prediction(score, threshold)
        require(actual == expected, f"Boundary rule failed: {case}.")
        boundaries.append({"case": case, "score": score, "expected": expected, "actual": actual, "status": "PASS"})
    require(prediction(None, threshold) is None and prediction(math.nan, threshold) is None,
            "Processing failure/invalid score must not become score zero or DIFFERENT.")
    metrics = {}
    for metric, truth, mistaken_prediction in (("false_match", "DIFFERENT", "SAME"), ("false_non_match", "SAME", "DIFFERENT")):
        scored = [r for r in rows if r["truth"] == truth and r["outcome"] == "SUCCESS"]
        count = sum(prediction(float(r["score"]), threshold) == mistaken_prediction for r in scored)
        metrics[metric] = {"count": count, "denominator": len(scored), "denominator_definition": f"successfully_processed_{truth}_pairs", "rate": count / len(scored)}
    decision = {
        "schema": "london-threshold-experiment-v1", "decision_id": str(uuid.uuid4()),
        "threshold": threshold, "method": "midpoint_of_calibration_gap", "decided_at": utc_now(),
        "rule": {"expression": "score >= threshold means SAME", "operator": ">=", "at_or_above": "SAME", "below": "DIFFERENT", "processing_failure_or_invalid_score": "NO_PREDICTION"},
        "calibration": {"run_id": run["run_id"], "pairs": 102, "SAME": 51, "DIFFERENT": 51,
                        "successful": 102, "failed": 0, "statistics": stats, **metrics},
        "inputs": {**checksums, "manifest_sha256": run["inputs"]["manifest_sha256"], "splits_sha256": run["inputs"]["splits_sha256"]},
        "model": "opencv-sface-2021dec", "metric": "cosine", "provenance": run["provenance"],
        "pipeline": {"inference_source_sha256": run["inference_source_sha256"], "calibration_runner_sha256": run["runner_sha256"], "python_version": run["python_version"]},
        "scope": "London Set neutral-front versus smiling-front offline experiment only",
        "source": run["inputs"]["source"],
        "freeze_policy": {"frozen_before_test_evaluation": True, "retune_using_test_results": False, "installed_in_application": False},
        "failure_policy": "Processing failures have no score/prediction and are excluded from false-match/false-non-match scored denominators; report them separately.",
        "validation": {"boundaries": boundaries, "failure_is_no_prediction": "PASS", "input_checksums": "PASS", "calibration_coverage": "PASS", "test_data_read": False, "inference_executed": False},
        "limitations": "Calibration-only observation; not retraining, an official benchmark, liveness verification or a production login threshold.",
    }
    encoded = (json.dumps(decision, indent=2, allow_nan=False) + "\n").encode("utf-8")
    report = f"""# London calibration threshold decision

Threshold: **{threshold!r}**
Method: `midpoint_of_calibration_gap`.
Rule: successful score >= threshold predicts SAME; below predicts DIFFERENT.
Established UTC: {decision['decided_at']}.

Formula: ({stats['DIFFERENT']['score_max']!r} + {stats['SAME']['score_min']!r}) / 2.

Calibration: 102 pairs; 51 SAME and 51 DIFFERENT; 102 successful, 0 failed.
False match: {metrics['false_match']['count']}/{metrics['false_match']['denominator']} successfully processed DIFFERENT pairs.
False non-match: {metrics['false_non_match']['count']}/{metrics['false_non_match']['denominator']} successfully processed SAME pairs.
These are calibration error counts, not test/generalization or production claims.

Processing failures have an empty score and NO_PREDICTION, not score 0 or DIFFERENT.
Boundary checks below/exactly at/above: PASS. Missing/NaN score: NO_PREDICTION PASS.

results.csv SHA-256: {checksums['results_csv_sha256']}
run.json SHA-256: {checksums['run_json_sha256']}
threshold.json SHA-256: {sha(encoded)}
Full verified model/pipeline provenance and denominator definitions are in threshold.json.

The decision is frozen before test evaluation. Future test results must not retune
this threshold. No test image or test score was read; no inference was run here.
Scope: London neutral-front versus smiling-front experiment only. This is not
retraining, an official benchmark, liveness testing or a production login threshold.
The threshold is not installed in the application.

Attribution: Face Research Lab London Set, Lisa DeBruine and Benedict Jones (2017),
DOI 10.6084/m9.figshare.5047666, CC BY 4.0.
"""
    output.parent.mkdir(parents=True, exist_ok=True)
    output.mkdir(exist_ok=False)
    with (output / "threshold.json").open("xb") as handle:
        handle.write(encoded)
    with (output / "calibration-report.md").open("x", encoding="utf-8") as handle:
        handle.write(report)
    return decision


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    decision = freeze(args.input, args.output)
    print(json.dumps({"threshold": decision["threshold"], "method": decision["method"],
                      "pairs": decision["calibration"]["pairs"], "false_match": decision["calibration"]["false_match"],
                      "false_non_match": decision["calibration"]["false_non_match"], "validation": decision["validation"]}, indent=2, allow_nan=False))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, KeyError, TypeError, IndexError, csv.Error) as error:
        print(f"Stage 7 stopped: {error}. Do not overwrite or retune using test data.", file=sys.stderr)
        raise SystemExit(1)
