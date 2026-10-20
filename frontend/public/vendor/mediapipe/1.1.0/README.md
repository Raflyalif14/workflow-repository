# Locally hosted MediaPipe assets

Unmodified browser bundle and both classic WASM variants copied from the exact
npm package `@mediapipe/tasks-vision@1.1.0` (Apache-2.0). SIMD and no-SIMD files
come from the same package; FilesetResolver selects the supported variant.
The ES module variant is not used by the classic worker and is not vendored.

The unmodified BlazeFace short-range float16 **model version 1** comes from
[Google's fixed model URL](https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite).
Its [official model card](https://storage.googleapis.com/mediapipe-assets/MediaPipe%20BlazeFace%20Model%20Card%20(Short%20Range).pdf)
states Apache License 2.0 on page 1. The MediaPipe license is included in `LICENSE`.
Sources, byte lengths and observed SHA-256 hashes are recorded in `manifest.json`.
Hashes are local integrity records, not an upstream signature.

Do not mix runtime versions or replace paths with `latest`. To deliberately
update, review package/model compatibility, licensing and real inference again;
copy matching package files, then regenerate/review the manifest.
Run `node frontend/tests/face-detection-assets.cjs` from the repository root.
Normal deployments must include `frontend/public` (also when deploying Next's
standalone server). These files are loaded only by the camera's worker.
