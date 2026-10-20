import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { EMPTY_DETECTION, faceCountStatus, startFaceDetection, type FaceDetectionState } from "./face-detection";
import { setActiveLanguage, translate } from "@/i18n";

async function run() {
  const realSet = globalThis.setTimeout, realClear = globalThis.clearTimeout;
  const jobs = new Map<number, { fn: () => void; delay: number }>(); let sequence = 0;
  (globalThis as any).setTimeout = (fn: () => void, delay: number) => { const id = ++sequence; jobs.set(id, { fn, delay }); return id; };
  (globalThis as any).clearTimeout = (id: number) => { jobs.delete(id); };
  const step = async (max = 125) => {
    for (const [id, job] of [...jobs]) if (job.delay <= max) { jobs.delete(id); job.fn(); }
    await Promise.resolve(); await Promise.resolve();
  };
  function environment(capture?: () => Promise<ImageBitmap>) {
    const states: FaceDetectionState[] = [], sent: any[] = [];
    const video = { readyState: 2, videoWidth: 640, videoHeight: 360, currentTime: 1 } as HTMLVideoElement;
    let closes = 0, captures = 0, terminated = 0;
    const port: any = { onmessage: null, onerror: null, onmessageerror: null,
      postMessage: (value: unknown) => sent.push(value), terminate: () => { terminated++; } };
    const stop = startFaceDetection({ video, publish: state => states.push(state), worker: () => port,
      capture: capture ?? (async () => { captures++; return { close: () => { closes++; } } as ImageBitmap; }) });
    return { port, stop, states, sent, video, counters: () => ({ closes, captures, terminated }),
      message: (data: any) => port.onmessage?.({ data: { requestId: sent.at(-1)?.requestId, ...data } }) };
  }
  try {
    assert.deepEqual([0, 1, 2, 10].map(faceCountStatus), ["none", "one", "multiple", "multiple"]);
    const e = environment(); assert.equal(e.states[0].status, "loading"); assert.deepEqual(e.sent, [{ type: "init" }]);
    e.message({ type: "ready" }); await step(); assert.equal(e.counters().captures, 1);
    await step(); assert.equal(e.counters().captures, 1, "No queued captures before worker response");
    const box = { x: 40, y: 20, width: 70, height: 80, confidence: 0.9 };
    for (const count of [0, 1, 2]) {
      e.message({ type: "result", width: 640, height: 360, boxes: Array(count).fill(box) });
      assert.equal(e.states.at(-1)!.status, "ready"); assert.equal(e.states.at(-1)!.boxes.length, count);
      e.video.currentTime++; await step();
    }
    const oldHandler = e.port.onmessage, published = e.states.length; e.stop();
    oldHandler({ data: { type: "result", width: 640, height: 360, boxes: [box] } }); await step();
    assert.equal(e.states.length, published, "Stopped generation ignores late worker result");
    assert.equal(e.counters().terminated, 1); assert.equal(jobs.size, 0); e.stop(); assert.equal(e.counters().terminated, 1);
    let resolve!: (bitmap: ImageBitmap) => void, lateClosed = 0;
    const late = environment(() => new Promise(r => { resolve = r; })); late.message({ type: "ready" }); late.stop();
    resolve({ close: () => { lateClosed++; } } as ImageBitmap); await step();
    assert.equal(lateClosed, 1); assert.equal(late.sent.length, 1, "Late bitmap is closed rather than transferred");
    const failure = environment(); failure.message({ type: "error", private: "Not displayable" });
    assert.deepEqual(failure.states.at(-1), { ...EMPTY_DETECTION, status: "error" }); assert.equal(failure.counters().terminated, 1);
    const hung = environment(); await step(30000); assert.equal(hung.states.at(-1)!.status, "error");
    const fresh = environment(); fresh.message({ type: "ready" }); await step(); assert.equal(fresh.counters().captures, 1); fresh.stop();
    const unchanged = environment(); unchanged.message({ type: "ready" }); await step();
    unchanged.message({ type: "result", width: 640, height: 360, boxes: [] }); await step();
    assert.equal(unchanged.counters().captures, 1, "Identical video timestamp is not detected twice"); unchanged.stop();
    const unsupported: FaceDetectionState[] = [];
    startFaceDetection({ video: e.video, publish: state => unsupported.push(state), worker: () => { throw Error("Private setup reason"); } });
    assert.equal(unsupported.at(-1)!.status, "error"); assert.equal(jobs.size, 0);

    const still = environment(); still.message({ type: "ready" }); await step();
    let snapshotClosed = 0, resolved = false;
    const firstVideoId = still.sent.at(-1).requestId;
    const snapshot = still.stop.detectPhoto({ close: () => { snapshotClosed++; } } as ImageBitmap);
    void snapshot.then(() => { resolved = true; });
    assert.equal(still.sent.length, 2, "Photo waits for the existing video frame instead of adding parallel inference");
    still.message({ type: "result", requestId: firstVideoId, width: 640, height: 360, boxes: [box] });
    await step(); assert.equal(resolved, false, "Old one-face preview does not resolve captured frame");
    const photoId = still.sent.at(-1).requestId; assert.notEqual(photoId, firstVideoId);
    still.message({ type: "result", requestId: firstVideoId, width: 640, height: 360, boxes: [box] });
    await step(); assert.equal(resolved, false, "Duplicate stale response is ignored");
    still.message({ type: "result", requestId: photoId, width: 1280, height: 720, boxes: [] });
    assert.deepEqual(await snapshot, { width: 1280, height: 720, boxes: [] }); still.stop();
    assert.equal(snapshotClosed, 0, "Transferred bitmap belongs to worker, not main thread");
    const cancelledPhoto = environment(); cancelledPhoto.message({ type: "ready" }); await step();
    let queuedClosed = 0;
    const cancelled = cancelledPhoto.stop.detectPhoto({ close: () => { queuedClosed++; } } as ImageBitmap);
    const rejection = assert.rejects(cancelled); cancelledPhoto.stop(); await rejection;
    assert.equal(queuedClosed, 1, "Untransferred queued photo closes on stop");
    assert.equal(jobs.size, 0);

    // Exercise the actual worker protocol with a mock model, separate from real Chrome inference.
    let modelClosed = 0, bitmapClosed = 0, loaded = 0; const messages: any[] = [];
    const self: any = { location: { origin: "http://localhost" }, postMessage: (m: any) => messages.push(m), close() {} };
    const context = vm.createContext({ self, URL, OffscreenCanvas: class {}, importScripts: (url: string) => {
      loaded++; assert.equal(url, "/vendor/mediapipe/1.1.0/vision_bundle.js");
    }, Vision: { FilesetResolver: { forVisionTasks: async (url: string) => { assert(url.startsWith("http://localhost/")); return {}; } },
      FaceDetector: { createFromOptions: async (_: unknown, options: any) => {
        assert.equal(options.runningMode, "VIDEO"); assert.equal(options.baseOptions.delegate, "CPU");
        return { detectForVideo: () => ({ detections: [{ boundingBox: { originX: 1, originY: 2, width: 3, height: 4 }, categories: [{ score: 0.95 }] }] }), close: () => { modelClosed++; } };
      } } } });
    vm.runInContext(fs.readFileSync(path.resolve("public/face-detection-worker.js"), "utf8"), context);
    assert.equal(loaded, 0, "Loading worker alone does not initialize model");
    await self.onmessage({ data: { type: "init" } }); assert.equal(messages[0].type, "ready");
    await self.onmessage({ data: { type: "frame", timestamp: 42, bitmap: { width: 640, height: 360, close: () => { bitmapClosed++; } } } });
    assert.equal(messages[1].boxes[0].confidence, 0.95); assert.equal(bitmapClosed, 1);
    await self.onmessage({ data: { type: "close" } }); assert.equal(modelClosed, 1);
    for (const lang of ["en", "id"] as const) {
      setActiveLanguage(lang);
      for (const key of ["loading", "none", "one", "multiple", "failed", "retry", "mirror", "disclaimer"]) {
        const label = translate(`faceDetection.${key}` as any); assert(label && !label.startsWith("faceDetection."));
      }
    }
    console.log("Face detection mock: 0/1/multiple, single-flight, timeout/failure/retry, late results/bitmaps, stop, worker protocol and EN/ID passed");
  } finally { globalThis.setTimeout = realSet; globalThis.clearTimeout = realClear; setActiveLanguage("en"); }
}
void run().catch(error => { console.error(error); process.exitCode = 1; });
