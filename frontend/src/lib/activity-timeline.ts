import { formatEstimatedValue } from "./project-estimated-value";
import type { ProjectActivityPage, ProjectActivityTimelineItem } from "@/types/project";
import { getIntlLocale, translateOutputName, translateOutputStatus, translateProjectStatus, translateApprovalStatus, translateMilestoneStatus, translate, type TranslationKey } from "@/i18n";

const actionLabels: Record<string, TranslationKey> = {
  DOCUMENT_VERSION_UPLOADED: 'artifactAudit.version',
  DOCUMENT_APPROVED: 'artifactAudit.approved',
  DOCUMENT_REJECTED: 'artifactAudit.rejected',
  DOCUMENT_COMMENT_ADDED: 'artifactAudit.comment',
  SUPPORTING_INPUT_ADDED: 'artifactAudit.contribution',
  SUPPORTING_DOCUMENT_PROMOTED: 'artifactAudit.promoted',
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
  if (description === action && action.startsWith("DOCUMENT_") || description === action && action.startsWith("SUPPORTING_")) return formatActivityAction(action);
  return description;
}

export type BusinessAuditDisplayContext = {
  projectName?: string;
  milestones?: Array<{ id: string; name: string }>;
  scenarios?: Array<{ id: string; name: string }>;
};

function formatScheduleRow(row: Record<string, unknown> | undefined): string {
  if (!row) return translate('businessAudit.notSet');
  return ['start_date', 'duration_working_days', 'due_date'].map(key =>
    `${translate(('businessAuditFields.' + key) as TranslationKey)}: ${formatBusinessAuditValue(key, row[key])}`
  ).join(' · ');
}

export function formatBusinessAuditValue(key: string, value: unknown, context: BusinessAuditDisplayContext = {}): string {
  if (value === null || value === undefined) return translate('businessAudit.notSet');
  if (key === 'scenario_id') return context.scenarios?.find(row => row.id === value)?.name || translate('common.notAvailable');
  if (key.endsWith('_id')) return translate('common.notAvailable');
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
    const name = context.milestones?.find(milestone => milestone.id === row.id)?.name || translate('businessAuditObjects.MILESTONE');
    return `${name}: ${formatScheduleRow(row)}`;
  }).join('\n');
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '-';
}
export function formatBusinessAudit(change: NonNullable<ProjectActivityTimelineItem['businessChange']>, context: BusinessAuditDisplayContext = {}): string {
  const name = change.objectType === 'PROJECT' ? context.projectName
    : change.objectType === 'MILESTONE' ? context.milestones?.find(row => row.id === change.objectId)?.name
    : change.objectType === 'OUTPUT_DOCUMENT' && change.objectKey ? translateOutputName(change.objectKey, change.objectKey) : undefined;
  const object = `${translate(('businessAuditObjects.' + change.objectType) as TranslationKey)}${name ? `: ${name}` : ''}`;
  const fields = change.changedFields.filter(key => !key.endsWith('_id') || key === 'scenario_id').map(key => {
    if (key === 'schedule') {
      const before = (Array.isArray(change.before.schedule) ? change.before.schedule : []) as Record<string, unknown>[];
      const after = (Array.isArray(change.after.schedule) ? change.after.schedule : []) as Record<string, unknown>[];
      // IDs only pair audit rows; they are never part of the display text.
      const ids = [...new Set([...before, ...after].map(row => row.id))];
      return ids.flatMap(id => {
        const oldRow = before.find(row => row.id === id), newRow = after.find(row => row.id === id);
        if (formatScheduleRow(oldRow) === formatScheduleRow(newRow)) return [];
        const milestone = context.milestones?.find(row => row.id === id)?.name || translate('businessAuditObjects.MILESTONE');
        return [`${milestone}\n${translate('businessAudit.before')}: ${formatScheduleRow(oldRow)}\n${translate('businessAudit.after')}: ${formatScheduleRow(newRow)}`];
      }).join('\n');
    }
    return `${translate(('businessAuditFields.' + key) as TranslationKey)}: ${formatBusinessAuditValue(key, change.before[key], context)} → ${formatBusinessAuditValue(key, change.after[key], context)}`;
  }).filter(Boolean);
  return [object, ...fields].join('\n');
}
