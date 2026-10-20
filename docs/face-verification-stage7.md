# Stage 7: frozen London calibration threshold

## Decision

The experimental threshold is **0.5730850398540497**.

Method: `midpoint_of_calibration_gap`, calculated with the original full-precision
calibration floats:

```text
(maximum DIFFERENT + minimum SAME) / 2
= (0.32718533277511597 + 0.8189847469329834) / 2
= 0.5730850398540497
```

For a successfully processed valid score, `score >= threshold` predicts SAME;
`score < threshold` predicts DIFFERENT. These are experimental dataset predictions,
not identity/liveness/login claims. A processing failure has NO_PREDICTION and an
empty score. It must not become score 0 or a DIFFERENT prediction.

The decision is frozen **before test evaluation**. Future test results must use
this exact decision and must not retune it. Nothing is installed in the app;
Stage 5's UI continues to show experimental similarity without a login threshold.

## Inputs, checks and outputs

Only the two Stage 6B calibration files are read:
`C:\Users\Rafli\Downloads\face-experiment-results\london-stage6b\results.csv`
and `run.json`. No dataset JPEG, test score file, model asset, server or database
is accessed. `freeze_london_threshold.py` reuses stdlib-only result/provenance/
statistics helpers; it never calls the runner or imports inference.

Checks before writing:

- SHA-256 of `results.csv` matches the completed run's `results_sha256`.
- Exactly 102 unique calibration pair IDs, 51 SAME/51 DIFFERENT, 51 participant
  IDs, one pair per participant/label and the existing sorted next-ID protocol.
- Original source/condition/path-reference metadata, run ID and per-row
  model/preprocessing/runtime provenance match the calibration run.
- Full-precision statistics recomputed from CSV match `run.json`; this input is
  the expected all-successful Stage 6B run. Missing/invalid scores or changed
  statistics stop the decision process rather than inventing values.
- The gap is positive and the midpoint equals the requested expected value.

New external output directory:
`C:\Users\Rafli\Downloads\face-experiment-results\london-stage7`

- `threshold.json`: full-precision threshold/rule, method, decision UUID/UTC time,
  input checksums, calibration counts/errors/denominators, source attribution,
  exact model/pipeline provenance, boundary evidence and freeze/scope policy.
- `calibration-report.md`: readable decision and error-count explanation; includes
  the SHA-256 of `threshold.json` to identify the exact frozen artifact.

The decision records checksums of both Stage 6B inputs, original manifest/split
checksums, model/detector checksums, inference/calibration-runner source checksums,
preprocessing/runtime/Python versions and embedding dimension. These are the
provenance recorded by the actual calibration run, not guessed from a new model.

Existing output directories are refused before reading inputs. Files are created
exclusively in a new directory. If a partial write occurs, preserve it for review;
do not overwrite or regenerate a new threshold using test data.

## Calibration observations

| Ground truth | Pairs | Successfully processed | Failed |
| --- | ---: | ---: | ---: |
| SAME | 51 | 51 | 0 |
| DIFFERENT | 51 | 51 | 0 |

- False match: **0 / 51**, denominator = successfully processed DIFFERENT pairs.
- False non-match: **0 / 51**, denominator = successfully processed SAME pairs.
- Processing failures: **0** here; failures must be counted separately and excluded
  from these scored denominators, never treated as negative predictions.

These calibration observations do not establish held-out performance, recognition
accuracy, liveness or production safety. No accuracy or test metric was calculated.

## Targeted validation

| Case | Score | Expected | Result |
| --- | ---: | --- | --- |
| Immediately below | 0.5730850398540496 | DIFFERENT | PASS |
| Exactly at threshold | 0.5730850398540497 | SAME | PASS |
| Immediately above | 0.5730850398540498 | SAME | PASS |
| Missing/NaN score | no valid score | NO_PREDICTION | PASS |

`math.nextafter` selects adjacent representable floats, testing the actual `>=`
boundary without rounding. Stored input checksums, decision policy and report's
threshold checksum were independently read back and matched. An attempted second
invocation was refused and both existing artifacts remained byte-for-byte unchanged.
UTF-8, Python syntax, whitespace and `git diff --check` passed. No inference,
frontend/backend suite, image inspection or test evaluation was run.

## Reproduction and scope

The command below only creates a decision in a **new** output directory. The
named directory now exists and the command will refuse to overwrite it:

```powershell
Set-Location -LiteralPath "D:\Workflow Repository System"
& ".\services\face-experiment\.venv\Scripts\python.exe" -B `
  ".\services\face-experiment\freeze_london_threshold.py" `
  --input "C:\Users\Rafli\Downloads\face-experiment-results\london-stage6b" `
  --output "C:\Users\Rafli\Downloads\face-experiment-results\london-stage7"
if ($LASTEXITCODE -ne 0) { throw "Threshold decision stopped; review the reason without retuning from test data." }
```

Scope is the London Set neutral-front versus smiling-front offline experiment.
Attribution: Face Research Lab London Set, Lisa DeBruine and Benedict Jones (2017),
DOI `10.6084/m9.figshare.5047666`, CC BY 4.0.
Source: https://figshare.com/articles/dataset/Face_Research_Lab_London_Set/5047666
License: https://creativecommons.org/licenses/by/4.0/

This project-created protocol is not retraining, an official benchmark, a liveness
test or a production-login threshold. Neutral/smiling does not prove different
capture sessions. Stop here: held-out test evaluation requires a subsequent step.

## Git checkpoint

Branch `feat/face-verification`, HEAD `58bc3d7`, staging empty; all Stage 1–6B
existing changes retained. Stage 7 adds this document and the stdlib-only freeze
script. Output decisions stay outside Git. No stage/commit/push, checkout/merge/
reset, pipeline/model/UI/auth edit, database mutation or service operation occurred.
