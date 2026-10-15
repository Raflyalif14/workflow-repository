# Stage 6B: calibration-only offline evaluation

## Scope and implementation

`services/face-experiment/evaluate_london_calibration.py` calls the existing
`inference.compare_images()` directly. It does not copy inference logic or change
YuNet, the exactly-one-face gate, five-landmark alignment, SFace, preprocessing,
input limits or cosine calculation. `inference.py` remains unchanged.

The runner validates the whole CSV protocol against the saved `splits.json`,
metadata IDs, deterministic seed-42 memberships, saved image index and checksums.
It reuses Stage 6A `validate()` but deliberately does **not** call `inventory()`,
which would read all JPEGs. Test rows/IDs/checksum strings are inspected only as
manifest metadata. Current test JPEGs are not opened, read, decoded, hashed,
resolved or evaluated; their current bytes are not revalidated in this step.

Only the 102 selected calibration pairs are evaluated. Every calibration JPEG is
checked against its saved checksum before model loading and again when used.
The allowed-path guard rejects non-calibration image reads. Inputs are the
original dataset JPEGs, not `.tem`, screen captures or alternate crops.

Dataset: Face Research Lab London Set, Lisa DeBruine and Benedict Jones (2017),
DOI `10.6084/m9.figshare.5047666`, licensed CC BY 4.0.
Source: https://figshare.com/articles/dataset/Face_Research_Lab_London_Set/5047666
License: https://creativecommons.org/licenses/by/4.0/
The local dataset release version is not guessed; Stage 6A byte checksums pin
the files. No photos are copied into Git and no demographic metadata is exported.

## Output and provenance

Input directory:
`C:\Users\Rafli\Downloads\face-experiment-results\london-stage6a`

New output directory:
`C:\Users\Rafli\Downloads\face-experiment-results\london-stage6b`

- `results.csv`: one row per calibration pair, original pairing metadata, run UUID,
  UTC start/completion times, SUCCESS/FAILED, full-precision score or empty score,
  safe failure code/photo slot, model/metric and verified provenance.
- `run.json`: run timestamps/status, Python version, manifest/splits/metadata
  checksums, runner/inference source checksums, result CSV checksum, actual model
  provenance, per-label counts/minimum/median/maximum and test-exclusion scope.

Scores use `repr(float(score))`, preserving the original returned float precision.
Failure is an empty CSV score, never zero. Known InputError codes are preserved;
other exceptions use `FACE_PROCESS_FAILED`, without raw error payloads. A failed
row's provenance is marked `run_verified_config`, not evidence that embeddings
were generated. Success is marked `inference_response` and must match the verified
run configuration. Raw photos, embeddings, internal keys/tokens are not stored or
printed. JPEG references remain dataset-relative; no capture sessions are invented.

Verified runtime: Python 3.10.0 / OpenCV 4.13.0; SFace 2021dec, YuNet 2023mar;
preprocessing `opencv-sface-five-landmark-112-v1`, embedding dimension 128.
Full model/detector SHA-256 values are in `run.json` and every result row.

Existing output directories are refused before loading models. Results are flushed
after each row. If interrupted, preserve the partial directory for inspection;
the runner does not resume/replay or overwrite it. A completed `run.json` is written
only after exactly-once result coverage passes. Use a deliberately new directory
for a later authorized run; do not silently overwrite this run.

## Actual run and validation

Real CPU inference ran from `2026-10-12T08:06:52.718751+00:00` to
`2026-10-12T08:07:21.953552+00:00` (approximately 29 seconds).

| Ground-truth label | Tried | Succeeded | Failed | Minimum | Median | Maximum |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| SAME | 51 | 51 | 0 | 0.8189847469329834 | 0.9236156940460205 | 0.9671351313591003 |
| DIFFERENT | 51 | 51 | 0 | -0.04370836541056633 | 0.13748419284820557 | 0.32718533277511597 |

These are cosine score summaries, not thresholds, accuracy, identity decisions
or match/no-match rates. Labels come from participant IDs in the manifest.

- PASS: focused synthetic runner test. Test JPEG files deliberately do not exist;
  a read guard rejects access to any non-calibration JPEG. Exactly 102 calibration
  calls/rows, one injected FACE_NONE with empty score, full-precision successful
  score, summary counts, invalid-label refusal before model use and overwrite
  refusal without changing outputs are verified. No model is used by this test.
- PASS: real run completed all 102 calibration pairs with zero failures.
- PASS: independent result readback matches all original calibration metadata,
  unique pair IDs, per-row provenance and recomputed statistics/checksums.
- PASS: actual completed output refuses a second invocation before inference;
  both saved output files remain byte-for-byte unchanged.
- Test image reads/inference: **0**. No test score was computed.
- PASS: new Python syntax, UTF-8, whitespace and `git diff --check` checks.
- No frontend/backend suite, dependency installation or model download repeated.

Synthetic failure tests prove how failures are recorded; this real calibration
run did not encounter a failure. Manifest test metadata checks do not prove that
test JPEG bytes on disk still match Stage 6A; those JPEGs remain untouched.

## Reproducible commands

For a new authorized output directory only (the directory below now exists and
will be refused):

```powershell
Set-Location -LiteralPath "D:\Workflow Repository System"
& ".\services\face-experiment\.venv\Scripts\python.exe" -B `
  ".\services\face-experiment\evaluate_london_calibration.py" `
  --dataset "C:\Users\Rafli\Downloads\5047666" `
  --manifest-dir "C:\Users\Rafli\Downloads\face-experiment-results\london-stage6a" `
  --output "C:\Users\Rafli\Downloads\face-experiment-results\london-stage6b"
if ($LASTEXITCODE -ne 0) { throw "Calibration stopped; inspect the reason and preserve any partial output." }
```

Focused synthetic test, without real inference:

```powershell
Set-Location -LiteralPath "D:\Workflow Repository System"
$env:PYTHONPATH = (Resolve-Path "services\face-experiment").Path
& ".\services\face-experiment\.venv\Scripts\python.exe" -B -m unittest discover `
  -s "services\face-experiment\tests" -p "test_london_calibration.py" -v
```

This is a project-created practice protocol, not an official benchmark, retraining,
liveness/anti-spoofing evaluation or evidence of biometric-login readiness.
Neutral/smiling is expression variation, not verified different recording sessions.
No threshold was chosen, no accuracy calculated and test evaluation remains pending.

## Git checkpoint

Branch `feat/face-verification`, HEAD `58bc3d7`, staging empty. All Stage 1–6A
existing changes retained. Stage 6B adds this document, the calibration runner
and its focused synthetic test. Results remain outside the repository.
No stage/commit/push, checkout/merge/reset, pipeline/UI/auth edit, database
mutation, new server or service termination was performed.
