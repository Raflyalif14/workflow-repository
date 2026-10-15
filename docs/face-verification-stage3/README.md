# Stage 3: temporary photo and face crop

Baseline: `feat/face-verification / 58bc3d7`, staging empty. Stage 1 and Stage 2
changes, tests, licensed assets and visual evidence remain in the worktree.
No applicable AGENTS.md was found. No dependency, backend/API, permission,
login, database, migration or live-data change was introduced in this stage.

## User flow

Open Settings -> Face verification -> Turn on camera. Capture photo is enabled
only when camera and detector are ready and the latest preview has one face.
An accessible explanation accompanies the disabled button. Every label, status,
error, image description and action has EN/ID copy; English remains the default.

Capture freezes a **new frame at the video's original resolution**. The same
existing worker detects that frozen frame; the live preview's old boxes are
never used to accept/crop the photo. Zero or multiple faces produce safe retry
guidance and keep the camera available. Exactly one face creates a crop with
20% margin on each side, rounded outward and clamped to the image's bounds.
The camera and video detection stop immediately after valid frame validation.

The captured frame and crop appear together (stacked on mobile). Mirror is only
a CSS display transform; the underlying frame, detection coordinates and PNG
crop are not mirrored. No numeric detector score is presented as identity proof.
The unused camera placeholder/controls are hidden while the photo is shown.

- **Retake** releases both photo URLs and explicitly starts a fresh camera stream.
- **Delete photo** releases both URLs and leaves the camera off.
- Stop during capture cancels its generation, stops the loop/stream and discards
  late work. Navigation, logout, account/eligibility change and pagehide dispose
  the photo controller. A changed-owner render already hides the old preview
  before effect cleanup runs.
- Frame/crop canvases are zeroed after use/cancellation. Late bitmaps are closed;
  late encodings do not allocate URLs. Object URLs are revoked on replacement,
  delete, retake or disposal. A synchronous latch blocks duplicate capture clicks.

Photos are only held by Blob object URLs in the mounted page. Nothing writes
photos to localStorage, IndexedDB, files, an API, Supabase or Storage. There is no
enrollment, embedding, dataset, liveness or biometric-login result. Licensed
public test photos/screenshots are test artifacts, not user camera captures.

## Code to read

1. `frontend/src/components/settings/camera-preparation.tsx`: eligibility reason,
   Capture/Retake/Delete controls, image preview, mirror and localized status.
2. `frontend/src/lib/face-photo.ts`: `createPhotoCapture`, synchronous frame freeze,
   fresh result validation, `faceCrop`, PNG encoding and URL/canvas cleanup.
3. `frontend/src/hooks/use-face-photo.ts`: actor/eligibility binding, page/session
   listeners and cleanup. Retains photos when only the language changes.
4. `frontend/src/hooks/use-face-detection.ts`: creates an original-size ImageBitmap
   from the frozen canvas and rejects it if its controller was stopped/replaced.
5. `frontend/src/lib/face-detection.ts`: `detectPhoto` pauses new video captures,
   waits for the one already in flight, and sends the frozen image to the same
   worker. Request IDs distinguish video/photo results; an old or duplicated
   result cannot resolve a capture. There is at most one inference in flight.
6. `frontend/public/face-detection-worker.js`: echoes request ID with actual
   `detectForVideo` output and closes transferred bitmaps in `finally`.

Pipeline: **camera frame -> frozen native canvas -> same-frame model inference
-> exactly one face -> bounded crop -> stop camera -> transient PNG previews**.

## Targeted validation

| Evidence | Result |
| --- | --- |
| Capture/controller mocks | PASS: 0/1/2 faces, dimensions, margin/clamp, disabled reasons, double click, stop/disposal during detection/encoding, stale generation, URL/canvas cleanup and safe errors |
| Actual photo hook with mocked browser resources | PASS: changing actor hides the prior photo before cleanup, account/eligibility/logout/pagehide revoke both URLs |
| Detector controller/worker mocks | PASS: old video result cannot resolve photo, duplicated old ID ignored, one in-flight frame, queued-photo cancellation closes bitmap, original Stage 2 timeout/retry/lifecycle cases |
| Existing camera mock | PASS after shared UI changes: explicit start, one stream, pending permission, stop/unmount/logout, errors and guard/localized rendering |
| Real model in Chrome | PASS: actual local MediaPipe/WASM/TFLite inference on a licensed synthetic video; not a mock detector |
| Stale preview vs captured frame | PASS: hold genuinely old one-face preview metadata, change actual video to 0 or 2 faces, capture; native-resolution fresh inference rejects both without producing photo URLs |
| Native frame/crop | PASS: full photo 1280x720, expected margin crop 406x406 for this fixture; every crop pixel matches the corresponding full-frame pixel; display-only mirror |
| Browser interaction/lifecycle | PASS: double click produces exactly two URLs, automatic camera/worker stop, Retake/Delete, locale retention, stop/unmount during pending bitmap, leaving with photo and actual AuthProvider logout |
| Layout | PASS: desktop EN 1440px, mobile ID 390px/360px, no horizontal overflow; screenshots inspected |
| Frontend TypeScript | PASS: `npx.cmd --no-install tsc --noEmit` |
| i18n / asset integrity | PASS: dictionary parity/placeholders and pinned package/model/WASM/fixture SHA-256 checks |
| UTF-8 / whitespace | PASS: changed authored text decoded strictly and `git diff --check` |

Final Chrome run: **17/17 checks PASS**, zero unconfigured API calls and zero
browser runtime errors. `results.json`, `photo-en-1440.png`, `photo-id-390.png`
and `photo-id-360.png` contain the evidence. API/session data is synthetic;
all inference results come from the real model and existing licensed fixture.
Unknown API requests and external network traffic are blocked by the harness.
Model/assets remain local; the feature sends no image requests to application APIs.

The first browser run's pending-bitmap fault injection failed: it deferred the
*creation* call until after cancellation had zeroed the canvas. This produced
InvalidStateError in the harness. It was corrected to create the actual bitmap
first and defer its promise delivery, matching the app's real asynchronous
boundary. The final run keeps the strict no-runtime-error assertion and passes.

`face-photo.test.ts` is registered in the explicit frontend test runner. Targeted
tests ran using the already-installed backend ts-node runtime/alias resolver;
no additional package was installed. No full build or suite was run. The owned
Chrome/profile was cleaned up; the user's existing dev server was left running.

### Evidence limits

- **Mock evidence:** deterministic races, cancellation, owner/session hooks and
  resource ownership. This does not prove model accuracy or physical hardware.
- **Real-model browser evidence:** actual app and CPU/WASM model with the existing
  NASA/scikit-image public-domain fixture rendered into a synthetic canvas stream.
  See `frontend/tests/fixtures/face-detection` for source/license/hash.
- **Physical camera:** user reports Stage 1 and 2 worked. Stage 3 physical capture
  has not been tested by this run. Mobile hardware/browser performance, real OS
  permission behavior and backend GoTrue/Storage integration are not verified.

## Rerun and try physically

With the existing loopback frontend dev server running, from repository root:

```powershell
node frontend/tests/browser/face-photo-browser.cjs
node frontend/tests/face-detection-assets.cjs
```

The browser harness accepts localhost/127.0.0.1 only and reuses existing isolated
Chrome/CDP and synthetic API fixtures. Harness-only frame, timing and URL tracking
never enter application code.

Sign in normally, allow your physical camera, wait for **One face detected**,
then Capture photo. Check both images; camera activity should cease. Try Mirror,
Delete and Retake, and leave the page. Everything should be discarded afterward.
Use HTTPS or localhost. No schema/backend rollout is needed; keep Stage 2's local
worker/model/WASM assets deployed with the frontend.

## Files added/extended in Stage 3

- New: `frontend/src/lib/face-photo.ts`, `frontend/src/hooks/use-face-photo.ts`.
- Updated: `camera-preparation.tsx`, `face-detection.ts`, `use-face-detection.ts`,
  `public/face-detection-worker.js`, EN/ID dictionaries and test registration.
- Tests: new `frontend/src/lib/face-photo.test.ts` and
  `frontend/tests/browser/face-photo-browser.cjs`; detector mocks now match request
  IDs and test the new photo protocol; camera UI test checks the updated privacy copy.
- This report, results and three synthetic-photo screenshots.

Git remains `feat/face-verification / 58bc3d7`, with unstaged Stage 1-3 changes.
Staging remains empty. No stage, commit, push, migration or live mutation occurred.
