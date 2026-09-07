import { supabaseAdmin } from '../config/supabase';
import { ApproveMilestoneApprovalInput, RejectMilestoneApprovalInput } from '../validators/milestone-approval.validator';
import { notifyMilestoneApproved, notifyMilestoneRejected } from './milestone-notification.service';
import {
  MilestoneSubmissionPackageReviewError,
  MilestoneSubmissionPackageReviewService,
  SubmissionPackageReviewOperation,
} from './milestone-submission-package-review.service';
import { advanceToNextMilestone, isMilestoneCompletedLike, logWorkflowActivityBestEffort } from './workflow-progression.service';

export { isMilestoneCompletedLike } from './workflow-progression.service';

type Actor = { userId: string; role: string; fullName: string };
type ReviewDecision = 'APPROVED' | 'REJECTED';
type MilestoneApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

type MilestoneApproval = {
  id: string;
  milestone_id: string;
  submitted_by: string;
  submission_note: string | null;
  status: MilestoneApprovalStatus;
  reviewed_by: string | null;
  review_note: string | null;
  submitted_at: string;
  reviewed_at: string | null;
};

type MilestoneApprovalMilestone = {
  id: string;
  project_id: string;
  name: string;
  step_order: number;
  status: string;
  pic_id: string | null;
  completed_at: string | null;
  project: {
    id: string;
    name: string;
    status: string;
    is_postponed: boolean;
  } | null;
};

type MilestoneApprovalContext = {
  approval: MilestoneApproval;
  milestone: MilestoneApprovalMilestone;
};

type UserSummary = {
  id: string;
  full_name: string;
  email: string;
};

type MilestoneApprovalReadProject = {
  id: string;
  sales_id: string | null;
  pic_id: string | null;
};

type NextMilestoneSummary = {
  id: string;
  name: string;
  step_order: number;
  status: string;
  start_date?: string | null;
  duration_working_days?: number | null;
  due_date?: string | null;
};

const normalizeRelatedOne = <T>(value: T | T[] | null): T | null => {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
};

export function selectNextMilestone(
  current: Pick<MilestoneApprovalMilestone, 'id' | 'project_id' | 'step_order'>,
  milestones: NextMilestoneSummary[]
) {
  return [...milestones]
    .filter((milestone) => milestone.id !== current.id && milestone.step_order > current.step_order)
    .sort((a, b) => a.step_order - b.step_order)[0] || null;
}

export function shouldCompleteProject(projectStatus: string, milestones: Array<{ status: string }>) {
  if (projectStatus !== 'ACTIVE' && projectStatus !== 'COMPLETED') return false;
  return milestones.length > 0 && milestones.every((milestone) => isMilestoneCompletedLike(milestone.status));
}

export function buildMilestoneApprovalReview(
  approvalStatus: MilestoneApprovalStatus,
  milestoneStatus: string,
  project: { status: string; is_postponed: boolean } | null,
  decision: ReviewDecision,
  actor: Actor,
  note?: string | null,
  reviewedAt = new Date().toISOString()
) {
  const trimmedNote = note?.trim() || null;

  if (actor.role !== 'HEAD_SA') throw new Error('Forbidden');
  if (approvalStatus !== 'PENDING') throw new Error('Milestone approval is no longer pending.');
  if (!project) throw new Error('Project not found');
  if (project.status === 'POSTPONED' || project.is_postponed) throw new Error('Project is postponed.');
  if (project.status !== 'ACTIVE') throw new Error('Project is not active.');
  if (milestoneStatus !== 'SUBMITTED') throw new Error('Only a SUBMITTED milestone can be reviewed.');
  if (decision === 'REJECTED' && !trimmedNote) throw new Error('note is required');

  return {
    approval: {
      status: decision,
      reviewed_by: actor.userId,
      review_note: trimmedNote,
      reviewed_at: reviewedAt,
    },
    milestone: {
      status: decision === 'APPROVED' ? 'COMPLETED' : 'REJECTED',
      completed_at: decision === 'APPROVED' ? reviewedAt : null,
    },
  };
}

async function logMilestoneApprovalReview(
  actor: Actor,
  context: MilestoneApprovalContext,
  action: 'MILESTONE_APPROVED' | 'MILESTONE_REJECTED'
) {
  const verb = action === 'MILESTONE_APPROVED' ? 'approved' : 'rejected';
  await logWorkflowActivityBestEffort(
    actor,
    context.milestone.project_id,
    action,
    `${actor.fullName} ${verb} milestone '${context.milestone.name}'`
  );
}

export function buildProjectCompletedActivityLog(actor: Actor, projectId: string, milestoneName: string) {
  return {
    project_id: projectId,
    user_id: actor.userId,
    action: 'PROJECT_COMPLETED',
    description: `${actor.fullName} completed project workflow after milestone '${milestoneName}' was approved`,
  };
}

export function assertCanViewMilestoneApprovalHistory(
  project: MilestoneApprovalReadProject | null,
  actor: Actor
): void {
  if (!project) throw new Error('Project not found');
  if (actor.role === 'SUPER_ADMIN' || actor.role === 'HEAD_SA') return;
  if (actor.role === 'SALES' && project.sales_id === actor.userId) return;
  if (actor.role === 'SA' && project.pic_id === actor.userId) return;
  throw new Error('Milestone not found');
}

async function logProjectCompleted(actor: Actor, projectId: string, milestoneName: string) {
  const { error } = await supabaseAdmin.from('activity_logs').insert(buildProjectCompletedActivityLog(actor, projectId, milestoneName));

  if (error) throw error;
}

export class MilestoneApprovalService {
  private static async ensureCanViewMilestoneApprovalHistory(milestoneId: string, actor: Actor) {
    const { data, error } = await supabaseAdmin
      .from('project_milestones')
      .select('id, project:projects!project_milestones_project_id_fkey(id,sales_id,pic_id)')
      .eq('id', milestoneId)
      .single();

    if (error || !data) throw new Error('Milestone not found');
    assertCanViewMilestoneApprovalHistory(normalizeRelatedOne(data.project), actor);
  }

  private static async getApprovalContext(approvalId: string): Promise<MilestoneApprovalContext> {
    const { data: approval, error: approvalError } = await supabaseAdmin
      .from('milestone_approvals')
      .select('id, milestone_id, submitted_by, submission_note, status, reviewed_by, review_note, submitted_at, reviewed_at')
      .eq('id', approvalId)
      .single();

    if (approvalError || !approval) throw new Error('Milestone approval not found');

    const { data: milestone, error: milestoneError } = await supabaseAdmin
      .from('project_milestones')
      .select('id, project_id, name, step_order, status, pic_id, completed_at, project:projects!project_milestones_project_id_fkey(id,name,status,is_postponed)')
      .eq('id', approval.milestone_id)
      .single();

    if (milestoneError || !milestone) throw new Error('Milestone not found');

    return {
      approval: approval as MilestoneApproval,
      milestone: {
        ...milestone,
        project: normalizeRelatedOne(milestone.project),
      } as MilestoneApprovalMilestone,
    };
  }

  private static async reconcileApprovedMilestone(context: MilestoneApprovalContext, actor: Actor) {
    const { approval, milestone } = context;
    if (actor.role !== 'HEAD_SA') throw new Error('Forbidden');
    if (!milestone.project) throw new Error('Project not found');
    if (milestone.project.status === 'POSTPONED' || milestone.project.is_postponed) throw new Error('Project is postponed.');
    if (!['ACTIVE', 'COMPLETED'].includes(milestone.project.status)) throw new Error('Project is not active.');

    // Reconcile only committed review state; never reclaim a package or replay promotion.
    const { data: linkedPackage, error } = await supabaseAdmin
      .from('milestone_submission_packages')
      .select('id,status,project_id,milestone_id')
      .eq('milestone_approval_id', approval.id)
      .maybeSingle();
    if (error) throw new MilestoneSubmissionPackageReviewError('Failed to retrieve milestone submission package.', 500);
    if (linkedPackage && (linkedPackage.status !== 'APPROVED'
      || linkedPackage.project_id !== milestone.project_id || linkedPackage.milestone_id !== milestone.id)) {
      throw new MilestoneSubmissionPackageReviewError('Milestone submission review is not finalized.', 409);
    }

    let reviewerName: string | null = approval.reviewed_by === actor.userId ? actor.fullName : null;
    if (approval.reviewed_by && approval.reviewed_by !== actor.userId) {
      const { data: reviewer, error: reviewerError } = await supabaseAdmin
        .from('users').select('id,full_name').eq('id', approval.reviewed_by).maybeSingle();
      if (reviewerError) throw new Error('Failed to retrieve milestone reviewer.');
      reviewerName = reviewer?.full_name || null;
    }
    const progression = await advanceToNextMilestone(milestone.project_id, milestone.id, actor);
    return {
      milestone_id: milestone.id,
      name: milestone.name,
      status: milestone.status,
      current_milestone: {
        id: milestone.id,
        name: milestone.name,
        status: milestone.status,
        completed_at: milestone.completed_at,
      },
      next_milestone: progression.next_milestone,
      project_completed: progression.project_completed,
      approval: {
        id: approval.id,
        status: approval.status,
        review_note: approval.review_note,
        reviewed_by: { id: approval.reviewed_by, full_name: reviewerName },
      },
    };
  }

  private static async rollbackPackageReviewFinalization(
    context: MilestoneApprovalContext,
    review: ReturnType<typeof buildMilestoneApprovalReview>,
    approvalUpdated: boolean,
    milestoneUpdatedAt: string | null,
    actor: Actor
  ): Promise<void> {
    const rollbackFailures: string[] = [];

    if (milestoneUpdatedAt) {
      let milestoneRollback = supabaseAdmin
        .from('project_milestones')
        .update({ status: 'SUBMITTED', completed_at: null, updated_at: new Date().toISOString() })
        .eq('id', context.milestone.id)
        .eq('status', review.milestone.status)
        .eq('updated_at', milestoneUpdatedAt);
      milestoneRollback = review.milestone.completed_at
        ? milestoneRollback.eq('completed_at', review.milestone.completed_at)
        : milestoneRollback.is('completed_at', null);
      const { data, error } = await milestoneRollback.select('id').maybeSingle();
      if (error || !data) rollbackFailures.push('milestone');
    }

    if (approvalUpdated) {
      const { data, error } = await supabaseAdmin
        .from('milestone_approvals')
        .update({
          status: 'PENDING',
          reviewed_by: null,
          review_note: null,
          reviewed_at: null,
        })
        .eq('id', context.approval.id)
        .eq('status', review.approval.status)
        .eq('reviewed_by', actor.userId)
        .eq('reviewed_at', review.approval.reviewed_at)
        .select('id')
        .maybeSingle();
      if (error || !data) rollbackFailures.push('approval');
    }

    if (rollbackFailures.length) {
      console.error('[MilestoneApproval] Package-backed review rollback did not fully complete.', {
        approvalId: context.approval.id,
        rollbackFailures,
      });
    }
  }

  private static async reviewPackageBackedApproval(
    context: MilestoneApprovalContext,
    review: ReturnType<typeof buildMilestoneApprovalReview>,
    decision: ReviewDecision,
    actor: Actor,
    packageOperation: SubmissionPackageReviewOperation
  ) {
    let approvalUpdated = false;
    let milestoneUpdatedAt: string | null = null;
    let updatedApproval: MilestoneApproval | null = null;
    let updatedMilestone: { id: string; project_id: string; name: string; step_order: number; status: string; completed_at: string | null } | null = null;

    try {
      if (decision === 'APPROVED') {
        await MilestoneSubmissionPackageReviewService.promote(packageOperation);
      } else {
        await MilestoneSubmissionPackageReviewService.reject(packageOperation);
      }

      const { data, error: approvalError } = await supabaseAdmin
        .from('milestone_approvals')
        .update(review.approval)
        .eq('id', context.approval.id)
        .eq('status', 'PENDING')
        .select('id, milestone_id, submitted_by, submission_note, status, reviewed_by, review_note, submitted_at, reviewed_at')
        .maybeSingle();

      if (approvalError) {
        throw new MilestoneSubmissionPackageReviewError('Failed to finalize milestone submission review.', 500);
      }
      if (!data) {
        throw new MilestoneSubmissionPackageReviewError('Milestone approval is no longer pending.', 409);
      }
      updatedApproval = data as MilestoneApproval;
      approvalUpdated = true;

      const milestoneTransitionAt = new Date().toISOString();
      const { data: milestoneData, error: milestoneError } = await supabaseAdmin
        .from('project_milestones')
        .update({
          status: review.milestone.status,
          completed_at: review.milestone.completed_at,
          updated_at: milestoneTransitionAt,
        })
        .eq('id', context.milestone.id)
        .eq('status', 'SUBMITTED')
        .select('id, project_id, name, step_order, status, completed_at')
        .maybeSingle();

      if (milestoneError) {
        throw new MilestoneSubmissionPackageReviewError('Failed to finalize milestone submission review.', 500);
      }
      if (!milestoneData) {
        throw new MilestoneSubmissionPackageReviewError('Only a SUBMITTED milestone can be reviewed.', 409);
      }
      updatedMilestone = milestoneData;
      milestoneUpdatedAt = milestoneTransitionAt;
    } catch (error) {
      await this.rollbackPackageReviewFinalization(context, review, approvalUpdated, milestoneUpdatedAt, actor);
      if (decision === 'APPROVED') {
        await MilestoneSubmissionPackageReviewService.rollbackPromotion(packageOperation);
      }

      if (error instanceof MilestoneSubmissionPackageReviewError) throw error;
      throw new MilestoneSubmissionPackageReviewError('Failed to finalize milestone submission review.', 500);
    }

    await logMilestoneApprovalReview(
      actor,
      context,
      decision === 'APPROVED' ? 'MILESTONE_APPROVED' : 'MILESTONE_REJECTED'
    );
    const progression = decision === 'APPROVED'
      ? await advanceToNextMilestone(context.milestone.project_id, updatedMilestone!.id, actor)
      : null;
    const projectName = context.milestone.project?.name;
    if (projectName) {
      const notificationContext = {
        projectId: context.milestone.project_id,
        projectName,
        milestoneId: updatedMilestone!.id,
        milestoneName: updatedMilestone!.name,
        picId: context.milestone.pic_id,
      };
      if (decision === 'APPROVED') {
        await notifyMilestoneApproved(notificationContext);
      } else {
        await notifyMilestoneRejected(notificationContext);
      }
    }

    return {
      milestone_id: updatedMilestone!.id,
      name: updatedMilestone!.name,
      status: updatedMilestone!.status,
      current_milestone: {
        id: updatedMilestone!.id,
        name: updatedMilestone!.name,
        status: updatedMilestone!.status,
        completed_at: updatedMilestone!.completed_at,
      },
      next_milestone: progression?.next_milestone || null,
      project_completed: progression?.project_completed || false,
      approval: {
        id: updatedApproval!.id,
        status: updatedApproval!.status,
        review_note: updatedApproval!.review_note,
        reviewed_by: {
          id: actor.userId,
          full_name: actor.fullName,
        },
      },
    };
  }

  private static async review(approvalId: string, decision: ReviewDecision, note: string | undefined, actor: Actor) {
    const context = await this.getApprovalContext(approvalId);
    if (decision === 'APPROVED' && context.approval.status === 'APPROVED' && context.milestone.status === 'COMPLETED') {
      return this.reconcileApprovedMilestone(context, actor);
    }
    const review = buildMilestoneApprovalReview(
      context.approval.status,
      context.milestone.status,
      context.milestone.project,
      decision,
      actor,
      note
    );

    const packageOperation = await MilestoneSubmissionPackageReviewService.beginReview(context.approval.id, decision);
    if (packageOperation) {
      return this.reviewPackageBackedApproval(context, review, decision, actor, packageOperation);
    }

    const { data: updatedApproval, error: approvalError } = await supabaseAdmin
      .from('milestone_approvals')
      .update(review.approval)
      .eq('id', approvalId)
      .eq('status', 'PENDING')
      .select('id, milestone_id, submitted_by, submission_note, status, reviewed_by, review_note, submitted_at, reviewed_at')
      .maybeSingle();

    if (approvalError) throw new Error(approvalError.message);
    if (!updatedApproval) throw new Error('Milestone approval is no longer pending.');

    const { data: updatedMilestone, error: milestoneError } = await supabaseAdmin
      .from('project_milestones')
      .update({
        status: review.milestone.status,
        completed_at: review.milestone.completed_at,
        updated_at: new Date().toISOString(),
      })
      .eq('id', context.milestone.id)
      .eq('status', 'SUBMITTED')
      .select('id, project_id, name, step_order, status, completed_at')
      .maybeSingle();

    if (milestoneError || !updatedMilestone) {
      const { error: rollbackError } = await supabaseAdmin
        .from('milestone_approvals')
        .update({
          status: 'PENDING',
          reviewed_by: null,
          review_note: null,
          reviewed_at: null,
        })
        .eq('id', approvalId);

      if (rollbackError) {
        throw new Error(`${milestoneError?.message || 'Only a SUBMITTED milestone can be reviewed.'}; rollback failed: ${rollbackError.message}`);
      }

      throw new Error(milestoneError?.message || 'Only a SUBMITTED milestone can be reviewed.');
    }

    await logMilestoneApprovalReview(
      actor,
      context,
      decision === 'APPROVED' ? 'MILESTONE_APPROVED' : 'MILESTONE_REJECTED'
    );
    const progression = decision === 'APPROVED'
      ? await advanceToNextMilestone(context.milestone.project_id, updatedMilestone.id, actor)
      : null;
    const projectName = context.milestone.project?.name;
    if (projectName) {
      const notificationContext = {
        projectId: context.milestone.project_id,
        projectName,
        milestoneId: updatedMilestone.id,
        milestoneName: updatedMilestone.name,
        picId: context.milestone.pic_id,
      };
      if (decision === 'APPROVED') {
        await notifyMilestoneApproved(notificationContext);
      } else {
        await notifyMilestoneRejected(notificationContext);
      }
    }

    return {
      milestone_id: updatedMilestone.id,
      name: updatedMilestone.name,
      status: updatedMilestone.status,
      current_milestone: {
        id: updatedMilestone.id,
        name: updatedMilestone.name,
        status: updatedMilestone.status,
        completed_at: updatedMilestone.completed_at,
      },
      next_milestone: progression?.next_milestone || null,
      project_completed: progression?.project_completed || false,
      approval: {
        id: updatedApproval.id,
        status: updatedApproval.status,
        review_note: updatedApproval.review_note,
        reviewed_by: {
          id: actor.userId,
          full_name: actor.fullName,
        },
      },
    };
  }

  static approveMilestoneApproval(approvalId: string, input: ApproveMilestoneApprovalInput, actor: Actor) {
    return this.review(approvalId, 'APPROVED', input.note, actor);
  }

  static rejectMilestoneApproval(approvalId: string, input: RejectMilestoneApprovalInput, actor: Actor) {
    return this.review(approvalId, 'REJECTED', input.note, actor);
  }

  static async getApprovalHistory(milestoneId: string, actor: Actor) {
    await this.ensureCanViewMilestoneApprovalHistory(milestoneId, actor);

    const { data: approvals, error } = await supabaseAdmin
      .from('milestone_approvals')
      .select('id, milestone_id, submitted_by, submission_note, status, reviewed_by, review_note, submitted_at, reviewed_at')
      .eq('milestone_id', milestoneId)
      .order('submitted_at', { ascending: false });

    if (error) throw new Error('Failed to retrieve milestone approval history.');
    if (!approvals?.length) return [];

    const userIds = [
      ...new Set(
        approvals
          .flatMap((approval) => [approval.submitted_by, approval.reviewed_by])
          .filter((userId): userId is string => Boolean(userId))
      ),
    ];
    const users = new Map<string, UserSummary>();

    if (userIds.length) {
      const { data: userRows, error: userError } = await supabaseAdmin
        .from('users')
        .select('id, full_name, email')
        .in('id', userIds);

      if (userError) throw new Error('Failed to retrieve milestone approval history.');
      (userRows || []).forEach((user) => users.set(user.id, user));
    }

    return approvals.map((approval) => ({
      id: approval.id,
      status: approval.status,
      submission_note: approval.submission_note,
      submitted_by: users.get(approval.submitted_by) || null,
      submitted_at: approval.submitted_at,
      review_note: approval.review_note,
      reviewed_by: approval.reviewed_by ? users.get(approval.reviewed_by) || null : null,
      reviewed_at: approval.reviewed_at,
    }));
  }
}
