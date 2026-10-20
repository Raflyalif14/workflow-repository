# Stage 6A: London Set offline manifest, no inference

## Scope and source

This step only creates and validates a pairing manifest. It does not import
`inference.py`, call `compare_images()`, load models, compute scores/embeddings,
choose thresholds, retrain, or operate application/auth/database/Storage services.
No dataset photos are copied into the repository.

Dataset: **Face Research Lab London Set**, Lisa DeBruine and Benedict Jones
(2017), Figshare, DOI **10.6084/m9.figshare.5047666**.

- Source: https://figshare.com/articles/dataset/Face_Research_Lab_London_Set/5047666
- License: **CC BY 4.0**, https://creativecommons.org/licenses/by/4.0/
- Attribution should accompany downstream use of the dataset/results.
- The downloaded dataset release version was not inferred. Local metadata and
  all selected JPGs are pinned by SHA-256 in `splits.json`.

Input root: `C:\Users\Rafli\Downloads\5047666`.
Actual image directories: `neutral_front\neutral_front` and
`smiling_front\smiling_front`. The generator also supports a single extracted
level under each group. It ignores `.tem`, non-JPG files and `__MACOSX`/Apple
resource-fork files; unexpected JPG names or duplicate IDs cause a stop.

Participant IDs are the three-digit prefix matched against `face_id` in
`london_faces_info.csv`; leading zeros are retained. `_03` identifies the files
in the neutral-front group, `_08` the smiling-front group. No identity is inferred
from appearance or model scores; demographics/ratings are not exported.

## Deterministic protocol

1. Validate 102 unique metadata IDs and one JPG per ID in each expression group.
2. Sort all IDs, then shuffle once using Python `random.Random(42).shuffle`.
3. First 51 shuffled IDs belong to calibration, remaining 51 to test. Save these
   memberships in `splits.json`; sort IDs within each group for pairing.
4. SAME: each neutral JPG with the smiling JPG of the same participant.
5. DIFFERENT: each neutral JPG with the smiling JPG of the next ID in that
   group's ascending order; the last ID wraps to the first.

Each split has 51 participants, 102 distinct photo paths, 51 SAME and 51 DIFFERENT
pairs. Photo reuse **within** its split is intentional; participants, paths and
identical photo bytes must never cross between splits. Pairing does not use scores.

CSV columns: `pair_id`, `split`, `participant_a`, `participant_b`, `image_a`,
`image_b`, `truth`, `source_a`, `source_b`, `condition_a`, `condition_b`.
Photo paths use `/` and are relative to the dataset root. Both sources are
`DATASET`; conditions are `NEUTRAL_FRONT` and `SMILING_FRONT`. Capture sessions
are unknown and no session field is invented.

## Output and commands

Results are outside Git at:
`C:\Users\Rafli\Downloads\face-experiment-results\london-stage6a`

- `manifest.csv`: 204 ordered pairs, no score or embedding columns.
- `splits.json`: ID memberships, seed/algorithm/Python version, attribution,
  metadata SHA-256 and all 204 image SHA-256 checksums.
- `validation.json`: validation counts and `inference_executed: false`.

The generator was run using the existing Python 3.10.0 virtual environment.
It uses only the Python standard library; no installation/download is necessary.
Validation compares the recorded protocol and Python version with this run.

To create results in a **new** directory:

```powershell
Set-Location -LiteralPath "D:\Workflow Repository System"
& ".\services\face-experiment\.venv\Scripts\python.exe" -B `
  ".\services\face-experiment\generate_london_manifest.py" `
  --dataset "C:\Users\Rafli\Downloads\5047666" `
  --output "C:\Users\Rafli\Downloads\face-experiment-results\london-stage6a"
if ($LASTEXITCODE -ne 0) { throw "Manifest generation stopped; inspect the reported reason." }
```

That directory now exists, so generation there deliberately refuses to overwrite.
To inspect the saved results without changing them:

```powershell
Set-Location -LiteralPath "D:\Workflow Repository System"
& ".\services\face-experiment\.venv\Scripts\python.exe" -B `
  ".\services\face-experiment\generate_london_manifest.py" `
  --dataset "C:\Users\Rafli\Downloads\5047666" `
  --output "C:\Users\Rafli\Downloads\face-experiment-results\london-stage6a" `
  --validate-only
if ($LASTEXITCODE -ne 0) { throw "Saved manifest validation failed; stop before inference." }
```

Stop on missing files, bad/duplicate IDs, wrong JPEG signature, metadata/image
hash drift, duplicate pairs, wrong labels/paths/next-ID rules, incorrect counts,
or participant/photo leakage. Existing output is never silently overwritten.
If writing fails halfway, keep the partial directory for inspection; use a new
directory for a deliberate retry. Validation failure must not be bypassed.

## Observed validation

| Split | Participants | Photos | SAME | DIFFERENT | Total pairs |
| --- | ---: | ---: | ---: | ---: | ---: |
| calibration | 51 | 102 | 51 | 51 | 102 |
| test | 51 | 102 | 51 | 51 | 102 |

- PASS: generator validation and independent readback with `--validate-only`.
- PASS: deterministic rebuild equals the saved manifest.
- PASS: participant leakage 0, photo path/byte leakage 0, duplicate pairs 0.
- PASS: attempts to overwrite existing results are refused; all output bytes
  remain unchanged.
- PASS: in-memory validation rejects duplicate pairs, inconsistent truth,
  cross-split IDs, wrong relative paths, invented sessions and a wrong next ID.
  No invalid fixture is saved into the dataset or result directory.
- Wraparound checked: calibration `172 -> 002`, test `173 -> 001`.
- UTF-8 and `git diff --check` checked; no application build/test suite was run.

This is a **project-created practice protocol**, not an official London Set
benchmark. It is not retraining, a liveness/anti-spoofing test or evidence of
biometric-login readiness. Neutral vs smiling tests expression variation, not
verified different recording sessions. JPEG signatures and bytes are checked;
full decoding/detection success remains untested until an authorized next step.
Neither calibration nor test has been evaluated yet; no scores/thresholds exist.

## Git checkpoint

Baseline: `feat/face-verification / 58bc3d7`, staging empty, Stage 1–5 dirty changes
retained. Stage 6A adds only this document and
`services/face-experiment/generate_london_manifest.py` to the worktree.
Results remain outside the repository. No stage/commit/push, checkout/merge/reset,
pipeline/UI/auth edit, SQL/database mutation, model download or service operation
was performed.
