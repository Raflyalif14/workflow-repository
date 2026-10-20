# Face verification stage 2: real local face detection

Baseline checked: `feat/face-verification / 58bc3d7`, staging empty. All Stage 1
changes, tests and screenshots remain in the worktree. No applicable AGENTS.md
was found. Only frontend, test assets and documentation changed; backend, login,
permissions, database and workflow contracts were not modified.

## Implementation and assets

- `@mediapipe/tasks-vision` is pinned to **1.1.0** in package.json and npm's
  generated lockfile. Tested with Node 22.21.0, npm 10.9.4 and Chrome 154.0.8037.98.
- The [official web guide](https://developers.google.com/edge/mediapipe/solutions/vision/face_detector/web_js)
  recommends moving synchronous detection into a worker. The actual installed
  type signature requires `detectForVideo(frame, timestamp)`; both are supplied.
- Unmodified JS, SIMD/no-SIMD WASM and BlazeFace short-range float16 **v1** are
  hosted under `frontend/public/vendor/mediapipe/1.1.0`. No runtime CDN or `latest`
  URL is used. The package is Apache-2.0; the
  [official model card, page 1](https://storage.googleapis.com/mediapipe-assets/MediaPipe%20BlazeFace%20Model%20Card%20(Short%20Range).pdf)
  also specifies Apache-2.0 for the model. License, sources, sizes and observed
  SHA-256 hashes are included beside the assets. The classic worker does not
  use the ES-module WASM variant. Both supported classic variants total about
  25 MiB on disk; a supported browser loads its selected variant, not both.
- No MediaPipe import or model initialization occurs at application startup.
  After the existing Start button obtains/plays the existing camera stream,
  the detection hook creates a dedicated worker. There is no second
  `getUserMedia` request. A model retry keeps the current camera stream.
- Main thread captures one ephemeral ImageBitmap from the playing video,
  preserving aspect ratio and capping width at 640px. Ownership transfers to
  the worker, which closes it in `finally`. The target rate is at most 8
  capture starts per second and only one capture/inference is in flight.
  Equal video timestamps are skipped. Slower inference reduces the rate
  instead of queuing frames. Model startup and frame work have bounded timeouts.
- Worker uses CPU inference in VIDEO mode with confidence threshold 0.5 and
  suppression threshold 0.3. Returned metadata is only bounding boxes and
  detector confidence. No face identity, embedding, photograph, registration,
  liveness result or login result is produced or persisted.
- SVG uses the inference frame's exact dimensions as its viewBox and
  `xMidYMid meet`, matching video's `object-contain`. Video and SVG receive the
  same optional horizontal mirror transform. This also handles letterboxing.
  A labeled checkbox toggles mirror without requesting another camera/model.
- Stop immediately terminates the detection worker, clears overlay/state, and
  calls existing camera stop. Effect cleanup releases the worker on unmount,
  owner/eligibility change and camera interruption; auth-clear/session-change
  and pagehide listeners also release it. Termination frees the entire worker's
  WASM/model memory even during initialization or synchronous inference. The
  stopped controller ignores late callbacks and closes a bitmap whose async
  creation finishes after disposal. Retry creates a fresh isolated controller.
- EN/ID loading, zero/one/multiple-face status, safe failure/retry and disclaimer
  use the typed dictionaries. Language changes retain stream, worker and mirror
  state. Failures never render raw exception messages. Unsupported workers,
  OffscreenCanvas or image capture fail safely; no blocking UI-thread fallback.

## Validation: distinguish mocks from real inference

| Check | Result and evidence |
| --- | --- |
| Controller/model protocol mocks | PASS: `face-detection.test.ts`; 0/1/multiple status, no queued frames, duplicate timestamp, startup timeout/failure, fresh retry, late callbacks/bitmaps, idempotent cleanup, safe worker protocol and EN/ID |
| Existing camera lifecycle mock | PASS after UI integration: explicit front-camera/audio:false request, latch, late permission, stop/unmount/logout/account change, unsupported/insecure/denial/busy/playback/interruption and guarded EN/ID rendering |
| i18n | PASS: dictionary keys/placeholders/default English test |
| Pinned assets | PASS: `face-detection-assets.cjs` checks package version, package-copy byte equality and SHA-256 of model/WASM/JS/license/fixture |
| Real model inference | PASS: actual application in Chrome, real local package/WASM/TFLite worker. Blank frame -> 0; one licensed cropped image -> 1; two copies -> 2, with real detector scores (around 0.94 for this fixture) |
| Real overlay | PASS: desktop EN 1440px mirrored/unmirrored, ID 390/360px, plus actual portrait-resolution 480x640 source at 360px. Browser SVG matrix agrees with video contain/mirror projection within 1px; page has no horizontal overflow |
| Browser lifecycle | PASS: stop ends tracks/terminates worker/clears overlay/no additional frames; restart infers with new worker; SPA navigation and actual AuthProvider logout stop both resources |
| Actual model loading failure | PASS: harness-only worker fetch interception returns HTTP 503 for the real model asset. Actual detector initialization fails safely, overlay clears, localized retry works with real inference without a new stream request |
| Lazy loading and queue | PASS: no detector/model/WASM request on Dashboard, Settings or idle camera page; runtime instrumentation records maximum one in-flight frame |
| Frontend TypeScript | PASS: `npx.cmd --no-install tsc --noEmit` after the real route compiled |
| UTF-8 and whitespace | PASS: changed text decoded strictly; `git diff --check` |

Final Chrome result: **16/16 checks PASS**, no unconfigured API calls or browser
runtime exceptions. See `results.json` and the seven screenshots in this folder.
Screenshots were inspected. The harness used an owned temporary Chrome profile,
which was cleaned up; the user's existing dev server was not stopped.

The inference fixture is NASA's astronaut sample from scikit-image **v0.19.3**.
Its [official source/license documentation](https://scikit-image.org/docs/stable/api/skimage.data.html#skimage.data.astronaut)
states public domain/no known copyright restrictions. Test-only image, source,
license evidence and hash are under `frontend/tests/fixtures/face-detection`.
The harness draws the licensed photo into a synthetic canvas video; it does
not manufacture boxes or confidence scores. Every API/session response is
synthetic; unknown API requests and external networking are blocked. Production
worker code uses only local asset URLs and does not make application API calls.

**Limits:** Stage 2 physical-camera detection, mobile hardware/Safari/Firefox,
real OS permission behavior and device performance are not verified here.
User reports Stage 1 physical-camera preview worked; that is distinct evidence.
Fixtures do not prove backend authorization or real GoTrue/Storage integration.
This is presence detection, never identity verification or liveness. Lighting,
angle and distance affect confidence; the model is intended for near/front faces.

## Rerun and deployment

With the local frontend dev server running, from the repository root:

```powershell
node frontend/tests/face-detection-assets.cjs
node frontend/tests/browser/face-detection-browser.cjs
```

The browser harness accepts only localhost/127.0.0.1 and uses the existing
Chrome/CDP and synthetic API fixture facilities. Tests are registered in the
explicit frontend runner; targeted TS tests used the already-installed backend
ts-node runtime and existing alias/icon resolver without another dependency.
Only the pinned MediaPipe dependency was added. No full build/suite was run.

No migration, backend rollout or model service is needed. Deploy frontend and
**include public assets**, including worker and both WASM variants; standalone
Next deployments must copy `public` as usual. Serve camera use over HTTPS or
localhost. A missing worker/WASM/model becomes a safe retryable detection error.

## Learn the code and try your camera

1. `use-camera-preview.ts` still owns camera permission/stream/track lifecycle.
2. `use-face-detection.ts` connects camera eligibility to detector lifecycle.
3. `face-detection.ts`, especially `startFaceDetection`, handles bounded
   scheduling, ImageBitmap transfer, timeout and disposal. No image queue.
4. `public/face-detection-worker.js` loads pinned assets and calls the actual
   model; `detectForVideo` consumes an RGB video frame plus monotonic timestamp.
   MediaPipe handles resizing/normalization for its 128x128 model input.
5. `camera-preparation.tsx` renders box coordinates on SVG and localized status.

A bounding box is the predicted face rectangle (x/y/width/height in processed
frame pixels). Confidence is the detector's face score, not identity similarity
or a probability that biometric login is valid. Scores below the configured
threshold are omitted; even a high score establishes only model detection.

Sign in normally -> Settings -> Face verification -> Turn on camera -> allow
permission. Wait for the model, face the camera, try mirror on/off, move/resize,
then Turn off camera. Try restart, another person entering the view, and leaving
the page. No frames are uploaded or saved by this feature.

## Files added/extended in stage 2

- `frontend/package.json`, `frontend/package-lock.json`: exact dependency/test registration.
- `frontend/src/components/settings/camera-preparation.tsx`: existing preview integration.
- `frontend/src/hooks/use-face-detection.ts`, `frontend/src/lib/face-detection.ts`.
- `frontend/src/i18n/en.ts`, `frontend/src/i18n/id.ts`: Stage 2 copy.
- `frontend/public/face-detection-worker.js`, `frontend/public/vendor/mediapipe/1.1.0/*`.
- `frontend/src/lib/face-detection.test.ts`, `frontend/tests/face-detection-assets.cjs`.
- `frontend/tests/browser/face-detection-browser.cjs`, `frontend/tests/fixtures/face-detection/*`.
- This report, results and screenshots. All existing Stage 1 work is retained.

Git remains `feat/face-verification / 58bc3d7` with unstaged Stage 1+2 changes.
No stage, commit, push, migration or live mutation was performed.
