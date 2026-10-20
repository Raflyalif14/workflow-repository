export type FaceBox = { x: number; y: number; width: number; height: number; confidence: number };
export type FaceDetectionState = { status: "off" | "loading" | "ready" | "error"; boxes: FaceBox[]; width: number; height: number };
export const EMPTY_DETECTION: FaceDetectionState = { status: "off", boxes: [], width: 1, height: 1 };
export type FrameDetection = Pick<FaceDetectionState, "boxes" | "width" | "height">;
export type FaceDetectionController = (() => void) & { detectPhoto: (bitmap: ImageBitmap) => Promise<FrameDetection> };
export function faceCountStatus(count: number): "none" | "one" | "multiple" {
  return count === 0 ? "none" : count === 1 ? "one" : "multiple";
}

type Port = Pick<Worker, "postMessage" | "terminate" | "onmessage" | "onerror" | "onmessageerror">;
type Options = {
  video: HTMLVideoElement;
  publish: (state: FaceDetectionState) => void;
  worker?: () => Port;
  capture?: (video: HTMLVideoElement) => Promise<ImageBitmap>;
};

/** One transferred frame in flight, at most 8 starts/sec, no retained image queue. */
export function startFaceDetection({ video, publish, worker = () => new Worker("/face-detection-worker.js"),
  capture = v => createImageBitmap(v, { resizeWidth: Math.min(640, v.videoWidth),
    resizeHeight: Math.max(1, Math.round(v.videoHeight * Math.min(640, v.videoWidth) / v.videoWidth)) }),
}: Options): FaceDetectionController {
  let port: Port | undefined, stopped = false, inFlight = false, lastTime = -1, started = 0;
  let ready = false, sequence = 0, currentRequest = 0, photoInFlight = false;
  let photo: { bitmap: ImageBitmap | null; resolve: (result: FrameDetection) => void; reject: (error: Error) => void } | null = null;
  let tick: ReturnType<typeof setTimeout> | undefined, timeout: ReturnType<typeof setTimeout> | undefined;
  const clear = () => { clearTimeout(tick); clearTimeout(timeout); };
  const dispose = () => {
    if (stopped) return;
    stopped = true; clear();
    photo?.bitmap?.close(); photo?.reject(new Error("Detection cancelled")); photo = null;
    if (port) {
      port.onmessage = null; port.onerror = null; port.onmessageerror = null;
      // Termination also frees a model still initializing or doing synchronous inference.
      port.terminate();
    }
  };
  const fail = () => { if (!stopped) { dispose(); publish({ ...EMPTY_DETECTION, status: "error" }); } };
  const arm = (ms: number) => { clearTimeout(timeout); timeout = setTimeout(fail, ms); };
  const schedule = () => { tick = setTimeout(() => void frame(), Math.max(0, 125 - (performance.now() - started))); };
  const sendPhoto = () => {
    if (stopped || inFlight || !photo?.bitmap) return;
    const bitmap = photo.bitmap;
    inFlight = true; photoInFlight = true; currentRequest = ++sequence; arm(10000);
    try {
      port!.postMessage({ type: "frame", bitmap, timestamp: performance.now(), requestId: currentRequest }, [bitmap]);
      photo.bitmap = null;
    } catch { fail(); }
  };
  const frame = async () => {
    if (stopped || inFlight) return;
    if (photo) { sendPhoto(); return; }
    if (video.readyState < 2 || !video.videoWidth || video.currentTime === lastTime) {
      tick = setTimeout(() => void frame(), 125); return;
    }
    inFlight = true; started = performance.now(); lastTime = video.currentTime; arm(10000);
    let bitmap: ImageBitmap | undefined;
    try {
      bitmap = await capture(video);
      if (stopped) { bitmap.close(); return; }
      currentRequest = ++sequence;
      port!.postMessage({ type: "frame", bitmap, timestamp: performance.now(), requestId: currentRequest }, [bitmap]);
      bitmap = undefined; // Ownership transferred; worker closes it after inference.
    } catch { bitmap?.close(); fail(); }
  };
  publish({ ...EMPTY_DETECTION, status: "loading" });
  try {
    port = worker();
    port.onerror = event => { event.preventDefault(); fail(); };
    port.onmessageerror = fail;
    port.onmessage = ({ data }) => {
      if (stopped) return;
      if (data.type === "error") { fail(); return; }
      if (data.type === "ready") { ready = true; clearTimeout(timeout); void frame(); return; }
      if (data.type !== "result" || !inFlight) return;
      if (data.requestId !== currentRequest) return; // Never resolve a photo with an old video result.
      if (!Array.isArray(data.boxes) || !(data.width > 0) || !(data.height > 0)
        || !data.boxes.every((b: FaceBox) => [b.x, b.y, b.width, b.height, b.confidence].every(Number.isFinite))) { fail(); return; }
      clearTimeout(timeout); inFlight = false;
      publish({ status: "ready", boxes: data.boxes, width: data.width, height: data.height });
      if (photoInFlight) {
        photoInFlight = false;
        const completed = photo; photo = null;
        completed?.resolve({ boxes: data.boxes, width: data.width, height: data.height });
      }
      if (photo) { sendPhoto(); return; }
      schedule();
    };
    arm(30000); port.postMessage({ type: "init" });
  } catch { fail(); }
  return Object.assign(dispose, { detectPhoto: (bitmap: ImageBitmap) => {
    if (stopped || !ready || photo) { bitmap.close(); return Promise.reject(new Error("Detection unavailable")); }
    clearTimeout(tick);
    return new Promise<FrameDetection>((resolve, reject) => {
      photo = { bitmap, resolve, reject };
      // Wait for the single existing video frame, then detect this exact native-resolution bitmap.
      sendPhoto();
    });
  } });
}
