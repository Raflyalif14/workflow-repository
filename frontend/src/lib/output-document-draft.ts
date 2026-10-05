import { DOCUMENT_ACCEPT, MAX_DOCUMENT_FILE_SIZE_BYTES } from "./document-file-selection";
import type { ProjectOutputDocumentFile } from "../types/project";

export const MAX_OUTPUT_DRAFT_FILES = 10;
export const MAX_OUTPUT_DRAFT_BYTES = 200 * 1024 * 1024;

export type DraftUploadItem = {
  id: string;
  file: File;
  replaceFileId?: string;
  status: "pending" | "uploading" | "succeeded" | "failed";
  error?: "outputFiles.uploadFailed" | "outputFiles.draftConflict";
};

export function getOutputDraftSubmitRequest(
  documentKey: string,
  draftRevision: number,
  requests: Map<string, { revision: number; requestId: string }>,
  createRequestId: () => string
) {
  let request = requests.get(documentKey);
  if (!request || request.revision !== draftRevision) {
    request = { revision: draftRevision, requestId: createRequestId() };
    requests.set(documentKey, request);
  }
  return { document_key: documentKey, expected_draft_revision: draftRevision, request_id: request.requestId };
}

export function validateOutputDraftSelection(
  currentFiles: readonly ProjectOutputDocumentFile[],
  selectedFiles: readonly Pick<File, "name" | "size">[],
  replaceFileId?: string
): string | null {
  if (replaceFileId && (!currentFiles.some((file) => file.id === replaceFileId) || selectedFiles.length !== 1)) {
    return "outputFiles.replacementUnavailable";
  }
  const allowedExtensions = new Set(DOCUMENT_ACCEPT.split(","));
  for (const file of selectedFiles) {
    if (!file.name.trim() || !allowedExtensions.has(file.name.slice(file.name.lastIndexOf(".")).toLowerCase())) {
      return "outputFiles.unsupportedType";
    }
    if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_DOCUMENT_FILE_SIZE_BYTES) {
      return "outputFiles.fileSizeLimit";
    }
  }
  const retained = currentFiles.filter((file) => file.id !== replaceFileId);
  if (retained.length + selectedFiles.length > MAX_OUTPUT_DRAFT_FILES) return "outputFiles.fileCountLimit";
  const total = retained.reduce((sum, file) => sum + (Number(file.fileSize) || 0), 0)
    + selectedFiles.reduce((sum, file) => sum + file.size, 0);
  return total > MAX_OUTPUT_DRAFT_BYTES ? "outputFiles.totalSizeLimit" : null;
}

export function hasUnfinishedDraftUploads(items: readonly DraftUploadItem[]): boolean {
  return items.some((item) => item.status !== "succeeded");
}

export function getOutputDraftReloadRevision(
  currentRevision: number,
  previousRevision: number,
  items: readonly DraftUploadItem[]
): number {
  // An upload may have committed before its response was lost. Its request ID is
  // bound to the original CAS token, even when an explicit refresh sees new data.
  return items.some((item) => item.status === "failed" && item.error === "outputFiles.uploadFailed")
    ? previousRevision : currentRevision;
}

export function getDraftUploadError(error: unknown): DraftUploadItem["error"] {
  return error instanceof Error && error.message === "This output draft changed. Refresh and try again."
    ? "outputFiles.draftConflict"
    : "outputFiles.uploadFailed";
}

// Serial writes advance the draft CAS token. A retry reuses each item's request ID,
// allowing the server to acknowledge a persisted file after a lost response.
export async function uploadOutputDraftQueue(
  items: readonly DraftUploadItem[],
  initialRevision: number,
  upload: (item: DraftUploadItem, revision: number) => Promise<{ draftRevision: number }>,
  onUpdate: (id: string, update: Pick<DraftUploadItem, "status" | "error">) => void
): Promise<number> {
  let revision = initialRevision;
  for (const item of items) {
    if (item.status === "succeeded") continue;
    onUpdate(item.id, { status: "uploading", error: undefined });
    try {
      const receipt = await upload(item, revision);
      revision = receipt.draftRevision;
      onUpdate(item.id, { status: "succeeded", error: undefined });
    } catch (error) {
      const category = getDraftUploadError(error);
      onUpdate(item.id, { status: "failed", error: category });
      // A transport failure may follow a committed write. Replay this exact request
      // and CAS token before allowing another file to advance the draft revision.
      break;
    }
  }
  return revision;
}
