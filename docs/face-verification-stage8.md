# Stage 8: held-out London test with frozen threshold

## Scope and implementation

`services/face-experiment/evaluate_london_test.py` calls the unchanged
`inference.compare_images()` pipeline: YuNet -> five-landmark alignment -> SFace
-> cosine. It reuses Stage 6B metadata/provenance/guarded-read helpers and Stage 7
`prediction(score, threshold)`. No inference implementation is copied or changed.

The threshold value is read from `threshold.json`: **0.5730850398540497**, with
operator `>=`. An expected-value constant is used only to reject altered input,
never as the source for classification. No threshold search or retuning occurs.
Successful score >= the artifact's threshold predicts SAME; below predicts
DIFFERENT. Failures/invalid/non-finite scores have an empty score and prediction.

Before inference, the runner validates:

- Manifest/split SHA-256 against both calibration `run.json` and frozen decision.
- Calibration run SHA-256/run ID/results checksum linkage to the frozen decision.
- Exactly 51 calibration and 51 test participant IDs, with no intersection.
- Complete deterministic pairing metadata using the existing Stage 6A validator.
  Stage 6B's metadata loader does not open any JPEG; only its validation is reused.
- Frozen schema/operator/failure/freeze policy, model and pipeline linkage.
- Current inference/helper source hashes and Python version against calibration.
- Installed model/detector checksums, preprocessing, OpenCV runtime and embedding
  dimensions against the actual calibration provenance. Mismatch stops before
  test inference. Changed inference provenance mid-run also stops the run.

Only the 102 test rows (51 SAME/51 DIFFERENT) are selected. Only test JPEG paths
are allowed, including their resolved physical targets. Original bytes are
checked against Stage 6A SHA-256 before model loading and again per pair. No
calibration JPEG or calibration score CSV is read, and calibration inference is
not repeated. No `.tem`, screen recapture or alternate crop is used.

## Input/output and traceability

Input root: `C:\Users\Rafli\Downloads\face-experiment-results`:

- `london-stage6a/manifest.csv`, `splits.json`.
- `london-stage6b/run.json`.
- `london-stage7/threshold.json`.

New output: `C:\Users\Rafli\Downloads\face-experiment-results\london-stage8`:

- `test-results.csv`: exactly one row per test pair, original metadata, full-precision
  score, SUCCESS/FAILED, prediction or empty prediction, safe reason/photo slot,
  UTC times, run ID, model provenance, threshold value and threshold checksum.
- `test-run.json`: input/source/result checksums, run timestamps, threshold checksum
  before/after, provenance, label counts, matrix and metrics with explicit numerators,
  denominators and rates (`null` when denominator is zero).
- `test-report.md`: readable counts/matrix/metrics, threshold checksum and limits.

Threshold SHA-256 before and after the real run:
`259ba36c5cbbe645b0892e63fd186a4911d62b3d4c8b491ca38f2d03eb3cad57`.
The bytes are unchanged. All input artifact checksums are rechecked after inference;
drift prevents a completed report. Threshold files are never written by this runner.

No photos, embeddings, key/token or raw exception payload is exported/logged.
Failed rows keep an empty score/prediction, not score 0 or DIFFERENT. Failure reasons
are safe codes. Failure provenance is marked run-verified configuration, not proof
that an embedding was produced. Successful response provenance must match the run.

Existing output is refused before input/model use. Results are flushed per row.
If interrupted or an integrity guard fails, preserve partial output for review;
do not overwrite/resume it or retune the threshold. Completed JSON/report are only
written after coverage and input/threshold checksum checks pass.

## Real test observations

Real CPU run: `2026-10-12T08:34:15.872811+00:00` to
`2026-10-12T08:34:46.776403+00:00`, approximately 31 seconds.

| Actual label | Attempted | Succeeded | Failed |
| --- | ---: | ---: | ---: |
| SAME | 51 | 51 | 0 |
| DIFFERENT | 51 | 51 | 0 |

Confusion matrix, SAME as positive, successful pairs only:

| Actual / predicted | SAME | DIFFERENT |
| --- | ---: | ---: |
| SAME | TP=51 | FN=0 |
| DIFFERENT | FP=0 | TN=51 |

- False match: **0/51 (0%)**, denominator = successfully processed DIFFERENT.
- False non-match: **0/51 (0%)**, denominator = successfully processed SAME.
- Accuracy, successful pairs only: **102/102 (100%)**.
- Processing coverage: **102/102 (100%)**, successes / all attempted pairs.
- Calibration inference/JPEG reads: **0**.

Failures are excluded from scored metrics but remain in attempted counts and
coverage. If a scored denominator is zero, display **not available (numerator/0)**,
not a fabricated rate. This run had no processing failure.

## Focused verification

- PASS: two synthetic runner tests, no model inference. Calibration JPEGs deliberately
  do not exist; a read guard proves test-only access. All 102 selected pairs are
  recorded once. Exact/below/above boundary, FACE_NONE and NaN handling are checked.
- PASS: synthetic matrix TP=48/FN=1/FP=1/TN=50; denominators 1/51 false match,
  1/49 false non-match, 98/100 accuracy and 100/102 coverage prove failures are not
  counted as negative predictions. Zero-denominator rates are unavailable.
- PASS: overwrite, changed operator and incompatible runtime refused before
  inference; threshold-byte mutation mid-run prevents a completed result.
- PASS: actual test run and independent readback of exact metadata, coverage,
  predictions, matrix, provenance, input/result checksums and immutable threshold.
- PASS: second invocation against the completed output refused before inference;
  all three saved files remained byte-for-byte unchanged.
- PASS: Python syntax, strict UTF-8, whitespace and `git diff --check`.
- No prior frontend/backend suite, model download or dependency install repeated.

## Rerun instructions

For a separately authorized run in a **new** output directory only; the path below
now exists and will be refused:

```powershell
Set-Location -LiteralPath "D:\Workflow Repository System"
& ".\services\face-experiment\.venv\Scripts\python.exe" -B `
  ".\services\face-experiment\evaluate_london_test.py" `
  --dataset "C:\Users\Rafli\Downloads\5047666" `
  --manifest-dir "C:\Users\Rafli\Downloads\face-experiment-results\london-stage6a" `
  --calibration-run "C:\Users\Rafli\Downloads\face-experiment-results\london-stage6b\run.json" `
  --threshold "C:\Users\Rafli\Downloads\face-experiment-results\london-stage7\threshold.json" `
  --output "C:\Users\Rafli\Downloads\face-experiment-results\london-stage8"
if ($LASTEXITCODE -ne 0) { throw "Test evaluation stopped; preserve partial output and do not retune." }
```

Synthetic test only:

```powershell
Set-Location -LiteralPath "D:\Workflow Repository System"
$env:PYTHONPATH = (Resolve-Path "services\face-experiment").Path
& ".\services\face-experiment\.venv\Scripts\python.exe" -B -m unittest discover `
  -s "services\face-experiment\tests" -p "test_london_test.py" -v
```

## Limits and Git checkpoint

Only **51 held-out participants** in this London neutral-front versus smiling-front
protocol were tested. Pairs share photos/participants, so they are **not all
independent observations**. Different capture sessions were not established. The
reported rates do not prove login security, liveness, demographic robustness or
generalization to a real camera. No confidence/generalization claim is inferred
from the observed zero error counts. This is a project exercise, not an official
benchmark, training or production-login threshold.

Dataset attribution: Lisa DeBruine and Benedict Jones (2017), Face Research Lab
London Set, DOI `10.6084/m9.figshare.5047666`, CC BY 4.0.
Source: https://figshare.com/articles/dataset/Face_Research_Lab_London_Set/5047666
License: https://creativecommons.org/licenses/by/4.0/

Git remains `feat/face-verification / 58bc3d7`, staging empty. Existing Stage 1–7
changes are retained. Stage 8 adds only this document, the new test runner and
its synthetic test. Calibration helpers, threshold writer, inference, model
manifest/assets and frozen threshold stay unchanged. No stage/commit/push,
checkout/merge/reset, UI/auth/database edit or service operation was performed.
