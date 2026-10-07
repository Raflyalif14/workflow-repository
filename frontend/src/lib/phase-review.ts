import type { Project, ProjectMilestonePhase4, ProjectOutputDocumentItem } from '@/types/project';

export const activePhaseMilestones = (project: Project | undefined, rows: ProjectMilestonePhase4[]) =>
  project?.active_phase_id ? rows.filter(row => row.phase_id === project.active_phase_id) : rows;
export function isPraTenderDecisionPending(project: Project) {
  const phase = project.phases?.find(item => item.id === project.active_phase_id);
  return project.status === 'ACTIVE' && !project.is_postponed
    && phase?.phase_key === 'PRA_TENDER' && phase.status === 'COMPLETED'
    && !phase.sales_decision
    && !project.phases?.some(item => item.phase_key === 'ON_SUBMISSION_TENDER');
}
export function canContinueTenderPhase(project: Project, role?: string, userId?: string) {
  return role === 'SALES' && userId === project.sales_id && isPraTenderDecisionPending(project);
}
export function isProjectClosedAtPraTender(project: Project) {
  return project.status === 'COMPLETED' && project.phases?.some(phase => phase.id === project.active_phase_id
    && phase.phase_key === 'PRA_TENDER' && phase.sales_decision === 'CLOSE_PRA_TENDER');
}
export const hasReviewReason = (reason: string) => Boolean(reason.trim());
export async function runConfirmedDecision<T>(input: { confirmed: boolean; reason?: string; reasonRequired?: boolean; current: boolean }, save: () => Promise<T>) {
  if (!input.confirmed) return undefined;
  if (input.reasonRequired && !hasReviewReason(input.reason || '')) throw new Error('Reason required');
  if (!input.current) throw new Error('Review is stale');
  return save();
}
export function captureOutputReview(documents: ProjectOutputDocumentItem[]) {
  if (!documents.length || documents.some(item => item.status !== 'IN_REVIEW' || !item.currentVersionId)) throw new Error('Review unavailable');
  return documents.map(item => ({ document_key: item.key, expected_version_id: item.currentVersionId!,
    name: item.name, group: item.group, version: item.currentVersionNumber, fileCount: item.files?.length || 0 }));
}
export function reviewTargetsAreCurrent(targets: ReturnType<typeof captureOutputReview>, documents: ProjectOutputDocumentItem[]) {
  return targets.every(target => documents.some(item => item.key === target.document_key
    && item.status === 'IN_REVIEW' && item.currentVersionId === target.expected_version_id));
}
