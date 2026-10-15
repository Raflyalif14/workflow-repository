# Face verification: stage 1, camera preparation

Baseline checked: clean `main / 58bc3d7`. Created `feat/face-verification`.
No applicable AGENTS.md was found in the repository or its parent.

## What this stage does

Authenticated users can open **Settings > Face verification** (Indonesian:
**Pengaturan > Verifikasi wajah**) at `/settings/face-verification`.
The existing AuthProvider, RoleGuard and app shell apply. Account eligibility
also disables camera controls for inactive/forced-password/loading profiles.
There is no new login route, permission bypass, backend/API, dependency, schema
or migration. English remains the default and every new label/error has ID copy.

Click **Turn on camera / Nyalakan kamera** to request
`getUserMedia({video: {facingMode: {ideal: "user"}}, audio: false})`.
The returned stream is assigned to `video.srcObject`; the video is muted,
autoplaying and uses `playsInline`. The front-facing camera is preferred without
requiring mobile-only hardware on desktop. Playback failure stops the stream.

Nothing takes a photo, stores/sends an image, runs ML or enables biometric login.
The media stream is only held locally by the mounted page.

## Lifecycle to study

- `frontend/src/app/settings/face-verification/page.tsx`: existing role guard.
- `frontend/src/components/settings/camera-preparation.tsx`: click handlers,
  preview ref, localized status/error and responsive aspect-ratio container.
  Changing language does not recreate the hook.
- `frontend/src/hooks/use-camera-preview.ts`: `start()` checks eligibility,
  secure context and browser support; a synchronous ref latch prevents duplicate
  requests while permission is pending. `getUserMedia` is only called here,
  inside the explicit click path.
- The generation number invalidates older asynchronous work. If permission
  completes after Stop, unmount, logout or account change, every late track is
  stopped before it can attach to the video.
- `release()` removes track-ended listeners, stops **all** tracks and clears
  `srcObject`. `stop()` resets the visible state. Effect cleanup performs the
  same release on navigation/unmount/account eligibility changes. A pagehide
  listener also releases the preview on document navigation. Auth clear
  and cross-tab session events also revoke the local camera eligibility.
- Browser/OS stream interruption stops all remaining tracks and gives safe
  retry guidance. Error names are mapped to stable categories; raw exception
  text, device labels and identifiers are never logged or rendered.
- `frontend/src/lib/camera-preview.test.tsx`: deferred promises demonstrate
  request races and cleanup. Media tracks are mocks, not a physical camera.

`getUserMedia` has no cancellation API. Stop during pending permission invalidates
the result; the Start button remains disabled until that request settles. This
avoids a second permission prompt and guarantees cleanup of a late result.

## Validation completed

- Camera lifecycle test: PASS. Covers no automatic request, front-video/audio
  constraints, one pending request, active/late stop, unmount, logout, account
  change, ineligible user, denied/unavailable/busy/unsupported/insecure errors,
  playback failure, track interruption, EN/ID text and anonymous guard.
- Existing Settings navigation test, extended for the new link: PASS for all
  four active roles, EN/ID, inactive/forced-password exclusion; existing personal
  notification settings behavior remains covered.
- i18n dictionary parity/placeholders/default language: PASS.
- Frontend `tsc --noEmit`, strict UTF-8 and `git diff --check`: PASS.
- New lifecycle test is registered in the explicit frontend test runner. Local
  targeted tests used the installed ts-node runtime with the existing alias and
  icon-module resolver, without installing any package.

Next.js generated route types caught a disallowed custom named export in the
initial page. The preview component now lives in the existing components folder;
the route only exports its default page. Targeted checks were repeated after
that correction.

## Browser evidence and limits

Run `node frontend/tests/browser/face-verification-browser.cjs` against the
existing loopback frontend (default `http://127.0.0.1:3000`). It uses existing
fixture/CDP helpers and an owned Chrome profile. API requests are fulfilled by
synthetic fixtures; unmatched requests fail and external requests are blocked.
The test harness replaces `getUserMedia` with a synthetic canvas video stream.
This replacement is **only in the harness**, never in production app code.

Chrome 154.0.8037.98: **10/10 checks PASS**, zero unconfigured API calls and zero
browser runtime errors. Evidence includes anonymous redirect, Settings link,
explicit request/playing stream, desktop EN 1440px, mobile ID 390/360px with no
overflow, locale retention, stop, safe denial/retry, SPA navigation, late
permission cleanup after unmount, and actual AuthProvider logout cleanup.

Screenshots were inspected: `preview-en-1440.png`, `preview-id-390.png`,
`preview-id-360.png`; results are in `results.json`. Test-owned Chrome/profile
resources were cleaned up; the existing user's dev server was left running.

The additional pagehide handler is covered by the lifecycle unit test. An
artificial pagehide event in the browser also triggered Next.js document
teardown, discarding the fixture globals on subsequent navigation; it is not
used to claim a separate browser pagehide result. Real SPA navigation and logout
are checked by the browser harness.

These checks do not prove a physical camera, actual OS/browser permission UI,
GoTrue, production accounts, or live Storage integration. No live data was used.

## Try with your own account

1. Use the normal running application and sign in with your own active account.
2. Open Settings, then Face verification. The camera should initially be off.
3. Click Turn on camera and allow your browser's camera prompt.
4. Check the local preview; click Turn off camera and check that the camera
   indicator turns off. Navigation away and logout also stop the camera.
5. If denied, allow camera access in the browser's site settings and retry.
   Use HTTPS for a deployed/remote site, or localhost for local development.

No migration or backend rollout is needed. No stage, commit or push was performed.

## Files in this checkpoint

- `frontend/src/app/settings/face-verification/page.tsx`
- `frontend/src/components/settings/camera-preparation.tsx`
- `frontend/src/hooks/use-camera-preview.ts`
- `frontend/src/app/settings/page.tsx`
- `frontend/src/i18n/en.ts` and `frontend/src/i18n/id.ts`
- `frontend/src/lib/camera-preview.test.tsx`
- `frontend/src/lib/settings-navigation.test.tsx`
- `frontend/package.json` (explicit test registration only)
- `frontend/tests/browser/face-verification-browser.cjs`
- This report, `results.json` and three synthetic screenshots.
