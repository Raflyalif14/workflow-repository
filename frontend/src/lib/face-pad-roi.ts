import type { TemporaryPhoto } from "./face-photo";
import type { PadAttempt, PadSlot } from "./face-pad";
import { completePadDiagnostics, readPadDiagnostics } from "./face-pad-diagnostics";

export type PadRoiState = { status: "loading" | "ready" | "unavailable"; url: string | null; width: number | null; height: number | null };
export const EMPTY_PAD_ROI: PadRoiState = { status: "unavailable", url: null, width: null, height: null };
export type PadRoiAttempt = Pick<PadAttempt, "id" | "slot" | "status" | "reason" | "result">;
export type PadRoiInput = { owner: string; slot: PadSlot; photo: TemporaryPhoto; attempt: PadRoiAttempt };

/** Use validated server coordinates directly. No browser face box or crop calculation. */
export function padRoiBounds({ photo, attempt, slot }: PadRoiInput) {
  const result = attempt.result, d = readPadDiagnostics(result?.diagnostics);
  if (attempt.status !== "SUCCESS" || attempt.reason !== null || !result || result.status !== "SUCCESS"
    || attempt.slot !== slot || result.slot !== slot || result.requestId !== attempt.id
    || !/^[0-9a-f]{64}$/.test(result.imageSha256) || !d || !completePadDiagnostics(d)
    || !d.frame || !d.cropAfterClip || !d.roi || photo.width !== d.frame.width || photo.height !== d.frame.height
    || !photo.blob.size || photo.blob.size > 4 * 1024 * 1024 || !["image/png", "image/jpeg"].includes(photo.blob.type)) return null;
  const { left, top, right, bottom } = d.cropAfterClip;
  return { x: left, y: top, width: right - left, height: bottom - top, frameWidth: d.frame.width, frameHeight: d.frame.height };
}

const decode = (blob: Blob) => createImageBitmap(blob, { imageOrientation: "from-image" });
const encode = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => {
  canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("ROI_UNAVAILABLE")), "image/png");
});
async function checksum(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  try {
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, "0")).join("");
  } finally { bytes.fill(0); }
}
type Options = {
  publish: (state: PadRoiState) => void;
  decode?: typeof decode;
  encode?: typeof encode;
  checksum?: typeof checksum;
  canvas?: () => HTMLCanvasElement;
  urls?: Pick<typeof URL, "createObjectURL" | "revokeObjectURL">;
};

/** Memory-only ROI. Closing a job also rejects late decode/encode completions. */
export function createPadRoiPreview({ publish, decode: read = decode, encode: write = encode,
  checksum: digest = checksum, canvas: newCanvas = () => document.createElement("canvas"), urls = URL }: Options) {
  let generation = 0, disposed = false, savedUrl: string | null = null;
  const bitmaps = new Set<ImageBitmap>(), canvases = new Set<HTMLCanvasElement>();
  const release = () => {
    ++generation;
    if (savedUrl) { urls.revokeObjectURL(savedUrl); savedUrl = null; }
    bitmaps.forEach(image => image.close()); bitmaps.clear();
    canvases.forEach(image => { image.width = image.height = 0; }); canvases.clear();
  };
  const clear = () => { release(); if (!disposed) publish(EMPTY_PAD_ROI); };
  const dispose = () => { disposed = true; release(); };
  const preview = async (input: PadRoiInput, valid: () => boolean = () => true) => {
    if (disposed) return;
    release();
    const own = generation, current = () => !disposed && own === generation && valid();
    const bounds = padRoiBounds(input);
    if (!bounds || !current()) { publish(EMPTY_PAD_ROI); return; }
    publish({ ...EMPTY_PAD_ROI, status: "loading" });
    let image: ImageBitmap | undefined, canvas: HTMLCanvasElement | undefined, createdUrl: string | null = null, tracked = false;
    try {
      if (await digest(input.photo.blob) !== input.attempt.result!.imageSha256) throw Error("ROI_UNAVAILABLE");
      if (!current()) return;
      image = await read(input.photo.blob);
      if (!current()) return;
      bitmaps.add(image); tracked = true;
      if (image.width !== bounds.frameWidth || image.height !== bounds.frameHeight) throw Error("ROI_UNAVAILABLE");
      canvas = newCanvas(); canvases.add(canvas); canvas.width = bounds.width; canvas.height = bounds.height;
      const ctx = canvas.getContext("2d"); if (!ctx) throw Error("ROI_UNAVAILABLE");
      ctx.drawImage(image, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);
      const blob = await write(canvas);
      if (!current()) return;
      createdUrl = urls.createObjectURL(blob);
      if (!current()) { urls.revokeObjectURL(createdUrl); createdUrl = null; return; }
      savedUrl = createdUrl; createdUrl = null;
      publish({ status: "ready", url: savedUrl, width: bounds.width, height: bounds.height });
    } catch {
      if (createdUrl) urls.revokeObjectURL(createdUrl);
      if (current()) publish(EMPTY_PAD_ROI); // No raw decoder/error/pixel information.
    } finally {
      // close() also releases a bitmap that resolves only after disposal.
      if (image && (!tracked || bitmaps.delete(image))) image.close();
      if (canvas) { canvas.width = canvas.height = 0; canvases.delete(canvas); }
    }
  };
  return { preview, clear, dispose };
}
