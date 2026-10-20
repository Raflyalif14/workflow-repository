"""Stage 6A only: deterministic manifests, no inference or image copying. Stdlib only."""
import argparse
import csv
import hashlib
import io
import json
import random
import re
import sys
from collections import Counter
from pathlib import Path

SEED = 42
SPLITS = ("calibration", "test")
COLUMNS = ("pair_id", "split", "participant_a", "participant_b", "image_a", "image_b",
           "truth", "source_a", "source_b", "condition_a", "condition_b")
SOURCE = {
    "title": "Face Research Lab London Set",
    "authors": ["Lisa DeBruine", "Benedict Jones"],
    "doi": "10.6084/m9.figshare.5047666",
    "url": "https://figshare.com/articles/dataset/Face_Research_Lab_London_Set/5047666",
    "license": "CC BY 4.0",
    "license_url": "https://creativecommons.org/licenses/by/4.0/",
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def inventory(dataset):
    dataset = dataset.resolve(strict=True)
    metadata = dataset / "london_faces_info.csv"
    with metadata.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        require("face_id" in (reader.fieldnames or []), "Metadata must contain face_id.")
        ids = [row["face_id"] for row in reader]
    require(all(re.fullmatch(r"\d{3}", value) for value in ids), "Invalid face_id; three digits required, including leading zeros.")
    require(len(ids) == len(set(ids)) == 102, "Expected exactly 102 unique metadata IDs.")
    images, hashes = {}, {}
    for group, suffix in (("neutral_front", "03"), ("smiling_front", "08")):
        folder = dataset / group
        require(folder.is_dir(), f"Extracted folder not found: {group}.")
        mapping = {}
        for file in sorted(folder.rglob("*")):
            if not file.is_file() or file.suffix.lower() != ".jpg" or "__MACOSX" in file.parts or file.name.startswith("._"):
                continue
            match = re.fullmatch(rf"(\d{{3}})_{suffix}\.jpg", file.name, re.IGNORECASE)
            require(match is not None, f"Unexpected JPG filename in {group}: {file.name}.")
            participant = match[1]
            require(participant in ids, f"Image ID absent from metadata: {file.name}.")
            require(participant not in mapping, f"Duplicate image ID in {group}: {participant}.")
            relative = file.relative_to(dataset).as_posix()
            require(file.resolve().is_relative_to(dataset), f"Image escapes dataset root: {relative}.")
            content = file.read_bytes()
            require(content.startswith(b"\xff\xd8\xff"), f"Missing JPEG signature: {relative}.")
            mapping[participant] = relative
            hashes[relative] = hashlib.sha256(content).hexdigest()
        require(set(mapping) == set(ids), f"Missing image IDs in {group}: {','.join(sorted(set(ids) - set(mapping)))}.")
        images[group] = mapping
    return sorted(ids), images, hashes, hashlib.sha256(metadata.read_bytes()).hexdigest()


def make_splits(ids, hashes, metadata_hash):
    shuffled = sorted(ids)
    random.Random(SEED).shuffle(shuffled)
    return {
        "protocol": "london-stage6a-v1", "seed": SEED,
        "shuffle": "Python random.Random(42).shuffle applied to sorted three-digit IDs",
        "python_version": sys.version.split()[0],
        "source": SOURCE, "metadata_sha256": metadata_hash,
        "participants": {"calibration": sorted(shuffled[:51]), "test": sorted(shuffled[51:])},
        "image_sha256": dict(sorted(hashes.items())),
        "limits": "Project-created practice protocol; not an official benchmark, retraining, liveness test or login-readiness test. Capture sessions are unknown.",
    }


def make_pairs(groups, images):
    rows = []
    for split in SPLITS:
        ids = sorted(groups[split])
        for truth in ("SAME", "DIFFERENT"):
            for index, participant in enumerate(ids):
                other = participant if truth == "SAME" else ids[(index + 1) % len(ids)]
                rows.append(dict(zip(COLUMNS, (
                    f"{split}-{truth.lower()}-{participant}", split, participant, other,
                    images["neutral_front"][participant], images["smiling_front"][other], truth,
                    "DATASET", "DATASET", "NEUTRAL_FRONT", "SMILING_FRONT"))))
    return rows


def validate(rows, splits, ids, images, hashes, metadata_hash):
    expected = make_splits(ids, hashes, metadata_hash)
    require(splits == expected, "Split metadata differs from the deterministic seed-42 inventory.")
    groups = splits["participants"]
    require(not set(groups["calibration"]) & set(groups["test"]), "Participant leakage between splits.")
    seen_ids, seen_pairs, counts = set(), set(), Counter()
    used_paths, used_hashes = {s: set() for s in SPLITS}, {s: set() for s in SPLITS}
    for row in rows:
        require(set(row) == set(COLUMNS), "Unexpected/missing CSV columns; no inferred session fields allowed.")
        split, a, b = row["split"], row["participant_a"], row["participant_b"]
        require(split in SPLITS, "Invalid split label.")
        require(a in groups[split] and b in groups[split], "Participant belongs to another split or is absent from metadata.")
        require(row["pair_id"] not in seen_ids, "Duplicate pair_id.")
        seen_ids.add(row["pair_id"])
        pair = (row["image_a"], row["image_b"])
        require(pair not in seen_pairs, "Duplicate image pair.")
        seen_pairs.add(pair)
        require(pair == (images["neutral_front"][a], images["smiling_front"][b]), "Relative paths do not match metadata IDs and required conditions.")
        require(row["truth"] == ("SAME" if a == b else "DIFFERENT"), "Truth label contradicts participant IDs.")
        if row["truth"] == "DIFFERENT":
            ordered = groups[split]
            require(b == ordered[(ordered.index(a) + 1) % 51], "DIFFERENT pair does not use the next sorted group ID, with wraparound.")
        require(row["source_a"] == row["source_b"] == "DATASET", "Sources must be DATASET.")
        require((row["condition_a"], row["condition_b"]) == ("NEUTRAL_FRONT", "SMILING_FRONT"), "Unexpected conditions.")
        counts[(split, row["truth"])] += 1
        used_paths[split].update(pair)
        used_hashes[split].update(hashes[file] for file in pair)
    require(all(counts[(split, truth)] == 51 for split in SPLITS for truth in ("SAME", "DIFFERENT")), "Each split must contain exactly 51 SAME and 51 DIFFERENT pairs.")
    require(not used_paths["calibration"] & used_paths["test"], "Photo-path leakage between splits.")
    require(not used_hashes["calibration"] & used_hashes["test"], "Identical photo bytes occur in both splits.")
    require(rows == make_pairs(groups, images), "Manifest differs from the deterministic protocol/order.")
    return {"status": "PASS", "seed": SEED, "total_pairs": len(rows),
            "splits": {s: {"participants": len(groups[s]), "images": len(used_paths[s]), "SAME": counts[(s, "SAME")], "DIFFERENT": counts[(s, "DIFFERENT")]} for s in SPLITS},
            "participant_leakage": 0, "photo_leakage": 0, "duplicate_pairs": 0,
            "inference_executed": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--validate-only", action="store_true")
    args = parser.parse_args()
    require(args.validate_only or not args.output.exists(), "Output already exists; refusing to overwrite. Use --validate-only or a new directory.")
    ids, images, hashes, metadata_hash = inventory(args.dataset)
    if args.validate_only:
        splits = json.loads((args.output / "splits.json").read_text(encoding="utf-8"))
        with (args.output / "manifest.csv").open(encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            require(reader.fieldnames == list(COLUMNS), "Invalid CSV header.")
            rows = list(reader)
    else:
        splits = make_splits(ids, hashes, metadata_hash)
        rows = make_pairs(splits["participants"], images)
    report = validate(rows, splits, ids, images, hashes, metadata_hash)
    if not args.validate_only:
        # Reserve a new directory only after validation. A failed/partial write is retained for inspection.
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.mkdir(exist_ok=False)
        with (args.output / "manifest.csv").open("x", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=COLUMNS)
            writer.writeheader(); writer.writerows(rows)
        for name, value in (("splits.json", splits), ("validation.json", report)):
            with (args.output / name).open("x", encoding="utf-8") as handle:
                handle.write(json.dumps(value, indent=2, ensure_ascii=False) + "\n")
    else:
        require(json.loads((args.output / "validation.json").read_text(encoding="utf-8")) == report, "Saved validation summary differs from actual manifest.")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, KeyError, TypeError, csv.Error) as error:
        print(f"Stage 6A stopped: {error}", file=sys.stderr)
        sys.exit(1)
