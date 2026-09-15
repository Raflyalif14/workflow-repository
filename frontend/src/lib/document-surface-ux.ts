export type DocumentSurfaceSource = "OFFICIAL_DOCUMENT" | "PROJECT_INTAKE";

const statusLabels: Record<string, string> = {
  APPROVED: "Approved",
  DRAFT: "Draft",
  REJECTED: "Rejected",
  SUBMITTED: "Submitted",
  SUPERSEDED: "Superseded",
  UNDER_REVIEW: "Under review",
};

const roleLabels: Record<string, string> = {
  HEAD_SA: "Head SA",
  SA: "SA",
  SALES: "Sales",
  SUPER_ADMIN: "Super Admin",
};

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
    : "Not available";
}

export function formatDocumentStatus(status?: string | null): string {
  if (!status) return "Not available";
  return statusLabels[status] || titleCase(status);
}

export function formatDocumentRole(role?: string | null): string {
  if (!role) return "Role not available";
  return roleLabels[role] || titleCase(role);
}

export function formatDocumentParticipant(value?: string | null): string {
  return value?.trim() || "Not available";
}

export function formatDocumentDateTime(value?: string | null): string {
  if (!value) return "Not available";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not available";

  return parsed.toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatDocumentFileSize(value?: number | null): string {
  if (value == null || !Number.isFinite(value) || value < 0) {
    return "Size not available";
  }
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}

export function formatDocumentMimeType(value?: string | null): string {
  if (!value) return "Type not available";
  return mimeLabels[value.toLowerCase()] || titleCase(value.split("/").pop() || value);
}

export function getDocumentContextLabel(
  source: DocumentSurfaceSource,
  milestoneId?: string | null
): string {
  if (source === "PROJECT_INTAKE") return "Project Intake evidence";
  return milestoneId ? "Milestone deliverable" : "Project document";
}

export function getDocumentPrimaryActionLabel(canUploadVersion: boolean): string {
  return canUploadVersion ? "Upload new version" : "Download latest";
}

export function getVersionLabel(versionNumber?: number | null): string {
  return Number.isInteger(versionNumber) && Number(versionNumber) > 0
    ? `Version ${versionNumber}`
    : "Version not available";
}

export function getLatestVersionLabel(isLatest: boolean): string | null {
  return isLatest ? "Latest" : null;
}

export function getEmptyDiscussionLabel(): string {
  return "No discussion yet.";
}
