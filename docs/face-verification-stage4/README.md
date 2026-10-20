# Stage 4: local two-photo similarity experiment

Baseline verified: `feat/face-verification / 58bc3d7`, staging empty. Uncommitted
Stages 1-3 are retained. No applicable AGENTS.md was found. This stage adds a
separate Python service and one authenticated Node route; business workflows,
auth/session implementation, database/schema, Storage and login are unchanged.

## Model choice, provenance and contract

| Candidate | Code / weights | Decision |
| --- | --- | --- |
| OpenCV SFace MobileFaceNet ONNX, 2021dec | Model directory declares Apache-2.0 for **all files**, including ONNX; OpenCV code Apache-2.0 | Selected: approximately 36.9 MiB weights, CPU inference and built-in five-point alignment, no PyTorch/GPU requirement |
| InsightFace ArcFace/Buffalo pretrained models | MIT code; official pretrained weights have separate non-commercial research restrictions | Not selected; library license does not grant unrestricted rights to weights |

Primary sources: [SFace directory](https://github.com/opencv/opencv_zoo/tree/47534e27c9851bb1128ccc0102f1145e27f23f98/models/face_recognition_sface),
[YuNet directory](https://github.com/opencv/opencv_zoo/tree/47534e27c9851bb1128ccc0102f1145e27f23f98/models/face_detection_yunet),
[OpenCV tutorial](https://docs.opencv.org/4.13.0/d0/dd4/tutorial_dnn_face.html),
[OpenCV alignment/preprocessing implementation](https://github.com/opencv/opencv/blob/4.13.0/modules/objdetect/src/face_recognize.cpp),
[InsightFace model licensing](https://github.com/deepinsight/insightface/tree/master/server).
The license decision follows the model-directory declaration, not merely the
Python library license. It is not a separate clearance of training-data rights
or a claim that a commercial biometric deployment is ready.

Assets are pinned to OpenCV Zoo revision
`47534e27c9851bb1128ccc0102f1145e27f23f98`, with Git LFS SHA-256 identifiers:

| Asset | SHA-256 |
| --- | --- |
| `face_recognition_sface_2021dec.onnx` | `0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79` |
| `face_detection_yunet_2023mar.onnx` | `8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4` |

`services/face-experiment/models-manifest.json` contains fixed download URLs,
sizes and separate license evidence. License/README files are retained under
`licenses`. Downloaded weights are kept in ignored `models/`; the downloader
and runtime verify hashes and fail instead of substituting another model.

Python dependencies are pinned: `opencv-python-headless==4.13.0.92`,
`numpy==2.2.6`, `Pillow==12.3.0`. Tested on Windows/Python 3.10.0. OpenCV 4.13
supports the selected YuNet 2023mar model. The newer OpenCV 5/YuNet dynamic-shape
combination was not mixed into this implementation.

Preprocessing is explicit:

1. Validate actual PNG/JPEG signature/decoding, one frame, dimensions and bytes;
   apply EXIF orientation, convert RGB pixels to BGR for OpenCV.
2. Resize detector input to at most 640px, preserve aspect ratio, run YuNet with
   confidence 0.9 / suppression 0.3. These are detector settings, **not** a match
   threshold. Require exactly one detected face in each full capture.
3. Map all five landmarks back to the original full image. `alignCrop` performs
   the model's similarity warp to 112x112. Browser preview crop is not trusted.
4. `FaceRecognizerSF.feature` handles its documented BGR-to-RGB blob conversion,
   scale 1 / mean 0; additional model preprocessing is inside the ONNX graph.
   Do not apply a second arbitrary normalization. Assert 128 finite features.
5. L2-normalize the two 128-dimensional embeddings and compute their dot product
   (cosine), clamped only for numeric precision to [-1,1]. Return **model, metric,
   score only**, never embeddings or a binary identity decision.

## App flow and privacy

- Existing camera/detector/native-resolution capture/crop lifecycle is reused.
  Photo A and Photo B have separate memory-only capture controllers, select,
  retake and delete. A completed capture stops its camera/worker as before.
- Both photos must exist and explicit consent must be checked before Compare.
  UI now says photos **will be sent**, through Node to the local Python service,
  only for the requested temporary comparison. It no longer promises that the
  feature never sends photos. Capture alone still makes no image API request.
- Node uses the existing `authenticateUser`, verified active account and initial
  password policy **before parsing multipart**. Actor comes from the existing
  server session, not a client actor field. Roles retain their existing page guard.
- `/api/face-experiment/capabilities` reads feature availability;
  `POST /api/face-experiment/compare` accepts exactly `photoA`/`photoB` multipart
  files. The response envelope follows the existing API client. No existing
  endpoint contract is changed and no token/session is generated.
- The experiment is off unless `FACE_EXPERIMENT_ENABLED=true`, including the
  default production environment. Do not enable it as an authentication feature.
- Python binds **127.0.0.1 only**, has no CORS and requires a random internal
  key. Node accepts only a literal loopback service URL and does not follow
  redirects. The internal key is never sent to the browser or logged.
- Limits: 4 MiB per file, two files, PNG/JPEG, maximum side 4096 and 8 million
  pixels (minimum sides 128). Node allows 10 attempts/10 minutes per authenticated
  actor, one in-flight attempt per actor, and at most two buffered attempts per
  Node process. Python accepts one inference at a time and at most four connections.
- Upload has an absolute 15-second deadline as well as an idle timeout. Python
  socket reads have a 10-second timeout; inference runs in a spawned process
  with a **12-second hard deadline**. Node service I/O is bounded to 15 seconds;
  browser request timeout is 20 seconds. A stuck native DNN call is terminated.
  Node's response reader is limited to 2 KiB and projects only safe fields/codes.
- Multer uses memoryStorage, never filesystem storage. Node clears byte buffers
  in `finally`; Python zeroes decoded/aligned arrays and feature arrays, and the
  child process is reaped after each operation. Immutable runtime byte copies
  are released, not claimed to be cryptographically erased from OS memory/swap.
  No image/embedding DB, Storage, localStorage, dataset or payload log is created.
- Cancel/replacement/account change/logout/navigation abort pending requests
  and ignore old generations/results. Consent resets when either photo changes;
  locale changes retain both photos, consent and result. Node aborts upstream on
  browser disconnect; Python checks peer disconnect while waiting for its child
  and always enforces the hard deadline. Object URLs are revoked by each slot.
- The label is **Experimental similarity score / Skor kemiripan eksperimen**,
  formatted in the selected locale. It is not a percentage, match probability,
  liveness result or safe-login claim. No match/unmatch threshold is defined.

## Tests and observed evidence

| Layer | Result |
| --- | --- |
| Real Python model | PASS: distinct photographs of the same public person, different people and identical-image sanity. No mock embedding/skor |
| Python image validation | PASS: no face, multiple faces, corrupt file, byte limit, minimum/maximum dimensions and pixel limit |
| Python hard deadline | PASS: deliberately blocked child is terminated; cancellation also reaps child; no additional active multiprocessing children remain |
| Node/Python actual HTTP | PASS: real Node authentication middleware with synthetic provider/profile, real Python model; anonymous/inactive/password-required rejected; default off; safe projection; wrong multipart field/file limit/corrupt image; concurrency; rate limit; private Python auth; dead service; HTTP 504; absolute stalled-upload deadline |
| Frontend hook mocks | PASS: consent/full-photo payload, double click, locale, photo replacement/account change/logout abort and old result rejection |
| Stage 1-3 affected mocks | PASS: camera and photo lifecycle/crop/native dimensions/cleanup; dictionary parity/placeholders and English default |
| Real Chrome app + real Node/Python | PASS: 12 checks; two captures, consent, true inference sanity, EN 1440 / ID 390 / ID 360 no overflow, locale retention, deleting A preserves B and invalidates result, dead service safe error retains photos, logout cleans both slots |
| Stage 3 browser regression | PASS: 17 checks on current UI, fresh native 0/1/2 capture, stale preview rejection, same-frame crop, stop/unmount/retake/delete and URLs. Its evidence was refreshed during this regression run |
| Compile/integrity | PASS: backend/frontend tsc --noEmit, Python compileall, pip check, model checksum validation, strict UTF-8 changed text and git diff --check |

Real scores from `model-results.json`:

| Pair | Cosine |
| --- | --- |
| Identical photo (sanity only) | 1.000000 |
| Distinct 1996/2013 photos of same person | 0.602748 |
| Different people | 0.106117 |

These are a few fixture examples, **not** an accuracy evaluation or threshold
calibration. A score ordering assertion is fixture-specific. The browser's two
synthetic camera frames contain the same public test photo, so its 1.0 result is
explicitly only a transport/inference sanity check; distinct-photo evidence is
from Python and the actual Node/Python HTTP test.

Fixtures: NASA public-domain photo S97-00690 and a crop from ISS034-E-031671
(NASA caption identifies the front-left participant), plus the existing NASA /
scikit-image astronaut sample for a different person. The group image is also
used for the multiple-face negative test. Sources, crop processing and hashes
are in `services/face-experiment/tests/fixtures/manifest.json`; license evidence
is [portrait A](https://commons.wikimedia.org/wiki/File:Individual_Portrait_of_Astronaut_Chris_Hadfield.jpg)
and [group photo B](https://commons.wikimedia.org/wiki/File:Expedition_34_crew.jpg).
The alternative 2011 Wikimedia fixture download was blocked by HTTP 403 and was
not used. No private user photo was downloaded, committed or screenshotted.

The first HTTP fixture omitted image MIME types and was correctly rejected;
the fixture was corrected to send JPEG metadata. Busboy's part-count boundary
was checked; files=2/fields=0 plus parts=3 enforce the two accepted slots.
Another concrete defect was found: the socket upload timeout closed the response
before the inference timeout JSON. Upload timeout is now cleared after parsing;
the service deadline returns a safe 504. Assertions were preserved.

Two browser reruns stalled on pointer activation of the Settings link while
remaining on `/settings`, with no runtime error. The harness now waits for fonts
and activates the existing link with a real keyboard event. The final run passes.
Request rewriting is limited to the owned face API fixture and preserves the
original synthetic authorization header; all other APIs remain blocked/mocked.
`results.json` records only method/path/auth-header-present/status, not credentials.

**Limits:** physical camera Stage 3 success is user-reported. Stage 4 physical
comparison, real GoTrue/provider integration, production deployment, other OS /
mobile browsers, demographic accuracy, adversarial attacks and liveness are not
verified. Actual authentication middleware was tested with a synthetic provider,
not production credentials. Fixtures do not validate biometric-login security.
Owned Chrome/Node/Python processes/profiles were closed; user processes were not
stopped. Venv/model cache is retained for rerun and excluded from Git.

## Windows manual startup

Do not overwrite the existing backend `.env`. Stop/restart your **own** old
backend manually first if port 5000 is occupied; the commands never stop it.
Run in one PowerShell terminal:

```powershell
Set-Location -LiteralPath "D:\Workflow Repository System"
$service = Join-Path (Get-Location) "services\face-experiment"
$python = Join-Path $service ".venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $python)) {
  py -3.10 -m venv (Join-Path $service ".venv")
  if ($LASTEXITCODE -ne 0) { throw "Venv gagal." }
}
& $python -m pip install -r (Join-Path $service "requirements.txt")
if ($LASTEXITCODE -ne 0) { throw "Dependency Python gagal." }
& $python (Join-Path $service "download_models.py")
if ($LASTEXITCODE -ne 0) { throw "Model/checksum gagal." }
if (Get-NetTCPConnection -State Listen -LocalPort 5000,8765 -ErrorAction SilentlyContinue) {
  throw "Port 5000/8765 terpakai. Periksa pemiliknya; jangan hentikan proses orang lain."
}
$keyBytes = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($keyBytes)
$rng.Dispose()
$env:FACE_EXPERIMENT_INTERNAL_KEY = [Convert]::ToBase64String($keyBytes)
[Array]::Clear($keyBytes, 0, $keyBytes.Length)
$env:FACE_EXPERIMENT_ENABLED = "true"
$env:FACE_EXPERIMENT_URL = "http://127.0.0.1:8765"
$env:NODE_ENV = "development"
$facePython = Start-Process -FilePath $python -ArgumentList @("server.py", "--port", "8765") -WorkingDirectory $service -WindowStyle Hidden -PassThru
Write-Host "Python test service PID: $($facePython.Id)"
Set-Location -LiteralPath "D:\Workflow Repository System\backend"
npm.cmd run dev
```

The generated internal key stays in process environment, is shared by these two
child processes and is neither printed nor passed as a command-line argument.
The backend still needs its normal existing auth configuration. No schema setup
or SQL is required. If the backend stops, return to this same terminal and stop
**only** the Python process created by this block with `Stop-Process -Id $facePython.Id`.
After use, remove these three FACE_EXPERIMENT environment variables from this
terminal so a later backend start uses the default disabled feature.

Second terminal, if frontend is not already running:

```powershell
Set-Location -LiteralPath "D:\Workflow Repository System\frontend"
npm.cmd run dev
```

Sign in normally -> Settings -> Face verification -> select Photo A -> start
camera -> capture -> select Photo B -> start camera -> capture. Review both,
read disclosure, check consent and Compare. Try retake/delete; scores must reset
when either photo changes. No enrollment or login action follows the score.

## Targeted rerun

```powershell
Set-Location -LiteralPath "D:\Workflow Repository System"
$env:PYTHONPATH = (Resolve-Path "services\face-experiment").Path
services\face-experiment\.venv\Scripts\python.exe -m unittest discover -s services\face-experiment\tests -v
node frontend\tests\browser\face-comparison-browser.cjs
Set-Location -LiteralPath "D:\Workflow Repository System\backend"
node -r ts-node/register/transpile-only src\routes\face-experiment.test.ts
npx.cmd --no-install tsc --noEmit
Set-Location -LiteralPath "D:\Workflow Repository System\frontend"
npx.cmd --no-install tsc --noEmit
```

The browser/HTTP harness creates separate loopback servers with synthetic auth;
it does not call live Supabase/Storage. It reuses the existing frontend/Chrome.
Frontend hook tests are registered in the explicit runner; targeted execution
uses the already-installed ts-node resolver as in prior stages. Backend runner
auto-discovers the new `.test.ts`. No full build/suite was needed.

## Main files and final Git

- `services/face-experiment/inference.py`: decoding, YuNet, landmark mapping,
  alignment, embedding and cosine.
- `services/face-experiment/server.py`: internal auth, loopback, hard process
  deadline, concurrency and disposal; `download_models.py` and manifest: assets.
- `backend/src/routes/face-experiment.routes.ts`: existing auth before parsing,
  feature gate, limits, internal transport and safe projection; `routes/index.ts` wiring.
- `frontend/src/hooks/use-face-comparison.ts`: consent, API call, cancellation,
  photo/account binding; `camera-preparation.tsx`: slots/UI. `face-photo.ts` retains
  the full PNG Blob in the temporary photo record for the requested transmission.
- EN/ID dictionaries, affected lifecycle/privacy tests, new hook/API/Python/browser
  tests, licensed fixtures and this report/results/four screenshots.

Git remains `feat/face-verification / 58bc3d7`, staging empty with Stage 1-4 work
unstaged. Existing work was preserved. No stage/commit/push, migration, database
mutation or live Storage action was performed.
