import { csvCell } from "./face-experiment-notes";
import { readPadDiagnostics, completePadDiagnostics, type PadDiagnostics } from "./face-pad-diagnostics";
export type PadSlot = "A" | "B";
export type PadMetadata = { participant: string; session: string; presentation: "" | "LIVE" | "SCREEN_PHOTO" | "PRINT_PHOTO" | "SCREEN_VIDEO"; mediaId: string };
export const emptyPadMetadata = (): PadMetadata => ({ participant: "", session: "", presentation: "", mediaId: "" });
export function padMetadataValid(m: PadMetadata) {
  const code = (s: string) => /^[A-Z0-9_-]{1,24}$/i.test(s);
  return code(m.participant) && code(m.session) && ["LIVE", "SCREEN_PHOTO", "PRINT_PHOTO", "SCREEN_VIDEO"].includes(m.presentation)
    && (m.presentation === "LIVE" ? m.mediaId === "" : code(m.mediaId));
}
export type PadProvenance = { model: string; modelSha256: string; detector: string; detectorSha256: string; cropVersion: string; preprocessingVersion: string; runtimeVersion: string; pythonVersion: string };
export function readPadProvenance(p: any): PadProvenance | null {
  if (!p || p.model !== "anti-spoof-mn3" || p.detector !== "yunet-2023mar"
    || p.modelSha256 !== "c4c99af04603b62d7e44f6f4daeb33e0daeccc696008c0b1d62f6f5cebbb3262"
    || p.detectorSha256 !== "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4"
    || p.cropVersion !== "yunet-max-side-square-context-1.2-clip-v1" || p.preprocessingVersion !== "mn3-original-onnx-rgb-cubic-128-v1"
    || ![p.runtimeVersion, p.pythonVersion].every(v => typeof v === "string" && /^[0-9.]{1,24}$/.test(v))) return null;
  return { model: p.model, modelSha256: p.modelSha256, detector: p.detector, detectorSha256: p.detectorSha256,
    cropVersion: p.cropVersion, preprocessingVersion: p.preprocessingVersion, runtimeVersion: p.runtimeVersion, pythonVersion: p.pythonVersion };
}
export const padReasons = ["FACE_NONE", "FACE_MULTIPLE", "FACE_IMAGE_INVALID", "FACE_INPUT_LIMIT", "PAD_BBOX_INVALID", "PAD_MODEL_UNAVAILABLE", "PAD_DETECTOR_UNAVAILABLE", "PAD_PROCESS_FAILED", "PAD_TIMEOUT", "PAD_BUSY", "PAD_RATE_LIMIT", "PAD_DISABLED", "PAD_ACCESS_DENIED", "PAD_REQUEST_INVALID", "PAD_SERVICE_UNAVAILABLE"] as const;
export type PadReason = typeof padReasons[number];
export type PadResult = { requestId: string; slot: PadSlot; status: "SUCCESS"; probabilities: { real: number; spoof: number }; provenance: PadProvenance; imageSha256: string; processedAt: string; durationMs: number; diagnostics: PadDiagnostics | null };
export function readPadResult(v: any, requestId: string, slot: PadSlot): PadResult | null {
  const p = readPadProvenance(v?.provenance), values = v?.probabilities;
  const diagnostics = readPadDiagnostics(v?.diagnostics);
  if (!p || v.requestId !== requestId || v.slot !== slot || v.status !== "SUCCESS" || v.prediction !== null || v.reason !== null
    || !values || ![values.real, values.spoof].every(n => Number.isFinite(n) && n >= 0 && n <= 1) || Math.abs(values.real + values.spoof - 1) > 1e-5
    || !/^[0-9a-f]{64}$/.test(v.imageSha256) || !Number.isFinite(Date.parse(v.processedAt)) || !Number.isFinite(v.durationMs) || v.durationMs < 0
    || diagnostics === undefined || diagnostics !== null && !completePadDiagnostics(diagnostics)) return null;
  return { requestId, slot, status: "SUCCESS", probabilities: { real: values.real, spoof: values.spoof }, provenance: p, imageSha256: v.imageSha256, processedAt: v.processedAt, durationMs: v.durationMs, diagnostics };
}
export type PadAttempt = { id: string; slot: PadSlot; completedAt: string; metadata: PadMetadata; status: "SUCCESS" | "ERROR"; reason: PadReason | null; result: PadResult | null; provenance: PadProvenance | null; diagnostics?: PadDiagnostics | null };
export const padDiagnosticColumns = ["diagnostics_version", "decoded_frame_width", "decoded_frame_height", "detected_face_count", "yunet_bbox_x", "yunet_bbox_y", "yunet_bbox_width", "yunet_bbox_height", "yunet_confidence", "crop_before_left", "crop_before_top", "crop_before_right", "crop_before_bottom", "crop_after_left", "crop_after_top", "crop_after_right", "crop_after_bottom", "roi_width", "roi_height", "clipped_left", "clipped_top", "clipped_right", "clipped_bottom"];
export function padDiagnosticCells(value: PadDiagnostics | null | undefined) {
  const d = readPadDiagnostics(value);
  return [d?.version, d?.frame?.width, d?.frame?.height, d?.faceCount, d?.bbox?.x, d?.bbox?.y, d?.bbox?.width, d?.bbox?.height, d?.bbox?.confidence,
    d?.cropBeforeClip?.left, d?.cropBeforeClip?.top, d?.cropBeforeClip?.right, d?.cropBeforeClip?.bottom,
    d?.cropAfterClip?.left, d?.cropAfterClip?.top, d?.cropAfterClip?.right, d?.cropAfterClip?.bottom, d?.roi?.width, d?.roi?.height,
    d?.clipped?.left, d?.clipped?.top, d?.clipped?.right, d?.clipped?.bottom];
}
export function padCsv(rows: readonly PadAttempt[]) {
  const header = ["request_id", "slot", "completed_at", "participant", "capture_session", "true_presentation", "source_media_id", "status", "reason", "real_probability", "spoof_probability", "image_sha256", "processed_at", "duration_ms", "model", "model_sha256", "detector", "detector_sha256", "crop_version", "preprocessing_version", "runtime_version", "python_version"];
  return [[...header, ...padDiagnosticColumns].join(","), ...rows.map(r => {
    const m = r.metadata, p = r.provenance, v = r.result;
    const existing = [r.id, r.slot, r.completedAt, m.participant, m.session, m.presentation, m.mediaId, r.status, r.reason, v?.probabilities.real, v?.probabilities.spoof, v?.imageSha256, v?.processedAt, v?.durationMs, p?.model, p?.modelSha256, p?.detector, p?.detectorSha256, p?.cropVersion, p?.preprocessingVersion, p?.runtimeVersion, p?.pythonVersion].map(csvCell);
    // Validated finite numbers (including negative unclipped coordinates) are numeric literals, not formulas.
    const geometry = padDiagnosticCells(r.diagnostics ?? v?.diagnostics).map(n => typeof n === "number" && Number.isFinite(n) ? `"${String(n)}"` : csvCell(n));
    return [...existing, ...geometry].join(",");
  })].join("\r\n") + "\r\n";
}
export function downloadPadCsv(rows: readonly PadAttempt[]) {
  if (!rows.length) return;
  const url = URL.createObjectURL(new Blob(["\ufeff", padCsv(rows)], { type: "text/csv;charset=utf-8" })), link = document.createElement("a");
  try { link.href = url; link.download = "face-pad-notes-geometry-v1.csv"; document.body.appendChild(link); link.click(); }
  finally { link.remove(); URL.revokeObjectURL(url); }
}
