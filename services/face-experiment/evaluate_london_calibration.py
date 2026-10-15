"""Stage 6B: calibration-only offline evaluation through the existing inference function."""
import argparse
import csv
import hashlib
import io
import json
import math
import re
import statistics
import sys
import uuid
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

from generate_london_manifest import COLUMNS, require, validate

PROVENANCE = ("modelVersion", "modelSha256", "detectorVersion", "detectorSha256",
              "preprocessingVersion", "runtimeVersion", "embeddingDimensions")
RESULT_COLUMNS = COLUMNS + ("run_id", "started_at", "completed_at", "outcome", "score",
                            "reason", "failure_photo", "model", "metric", "provenance_scope") + PROVENANCE
SAFE_REASONS = {"FACE_NONE", "FACE_MULTIPLE", "FACE_IMAGE_INVALID", "FACE_INPUT_LIMIT"}


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def sha(content):
    return hashlib.sha256(content).hexdigest()


def load_calibration(dataset, manifest_dir):
    """Validate all manifest metadata, never open/stat/resolve a test image."""
    dataset = dataset.resolve(strict=True)
    manifest_bytes = (manifest_dir / "manifest.csv").read_bytes()
    split_bytes = (manifest_dir / "splits.json").read_bytes()
    splits = json.loads(split_bytes)
    with io.StringIO(manifest_bytes.decode("utf-8"), newline="") as handle:
        reader = csv.DictReader(handle)
        require(reader.fieldnames == list(COLUMNS), "Invalid manifest CSV header.")
        rows = list(reader)
    metadata = dataset / "london_faces_info.csv"
    metadata_bytes = metadata.read_bytes()
    with io.StringIO(metadata_bytes.decode("utf-8-sig"), newline="") as handle:
        reader = csv.DictReader(handle)
        require("face_id" in (reader.fieldnames or []), "Missing metadata face_id.")
        ids = [row["face_id"] for row in reader]
    require(len(ids) == len(set(ids)) == 102 and all(re.fullmatch(r"\d{3}", value) for value in ids), "Expected 102 unique three-digit metadata IDs.")
    images = {"neutral_front": {}, "smiling_front": {}}
    hashes = splits["image_sha256"]
    for relative, checksum in hashes.items():
        # Test entries are validated as strings/checksums only; their files stay unopened.
        path = PurePosixPath(relative)
        require(not path.is_absolute() and ".." not in path.parts and "\\" not in relative,
                "Unsafe relative image path in split inventory.")
        require(path.parts and path.parts[0] in images and "__MACOSX" not in path.parts, "Invalid image group path.")
        suffix = "03" if path.parts[0] == "neutral_front" else "08"
        match = re.fullmatch(rf"(\d{{3}})_{suffix}\.jpg", path.name, re.IGNORECASE)
        require(match is not None and match[1] in ids, "Split image ID is inconsistent with metadata.")
        require(match[1] not in images[path.parts[0]], "Duplicate participant image in split inventory.")
        require(isinstance(checksum, str) and re.fullmatch(r"[0-9a-f]{64}", checksum), "Invalid saved image checksum.")
        images[path.parts[0]][match[1]] = relative
    require(all(set(group) == set(ids) for group in images.values()), "Split inventory must contain both photos for every metadata ID.")
    metadata_hash = sha(metadata_bytes)
    # Reuse Stage 6A's exact protocol validator, without its all-image inventory().
    validation = validate(rows, splits, sorted(ids), images, hashes, metadata_hash)
    selected = [row for row in rows if row["split"] == "calibration"]
    require(len(selected) == 102 and Counter(row["truth"] for row in selected) == {"SAME": 51, "DIFFERENT": 51}, "Expected 102 calibration pairs: 51 SAME and 51 DIFFERENT.")
    calibration_paths = {row[key] for row in selected for key in ("image_a", "image_b")}
    test_paths = {row[key] for row in rows if row["split"] == "test" for key in ("image_a", "image_b")}
    require(not calibration_paths & test_paths, "Photo leakage across splits.")
    return selected, hashes, {
        "manifest_sha256": sha(manifest_bytes), "splits_sha256": sha(split_bytes),
        "metadata_sha256": metadata_hash, "manifest_validation": validation,
        "calibration_images": len(calibration_paths), "test_image_reads": 0,
        "test_validation": "Metadata/saved checksums only; current test JPEG bytes were not read or revalidated.",
        "source": splits["source"],
    }


def read_calibration_image(dataset, relative, hashes, allowed):
    require(relative in allowed, "Refusing to open a non-calibration image.")
    file = (dataset / relative).resolve(strict=True)
    require(file.is_relative_to(dataset), "Calibration image escapes dataset root.")
    content = file.read_bytes()
    require(sha(content) == hashes[relative], "Calibration JPEG differs from the saved Stage 6A checksum.")
    require(content.startswith(b"\xff\xd8\xff"), "Calibration file lacks a JPEG signature.")
    return content


def clean_provenance(value):
    require(isinstance(value, dict), "Missing model provenance.")
    result = {key: value.get(key) for key in PROVENANCE}
    require(all(isinstance(result[k], str) and re.fullmatch(r"[0-9a-f]{64}", result[k]) for k in ("modelSha256", "detectorSha256")), "Invalid model checksum provenance.")
    require(all(isinstance(result[k], str) and re.fullmatch(r"[A-Za-z0-9_.-]{1,100}", result[k]) for k in ("modelVersion", "detectorVersion", "preprocessingVersion", "runtimeVersion")), "Invalid model version provenance.")
    require(result["embeddingDimensions"] == 128, "Unexpected embedding dimensions.")
    return result


def summarize(results):
    summary = {}
    for truth in ("SAME", "DIFFERENT"):
        rows = [r for r in results if r["truth"] == truth]
        scores = [float(r["score"]) for r in rows if r["outcome"] == "SUCCESS"]
        summary[truth] = {"attempted": len(rows), "succeeded": len(scores), "failed": len(rows) - len(scores),
                          "score_min": min(scores) if scores else None,
                          "score_median": statistics.median(scores) if scores else None,
                          "score_max": max(scores) if scores else None,
                          "failure_reasons": dict(Counter(r["reason"] for r in rows if r["outcome"] == "FAILED"))}
    return summary


def run_calibration(dataset, manifest_dir, output, compare=None, verified_provenance=None, progress=None):
    require(not output.exists(), "Output already exists; refusing to overwrite calibration results.")
    dataset = dataset.resolve(strict=True)
    selected, hashes, inputs = load_calibration(dataset, manifest_dir)
    allowed = {row[key] for row in selected for key in ("image_a", "image_b")}
    # Check every selected file before loading a model. Test JPEGs are never accessed.
    for relative in sorted(allowed):
        read_calibration_image(dataset, relative, hashes, allowed)
    if compare is None:
        from inference import compare_images, model_provenance
        from download_models import verify_models
        compare = compare_images
        verified_provenance = model_provenance(verify_models())
    provenance = clean_provenance(verified_provenance)
    run_id, started_at = str(uuid.uuid4()), utc_now()
    run = {"run_id": run_id, "split": "calibration", "started_at": started_at,
           "python_version": sys.version.split()[0], "inputs": inputs, "provenance": provenance,
           "inference_source_sha256": sha(Path(__file__).with_name("inference.py").read_bytes()),
           "runner_sha256": sha(Path(__file__).read_bytes()),
           "limits": "Practice protocol, not an official benchmark. No test inference, threshold, accuracy, identity decision, liveness or login-readiness assessment."}
    output.parent.mkdir(parents=True, exist_ok=True)
    output.mkdir(exist_ok=False)
    results = []
    with (output / "results.csv").open("x", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=RESULT_COLUMNS)
        writer.writeheader()
        for index, pair in enumerate(selected, 1):
            row = {**pair, "run_id": run_id, "started_at": utc_now(), "outcome": "FAILED", "score": "",
                   "reason": "", "failure_photo": "", "model": "opencv-sface-2021dec", "metric": "cosine",
                   "provenance_scope": "run_verified_config", **provenance}
            a = b = None
            try:
                a = read_calibration_image(dataset, pair["image_a"], hashes, allowed)
                b = read_calibration_image(dataset, pair["image_b"], hashes, allowed)
                value = compare(a, b)
                require(value.get("model") == "opencv-sface-2021dec" and value.get("metric") == "cosine", "Unexpected inference result contract.")
                score = value.get("score")
                require(type(score) in (float, int) and math.isfinite(score) and -1 <= score <= 1, "Invalid cosine score.")
                require(clean_provenance(value.get("provenance")) == provenance, "Model provenance changed during the run.")
                row.update(outcome="SUCCESS", score=repr(float(score)), provenance_scope="inference_response")
            except Exception as error:
                row["reason"] = error.code if getattr(error, "code", None) in SAFE_REASONS else "FACE_PROCESS_FAILED"
                row["failure_photo"] = getattr(error, "photo", "") if getattr(error, "photo", None) in ("A", "B") else ""
            finally:
                # Existing inference disposes arrays/embeddings; runner retains no JPEG bytes.
                a = b = None
            row["completed_at"] = utc_now()
            writer.writerow(row); handle.flush(); results.append(row)
            if progress:
                progress(index, len(selected))
    require(len(results) == len({row["pair_id"] for row in results}) == 102, "Result coverage is not exactly once per calibration pair.")
    run.update(status="COMPLETED", completed_at=utc_now(), attempted=len(results), labels=summarize(results),
               results_sha256=sha((output / "results.csv").read_bytes()),
               exactly_once=True, test_pairs_processed=0)
    with (output / "run.json").open("x", encoding="utf-8") as handle:
        handle.write(json.dumps(run, indent=2, allow_nan=False) + "\n")
    return run


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--manifest-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    def progress(done, total):
        if done % 10 == 0 or done == total:
            print(f"Calibration progress: {done}/{total}", flush=True)
    run = run_calibration(args.dataset, args.manifest_dir, args.output, progress=progress)
    print(json.dumps({"status": run["status"], "attempted": run["attempted"], "labels": run["labels"],
                      "test_pairs_processed": run["test_pairs_processed"], "test_image_reads": run["inputs"]["test_image_reads"]}, indent=2, allow_nan=False))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, KeyError, TypeError, csv.Error, RuntimeError) as error:
        print(f"Stage 6B stopped: {error}. Keep any partial output for inspection; do not overwrite/replay it.", file=sys.stderr)
        sys.exit(1)
