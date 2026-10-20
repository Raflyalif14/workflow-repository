import type { FaceBox, FrameDetection } from "./face-detection";

export type CropRect = { x: number; y: number; width: number; height: number };
export type TemporaryPhoto = { url: string; cropUrl: string; width: number; height: number; crop: CropRect; blob: Blob };
export type PhotoState = { status: "idle" | "capturing" | "captured" | "error"; photo: TemporaryPhoto | null; error: "none" | "multiple" | "failed" | null };
export const EMPTY_PHOTO: PhotoState = { status: "idle", photo: null, error: null };
export function photoDisabledReason(cameraOn: boolean, modelReady: boolean, count: number, busy: boolean) {
  if (busy) return "capturing";
  if (!cameraOn) return "cameraRequired";
  if (!modelReady) return "modelRequired";
  return count === 1 ? null : count === 0 ? "oneRequired" : "onlyOneRequired";
}

/** Add 20% margin on each side, then clamp/round outward to native-image bounds. */
export function faceCrop(box: FaceBox, width: number, height: number): CropRect {
  if (![box.x, box.y, box.width, box.height, width, height].every(Number.isFinite)
    || box.width <= 0 || box.height <= 0 || width <= 0 || height <= 0) throw new Error("Invalid crop");
  const x = Math.max(0, Math.min(width, Math.floor(box.x - box.width * 0.2)));
  const y = Math.max(0, Math.min(height, Math.floor(box.y - box.height * 0.2)));
  const right = Math.min(width, Math.max(0, Math.ceil(box.x + box.width * 1.2)));
  const bottom = Math.min(height, Math.max(0, Math.ceil(box.y + box.height * 1.2)));
  if (right <= x || bottom <= y) throw new Error("Invalid crop");
  return { x, y, width: right - x, height: bottom - y };
}
const canvasElement = () => document.createElement("canvas");
function freezeVideo(video: HTMLVideoElement) {
  if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) throw new Error("Video unavailable");
  const canvas = canvasElement(); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  try {
    const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Canvas unavailable");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height); return canvas;
  } catch (error) { canvas.width = canvas.height = 0; throw error; }
}
function cropImage(frame: HTMLCanvasElement, crop: CropRect) {
  const canvas = canvasElement(); canvas.width = crop.width; canvas.height = crop.height;
  try {
    const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Canvas unavailable");
    ctx.drawImage(frame, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
    return canvas;
  } catch (error) { canvas.width = canvas.height = 0; throw error; }
}
const encodeImage = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => {
  canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Encoding unavailable")), "image/png");
});
type Options = {
  detect: (frame: HTMLCanvasElement) => Promise<FrameDetection>;
  publish: (state: PhotoState) => void;
  validated: () => void;
  freeze?: typeof freezeVideo;
  crop?: typeof cropImage;
  encode?: typeof encodeImage;
  urls?: Pick<typeof URL, "createObjectURL" | "revokeObjectURL">;
};

/** Memory-only capture with a synchronous latch and generation-based cancellation. */
export function createPhotoCapture({ detect, publish, validated, freeze = freezeVideo, crop = cropImage,
  encode = encodeImage, urls = URL }: Options) {
  let generation = 0, disposed = false, busy = false, saved: TemporaryPhoto | null = null;
  const canvases = new Set<HTMLCanvasElement>();
  const releaseCanvases = () => { canvases.forEach(c => { c.width = c.height = 0; }); canvases.clear(); };
  const clearResources = () => {
    ++generation; busy = false; releaseCanvases();
    if (saved) { urls.revokeObjectURL(saved.url); urls.revokeObjectURL(saved.cropUrl); saved = null; }
  };
  const clear = () => { clearResources(); if (!disposed) publish(EMPTY_PHOTO); };
  const dispose = () => { disposed = true; clearResources(); };
  const capture = async (video: HTMLVideoElement) => {
    if (disposed || busy || saved) return;
    busy = true; const own = ++generation, current = () => !disposed && generation === own;
    const created: string[] = [];
    let frame: HTMLCanvasElement | undefined, cropped: HTMLCanvasElement | undefined;
    publish({ ...EMPTY_PHOTO, status: "capturing" });
    try {
      // drawImage freezes synchronously at the click; later video frames cannot change this canvas.
      frame = freeze(video); canvases.add(frame);
      const width = frame.width, height = frame.height;
      const result = await detect(frame);
      if (!current()) return;
      if (result.width !== width || result.height !== height) throw new Error("Frame dimensions changed");
      if (result.boxes.length !== 1) {
        publish({ ...EMPTY_PHOTO, status: "error", error: result.boxes.length === 0 ? "none" : "multiple" }); return;
      }
      const rect = faceCrop(result.boxes[0], width, height);
      cropped = crop(frame, rect); canvases.add(cropped);
      validated(); // Stop camera and video loop as soon as this exact frame is valid.
      const [fullBlob, cropBlob] = await Promise.all([encode(frame), encode(cropped)]);
      if (!current()) return;
      created.push(urls.createObjectURL(fullBlob)); created.push(urls.createObjectURL(cropBlob));
      saved = { url: created[0], cropUrl: created[1], width, height, crop: rect, blob: fullBlob };
      publish({ status: "captured", photo: saved, error: null });
    } catch {
      created.forEach(url => urls.revokeObjectURL(url));
      if (current()) { saved = null; publish({ ...EMPTY_PHOTO, status: "error", error: "failed" }); }
    } finally {
      for (const canvas of [frame, cropped]) if (canvas) { canvas.width = canvas.height = 0; canvases.delete(canvas); }
      if (current()) busy = false;
    }
  };
  return { capture, clear, dispose };
}
