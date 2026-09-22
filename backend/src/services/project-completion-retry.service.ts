import { supabaseAdmin } from '../config/supabase';
import {
  advanceToNextMilestone,
  areSelectedProjectOutputsApproved,
  isMilestoneCompletedLike,
  WorkflowActor,
} from './workflow-progression.service';

const RESULT_PHASE_STATUSES = new Set(['WAITING_RESULT', 'WON', 'LOST']);

export class ProjectCompletionRetryError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = 'ProjectCompletionRetryError';
  }
}

type RetryActor = WorkflowActor & { role: string };

export async function retryProjectCompletion(projectId: string, actor: RetryActor) {
  // 1. Verify access & load project
  const { data: project, error: projectError } = await supabaseAdmin
    .from('projects')
    .select('id,name,sales_id,pic_id,status,is_postponed')
    .eq('id', projectId)
    .single();

  if (projectError || !project) {
    throw new ProjectCompletionRetryError('Project not found.', 404);
  }

  // 2. Authorization - HEAD_SA or SALES owner only
  const isHeadSa = actor.role === 'HEAD_SA';
  const isSalesOwner = actor.role === 'SALES' && project.sales_id === actor.userId;
  if (!isHeadSa && !isSalesOwner) {
    throw new ProjectCompletionRetryError('Forbidden', 403);
  }

  // 3. If already past ACTIVE -> idempotent success
  if (RESULT_PHASE_STATUSES.has(project.status)) {
    return { retried: false, status: project.status, reason: 'ALREADY_COMPLETED' as const };
  }

  // 4. Project must be ACTIVE and not postponed
  if (project.status !== 'ACTIVE') {
    throw new ProjectCompletionRetryError(
      'Project status is ' + project.status + '; retry is only available for ACTIVE projects.'
    );
  }
  if (project.is_postponed) {
    throw new ProjectCompletionRetryError('Project is postponed.');
  }

  // 5. Verify all milestones COMPLETED/APPROVED
  const { data: milestones, error: milestoneError } = await supabaseAdmin
    .from('project_milestones')
    .select('id,status,step_order')
    .eq('project_id', projectId)
    .order('step_order', { ascending: false });

  if (milestoneError) {
    throw new ProjectCompletionRetryError('Failed to verify milestones.', 500);
  }
  if (!milestones?.length) {
    throw new ProjectCompletionRetryError('Project has no milestones.');
  }
  if (!milestones.every((m) => isMilestoneCompletedLike(m.status))) {
    throw new ProjectCompletionRetryError(
      'Not all milestones are completed. Retry is only available when every milestone is finished.'
    );
  }

  // 6. Verify all selected output documents APPROVED
  const { data: outputDocuments, error: outputError } = await supabaseAdmin
    .from('project_output_documents')
    .select('is_required,is_selected,status')
    .eq('project_id', projectId);

  if (outputError) {
    throw new ProjectCompletionRetryError('Failed to verify output documents.', 500);
  }
  if (!outputDocuments?.length) {
    throw new ProjectCompletionRetryError('Project output documents are not available for completion verification.');
  }
  if (!areSelectedProjectOutputsApproved(outputDocuments)) {
    throw new ProjectCompletionRetryError(
      'Not all selected output documents are approved. Complete them before retrying.'
    );
  }

  // 7. Call existing reconciliation
  const lastMilestone = milestones[0];
  try {
    const progression = await advanceToNextMilestone(projectId, lastMilestone.id, actor);
    if (!progression.project_completed) {
      throw new ProjectCompletionRetryError('Project completion is not currently eligible for reconciliation.', 409);
    }

    return {
      retried: true,
      status: 'WAITING_RESULT',
      reason: 'RECONCILED' as const,
    };
  } catch (error) {
    if (error instanceof ProjectCompletionRetryError) throw error;
    console.error('[ProjectCompletionRetry] Reconciliation failed after eligibility verification.', {
      projectId,
      actorId: actor.userId,
    });
    throw new ProjectCompletionRetryError('Unable to reconcile project completion. Please try again.', 500);
  }
}
