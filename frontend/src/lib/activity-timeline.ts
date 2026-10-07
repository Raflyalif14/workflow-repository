import { formatEstimatedValue } from "./project-estimated-value";
import type { ProjectActivityPage, ProjectActivityTimelineItem } from "@/types/project";
import { getIntlLocale, translateOutputName, translateOutputStatus, translateProjectStatus, translateApprovalStatus, translateMilestoneStatus, translate, type TranslationKey } from "@/i18n";

const actionLabels: Record<string, TranslationKey> = {
  OUTPUT_DRAFT_ADD: "businessAudit.draftAdded",
  OUTPUT_DRAFT_REPLACE: "businessAudit.draftReplaced",
  OUTPUT_DRAFT_REMOVE: "businessAudit.draftRemoved",
  OUTPUT_DOCUMENTS_SUBMITTED: "businessAudit.outputSubmitted",
  OUTPUT_DOCUMENTS_APPROVED: "fileRevision.auditApproved",
  OUTPUT_DOCUMENTS_REVISION_REQUESTED: "fileRevision.required",
  PROJECT_SCOPE_CHANGED: "businessAudit.scopeChanged",
  PROJECT_WON: "projectStatus.WON",
  PROJECT_LOST: "projectStatus.LOST",
  PIC_PHASE_RESET: "picOperation.phaseReset",
  PROJECT_ESTIMATED_VALUE_CHANGED: "estimatedValue.changed",
  PRA_TENDER_DECIDED: "projectPhase.decisionRecorded",
  PROJECT_PHASE_CREATED: "activity.phaseCreated",
  PROJECT_PHASE_COMPLETED: "activity.phaseCompleted",
  PROJECT_CREATED: "activity.projectCreated",
  PROJECT_UPDATED: "activity.projectUpdated",
  UPDATE: "activity.projectUpdated",
  PROJECT_POSTPONED: "activity.projectPostponed",
  PROJECT_RESUMED: "activity.projectResumed",
  PROJECT_TIMELINE_UPDATED: "activity.timelineUpdated",
  PROJECT_PLAN_SUBMITTED: "activity.planSubmitted",
  PROJECT_PLAN_APPROVED: "activity.planApproved",
  PROJECT_PLAN_REJECTED: "activity.planRejected",
  PIC_ASSIGNED: "activity.picAssigned",
  PIC_REASSIGNED: "activity.picReassigned",
  MILESTONE_STARTED: "activity.milestoneStarted",
  MILESTONE_COMPLETED: "activity.milestoneCompleted",
  DEADLINE_CHANGE_REQUESTED: "activity.deadlineRequested",
  DEADLINE_APPROVED: "activity.deadlineApproved",
  DEADLINE_REJECTED: "activity.deadlineRejected",
  PROJECT_COMPLETED: "activity.projectCompleted",
};

export const formatActivityAction = (action: string): string => {
  return actionLabels[action] ? translate(actionLabels[action]) : translate("activity.other");
};

export const flattenActivityPages = (pages?: ProjectActivityPage[]): ProjectActivityTimelineItem[] =>
  (pages || []).flatMap((page) => page.items);

export function formatActivityDescription(action: string, description?: string | null, change?: { before: string | null; after: string }, picChange?: ProjectActivityTimelineItem["picAssignmentChange"]) {
  if (picChange) return translate("picOperation.reviewPic", { before: picChange.before?.name || (picChange.before ? translate("common.notAvailable") : translate("ui.unassigned")), after: picChange.after?.name || (picChange.after ? translate("common.notAvailable") : translate("ui.unassigned")) });
  if (action === "PROJECT_ESTIMATED_VALUE_CHANGED" && change) return translate("estimatedValue.history", { before: formatEstimatedValue(change.before), after: formatEstimatedValue(change.after) });
  if (['PROJECT_PHASE_CREATED', 'PROJECT_PHASE_COMPLETED'].includes(action)
    && (description === 'PRA_TENDER' || description === 'ON_SUBMISSION_TENDER')) {
    return translate('projectPhase.label', { phase: description === 'PRA_TENDER' ? 'Pra-Tender' : 'On Submission Tender' });
  }
  if (action === "PRA_TENDER_DECIDED" && description === "CLOSE_PRA_TENDER") return translate("projectPhase.closed");
  if (action === "PRA_TENDER_DECIDED" && description === "CONTINUE_TENDER") return translate("projectPhase.yes");
  if (["OUTPUT_DOCUMENTS_APPROVED", "OUTPUT_DOCUMENTS_REVISION_REQUESTED"].includes(action) && description?.startsWith("{")) {
    try {
      const audit = JSON.parse(description);
      if (audit.object_type === "OUTPUT_DOCUMENT" && Number.isInteger(audit.marked_file_count)
        && audit.marked_file_count >= 0 && audit.marked_file_count <= 10) {
        return translate(action === "OUTPUT_DOCUMENTS_APPROVED" ? "fileRevision.auditApproved" : "fileRevision.auditRevision", { count: audit.marked_file_count });
      }
    } catch { /* Keep legacy descriptions unchanged. */ }
  }
  return description;
}

export function formatBusinessAuditValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (['final_contract_value','estimated_revenue'].includes(key)) return formatEstimatedValue(String(value));
  if (key === 'status' && typeof value === 'string') {
    if (['PENDING','REJECTED'].includes(value)) return translateApprovalStatus(value);
    if (['CREATED','IN_PROGRESS','SUBMITTED'].includes(value)) return translateMilestoneStatus(value);
    return ['DRAFT','ACTIVE','POSTPONED','COMPLETED','CANCELLED','WAITING_RESULT','WON','LOST'].includes(value)
      ? translateProjectStatus(value) : translateOutputStatus(value);
  }
  if (typeof value === 'boolean') return translate(value ? 'businessAudit.yes' : 'businessAudit.no');
  if (['start_date','due_date'].includes(key) && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00Z`).toLocaleDateString(getIntlLocale(), { dateStyle: 'medium', timeZone: 'UTC' });
  }
  if (key === 'selected_keys' && Array.isArray(value)) return value.map(item => translateOutputName(String(item),String(item))).join(', ');
  if (key === 'files' && Array.isArray(value)) return value.map(item => (item as { name: string }).name).join(', ');
  if (key === 'schedule' && Array.isArray(value)) return value.map(item => {
    const row = item as Record<string, unknown>;
    return `${row.id}: ${formatBusinessAuditValue('start_date',row.start_date)} / ${row.duration_working_days} -> ${formatBusinessAuditValue('due_date',row.due_date)}`;
  }).join('\n');
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '-';
}
export function formatBusinessAudit(change: NonNullable<ProjectActivityTimelineItem['businessChange']>): string {
  return `${translate('businessAudit.object')}: ${translate(('businessAuditObjects.'+change.objectType) as TranslationKey)} ${change.objectType === 'OUTPUT_DOCUMENT' && change.objectKey ? translateOutputName(change.objectKey,change.objectKey) : change.objectId}\n` + change.changedFields.map(key =>
    `${translate(('businessAuditFields.' + key) as TranslationKey)}: ${formatBusinessAuditValue(key,change.before[key])} -> ${formatBusinessAuditValue(key,change.after[key])}`).join('\n');
}
