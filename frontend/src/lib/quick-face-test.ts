import { authorizedFetch } from "./api-client";
import type { TemporaryPhoto } from "./face-photo";
import { padReasons, readPadResult, type PadReason, type PadResult } from "./face-pad";

export type QuickFaceOutcome = { status: "SUCCESS"; result: PadResult } | { status: "ERROR"; reason: PadReason };

/** One original capture, one existing authenticated PAD request. No trial labels or records. */
export async function runQuickFaceTest(photo: TemporaryPhoto, signal: AbortSignal): Promise<QuickFaceOutcome> {
  try {
    if (!photo.blob.size || photo.blob.size > 4 * 1024 * 1024 || Math.min(photo.width, photo.height) < 128
      || Math.max(photo.width, photo.height) > 4096 || photo.width * photo.height > 8000000) throw Error("FACE_INPUT_LIMIT");
    const bytes = new Uint8Array(await photo.blob.arrayBuffer());
    let checksum: string;
    try {
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      checksum = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, "0")).join("");
    } finally { bytes.fill(0); }
    if (signal.aborted) throw Error("PAD_TIMEOUT");
    const requestId = crypto.randomUUID(), form = new FormData();
    form.append("photo", photo.blob, "capture.png"); form.append("slot", "A"); form.append("requestId", requestId);
    const response = await authorizedFetch("/face-pad/inspect", { method: "POST", body: form, signal });
    const envelope = await response.json();
    if (signal.aborted) throw Error("PAD_TIMEOUT");
    if (!response.ok) throw Error(padReasons.includes(envelope?.errors?.code) ? envelope.errors.code : "PAD_PROCESS_FAILED");
    const result = readPadResult(envelope?.data, requestId, "A");
    if (!result || result.imageSha256 !== checksum || result.diagnostics?.frame
      && (result.diagnostics.frame.width !== photo.width || result.diagnostics.frame.height !== photo.height)) throw Error("PAD_PROCESS_FAILED");
    return { status: "SUCCESS", result };
  } catch (error) {
    const reason = signal.aborted ? "PAD_TIMEOUT" : error instanceof Error && padReasons.includes(error.message as PadReason)
      ? error.message as PadReason : "PAD_SERVICE_UNAVAILABLE";
    return { status: "ERROR", reason };
  }
}
