/* MediaPipe runs here, never on the UI thread. Only local, pinned assets. */
"use strict";
let detector = null;
let initializing = false;
let busy = false;
self.onmessage = async ({ data }) => {
  if (data.type === "close") {
    detector?.close(); detector = null; self.close(); return;
  }
  if (data.type === "init") {
    if (initializing || detector) return;
    initializing = true;
    try {
      if (typeof OffscreenCanvas === "undefined") throw Error("Worker canvas unavailable");
      importScripts("/vendor/mediapipe/1.1.0/vision_bundle.js");
      const root = new URL("/vendor/mediapipe/1.1.0/", self.location.origin).href;
      const files = await Vision.FilesetResolver.forVisionTasks(root + "wasm");
      detector = await Vision.FaceDetector.createFromOptions(files, {
        baseOptions: { modelAssetPath: root + "blaze_face_short_range-float16-v1.tflite", delegate: "CPU" },
        runningMode: "VIDEO", minDetectionConfidence: 0.5, minSuppressionThreshold: 0.3,
      });
      self.postMessage({ type: "ready" });
    } catch {
      detector?.close(); detector = null;
      self.postMessage({ type: "error" });
    } finally { initializing = false; }
    return;
  }
  if (data.type !== "frame") return;
  const bitmap = data.bitmap;
  if (!detector || busy) { bitmap?.close(); self.postMessage({ type: "error" }); return; }
  busy = true;
  try {
    const result = detector.detectForVideo(bitmap, data.timestamp);
    self.postMessage({ type: "result", requestId: data.requestId, width: bitmap.width, height: bitmap.height,
      boxes: result.detections.filter(d => d.boundingBox).map(d => ({
        x: d.boundingBox.originX, y: d.boundingBox.originY,
        width: d.boundingBox.width, height: d.boundingBox.height,
        confidence: d.categories[0]?.score ?? 0,
      })) });
  } catch { self.postMessage({ type: "error" }); }
  finally { bitmap.close(); busy = false; }
};
