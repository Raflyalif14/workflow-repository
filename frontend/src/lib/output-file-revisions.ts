
export type FileRevisionInput = { file_id: string; feedback: string };
export function validFileRevisionSelection(files: readonly { id: string }[], markers: readonly FileRevisionInput[]): boolean {
  return markers.length > 0 && markers.length <= 10
    && new Set(markers.map(marker => marker.file_id)).size === markers.length
    && markers.every(marker => files.some(file => file.id === marker.file_id)
      && marker.feedback.trim().length > 0 && marker.feedback.trim().length <= 2000);
}

export function unresolvedFileRevisions(document: { fileRevisions?: readonly { fileId: string; feedback: string }[]; draftFiles?: readonly { id: string }[] }) {
  return (document.fileRevisions || []).filter(marker => document.draftFiles?.some(file => file.id === marker.fileId));
}

export type ReviewRequestInput = {
  document_key: string; expected_version_id: string;
  decision: "APPROVE" | "REVISE"; feedback?: string; file_revisions?: FileRevisionInput[];
};
export function reviewRequestKey(input: ReviewRequestInput): string {
  return JSON.stringify({ ...input, feedback: input.feedback?.trim() || "",
    file_revisions: (input.file_revisions || []).map(marker => ({ ...marker, feedback: marker.feedback.trim() }))
      .sort((a, b) => a.file_id.localeCompare(b.file_id)) });
}
export function prepareReviewRequest(input: ReviewRequestInput, receipts: Map<string, string>, uuid: () => string = () => crypto.randomUUID()) {
  const key = reviewRequestKey(input);
  let requestId = receipts.get(key);
  if (!requestId) { requestId = uuid(); receipts.set(key, requestId); }
  return { document_key: input.document_key, expected_version_id: input.expected_version_id,
    request_id: requestId, file_revisions: input.file_revisions };
}
