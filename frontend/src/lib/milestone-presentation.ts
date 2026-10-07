import type { ProjectOutputDocumentItem } from "@/types/project";

export function milestoneIdFromHash(hash: string, milestoneIds: readonly string[]): string | null {
  const prefix = hash.startsWith("#milestone-outputs-") ? "#milestone-outputs-"
    : hash.startsWith("#project-milestone-") ? "#project-milestone-" : null;
  if (!prefix) return null;
  try {
    const id = decodeURIComponent(hash.slice(prefix.length).split("?")[0]);
    return milestoneIds.includes(id) ? id : null;
  } catch {
    return null;
  }
}

export function initialExpandedMilestoneIds(
  milestones: ReadonlyArray<{ id: string; status: string }>,
  documents: readonly ProjectOutputDocumentItem[] | undefined,
  role?: string
): Set<string> {
  const expanded = new Set(milestones.filter((milestone) => milestone.status === "IN_PROGRESS").map((milestone) => milestone.id));
  if (role === "HEAD_SA") {
    for (const document of documents || []) {
      if (document.status === "IN_REVIEW" && milestones.some((milestone) => milestone.id === document.milestoneId)) {
        expanded.add(document.milestoneId);
      }
    }
  }
  return expanded;
}

export function reconcileExpandedMilestoneIds(
  current: ReadonlySet<string>,
  milestones: ReadonlyArray<{ id: string; status: string }>,
  documents: readonly ProjectOutputDocumentItem[] | undefined,
  role: string | undefined,
  manuallyToggled: ReadonlySet<string>
): Set<string> {
  const next = new Set(current);
  for (const id of initialExpandedMilestoneIds(milestones, documents, role)) {
    if (!manuallyToggled.has(id)) next.add(id);
  }
  return next;
}

export function visibleMilestoneOutputCounts(
  documents: readonly ProjectOutputDocumentItem[],
  milestoneId: string,
  canSeeNonFinal: boolean
) {
  const visible = documents.filter((document) => document.milestoneId === milestoneId && (document.isRequired || document.isSelected));
  const approved = visible.filter((document) => document.status === "APPROVED").length;
  if (!canSeeNonFinal) return { total: null, approved, inReview: 0, revisionRequired: 0 };
  return {
    total: visible.length,
    approved,
    inReview: visible.filter((document) => document.status === "IN_REVIEW").length,
    revisionRequired: visible.filter((document) => document.status === "REVISION_REQUIRED").length,
  };
}
