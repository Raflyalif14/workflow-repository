import { getIntlLocale, translate, translateDocumentStatus, translateRole } from "@/i18n";
export type DocumentSurfaceSource = "OFFICIAL_DOCUMENT" | "PROJECT_INTAKE";

const mimeLabels: Record<string, string> = {
  "application/pdf": "PDF",
  "application/msword": "DOC",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "DOCX",
  "application/vnd.ms-excel": "XLS",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
  "application/zip": "ZIP",
  "image/jpeg": "JPEG",
  "image/png": "PNG",
};

function titleCase(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");

  return normalized
    ? normalized.replace(/\b\w/g, (character) => character.toUpperCase())
    : translate("common.notAvailable");
}

export function formatDocumentStatus(status?: string | null): string {
  if (!status) return translate("common.notAvailable");
  return ["APPROVED", "DRAFT", "REJECTED", "SUBMITTED", "SUPERSEDED", "UNDER_REVIEW"].includes(status)
    ? translateDocumentStatus(status) : titleCase(status);
}

export function formatDocumentRole(role?: string | null): string {
  if (!role) return translate("documentSurface.roleUnavailable");
  return ["HEAD_SA", "SA", "SALES", "SUPER_ADMIN"].includes(role) ? translateRole(role) : titleCase(role);
}

export function formatDocumentParticipant(value?: string | null): string {
  return value?.trim() || translate("common.notAvailable");
}

export function formatDocumentDateTime(value?: string | null): string {
  if (!value) return translate("common.notAvailable");
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return translate("common.notAvailable");

  return parsed.toLocaleString(getIntlLocale(), {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatDocumentFileSize(value?: number | null): string {
  if (value == null || !Number.isFinite(value) || value < 0) {
    return translate("documentSurface.sizeUnavailable");
  }
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}

export function formatDocumentMimeType(value?: string | null): string {
  if (!value) return translate("documentSurface.typeUnavailable");
  return mimeLabels[value.toLowerCase()] || titleCase(value.split("/").pop() || value);
}

export function getDocumentContextLabel(
  source: DocumentSurfaceSource,
  milestoneId?: string | null
): string {
  if (source === "PROJECT_INTAKE") return translate("documentSurface.intakeEvidence");
  return milestoneId ? translate("documentSurface.milestoneDeliverable") : translate("documentSurface.projectDocument");
}

export function getDocumentPrimaryActionLabel(canUploadVersion: boolean): string {
  return translate(canUploadVersion ? "documents.uploadVersion" : "documentSurface.downloadLatest");
}

export function getVersionLabel(versionNumber?: number | null): string {
  return Number.isInteger(versionNumber) && Number(versionNumber) > 0
    ? translate("documents.version", { number: Number(versionNumber) })
    : translate("documentSurface.versionUnavailable");
}

export function getLatestVersionLabel(isLatest: boolean): string | null {
  return isLatest ? translate("documentSurface.latest") : null;
}

export function getEmptyDiscussionLabel(): string {
  return translate("documentSurface.noDiscussion");
}
