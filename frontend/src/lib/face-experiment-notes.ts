export type TrialMetadata = {
  participantA: string; participantB: string; sessionA: string; sessionB: string;
  truth: "" | "SAME" | "DIFFERENT";
  sourceA: "" | "LIVE" | "SCREEN_PHOTO" | "PRINT_PHOTO" | "SCREEN_VIDEO";
  sourceB: "" | "LIVE" | "SCREEN_PHOTO" | "PRINT_PHOTO" | "SCREEN_VIDEO";
  condition: "" | "NORMAL" | "EXPRESSION" | "TURN" | "LIGHT";
};
export const emptyTrialMetadata = (): TrialMetadata => ({ participantA: "", participantB: "", sessionA: "", sessionB: "", truth: "", sourceA: "", sourceB: "", condition: "" });
const sources = ["LIVE", "SCREEN_PHOTO", "PRINT_PHOTO", "SCREEN_VIDEO"];
export function trialMetadataError(m: TrialMetadata): "required" | "codeInvalid" | "truthConflict" | null {
  if (![m.participantA, m.participantB, m.sessionA, m.sessionB, m.truth, m.sourceA, m.sourceB, m.condition].every(Boolean)) return "required";
  if (![m.participantA, m.participantB, m.sessionA, m.sessionB].every(v => /^[A-Z0-9_-]{1,24}$/i.test(v))) return "codeInvalid";
  if (!["SAME", "DIFFERENT"].includes(m.truth) || !sources.includes(m.sourceA) || !sources.includes(m.sourceB) || !["NORMAL", "EXPRESSION", "TURN", "LIGHT"].includes(m.condition)) return "required";
  if ((m.participantA.toUpperCase() === m.participantB.toUpperCase()) !== (m.truth === "SAME")) return "truthConflict";
  return null;
}
export type ModelProvenance = {
  modelVersion: string; modelSha256: string; detectorVersion: string; detectorSha256: string;
  preprocessingVersion: string; runtimeVersion: string; embeddingDimensions: number;
};
export function readProvenance(value: unknown): ModelProvenance | null {
  const p = value as Partial<ModelProvenance> | null;
  if (!p || ![p.modelSha256, p.detectorSha256].every(s => typeof s === "string" && /^[0-9a-f]{64}$/.test(s)) ||
    ![p.modelVersion, p.detectorVersion, p.preprocessingVersion, p.runtimeVersion].every(s => typeof s === "string" && /^[A-Za-z0-9_.-]{1,100}$/.test(s)) || p.embeddingDimensions !== 128) return null;
  return { modelVersion: p.modelVersion!, modelSha256: p.modelSha256!, detectorVersion: p.detectorVersion!, detectorSha256: p.detectorSha256!, preprocessingVersion: p.preprocessingVersion!, runtimeVersion: p.runtimeVersion!, embeddingDimensions: p.embeddingDimensions };
}
export type SimilarityResult = { model: "opencv-sface-2021dec"; metric: "cosine"; score: number; provenance: ModelProvenance };
export const safeTrialReasons = ["FACE_NONE", "FACE_MULTIPLE", "FACE_IMAGE_INVALID", "FACE_INPUT_LIMIT", "FACE_TIMEOUT", "FACE_BUSY", "FACE_RATE_LIMIT", "FACE_DISABLED", "FACE_PROCESS_FAILED", "FACE_SERVICE_UNAVAILABLE"] as const;
export type TrialReason = typeof safeTrialReasons[number];
export type TrialAttempt = {
  id: string; completedAt: string; metadata: TrialMetadata; outcome: "SUCCESS" | "FAILED";
  result: SimilarityResult | null; reason: TrialReason | null; provenance: ModelProvenance | null;
};
export function validTrialAttempt(a: TrialAttempt): boolean {
  return /^[0-9a-f-]{36}$/i.test(a.id) && Number.isFinite(Date.parse(a.completedAt)) && !trialMetadataError(a.metadata) &&
    (a.outcome === "SUCCESS" ? !!a.result && Number.isFinite(a.result.score) && a.result.score >= -1 && a.result.score <= 1 &&
      a.result.model === "opencv-sface-2021dec" && a.result.metric === "cosine" && !!readProvenance(a.result.provenance) &&
      JSON.stringify(a.provenance) === JSON.stringify(a.result.provenance) && a.reason === null
      : a.outcome === "FAILED" && a.result === null && safeTrialReasons.includes(a.reason as TrialReason) && (a.provenance === null || !!readProvenance(a.provenance)));
}
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  // Quotes alone do not stop spreadsheet formulas; neutralize leading control/space + formula markers.
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
export function trialCsv(rows: readonly TrialAttempt[]): string {
  const columns = ["trial_id", "completed_at", "participant_a", "participant_b", "session_a", "session_b", "truth", "source_a", "source_b", "condition", "outcome", "score", "reason", "model", "metric", "model_version", "model_sha256", "detector_version", "detector_sha256", "preprocessing_version", "runtime_version", "embedding_dimensions"];
  const lines = rows.filter(validTrialAttempt).map(r => {
    const m = r.metadata, p = r.provenance;
    return [r.id, r.completedAt, m.participantA, m.participantB, m.sessionA, m.sessionB, m.truth, m.sourceA, m.sourceB, m.condition, r.outcome, r.result?.score, r.reason, r.result?.model, r.result?.metric, p?.modelVersion, p?.modelSha256, p?.detectorVersion, p?.detectorSha256, p?.preprocessingVersion, p?.runtimeVersion, p?.embeddingDimensions].map(csvCell).join(",");
  });
  return [columns.join(","), ...lines].join("\r\n") + "\r\n";
}
export function downloadTrialCsv(rows: readonly TrialAttempt[]) {
  if (!rows.length) return;
  const url = URL.createObjectURL(new Blob(["\ufeff", trialCsv(rows)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  try { link.href = url; link.download = "face-experiment-notes.csv"; document.body.appendChild(link); link.click(); }
  finally { link.remove(); URL.revokeObjectURL(url); }
}
