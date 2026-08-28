import { supabaseAdmin } from '../config/supabase';
import { ApproveMilestoneApprovalInput, RejectMilestoneApprovalInput } from '../validators/milestone-approval.validator';

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
  project: {
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

export const isMilestoneCompletedLike = (status: string): boolean =>
  status === 'COMPLETED' || status === 'APPROVED';

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
  const { error } = await supabaseAdmin.from('activity_logs').insert({
    project_id: context.milestone.project_id,
    user_id: actor.userId,
    action,
    description: `${actor.fullName} ${verb} milestone '${context.milestone.name}'`,
  });

  if (error) throw error;
}

export function buildProjectCompletedActivityLog(actor: Actor, projectId: string, milestoneName: string) {
  return {
    project_id: projectId,
    user_id: actor.userId,
    action: 'PROJECT_COMPLETED',
    description: `${actor.fullName} completed project workflow after milestone '${milestoneName}' was approved`,
  };
}

async function logProjectCompleted(actor: Actor, projectId: string, milestoneName: string) {
  const { error } = await supabaseAdmin.from('activity_logs').insert(buildProjectCompletedActivityLog(actor, projectId, milestoneName));

  if (error) throw error;
}

export class MilestoneApprovalService {
  private static async ensureMilestoneExists(milestoneId: string) {
    const { data, error } = await supabaseAdmin
      .from('project_milestones')
      .select('id')
      .eq('id', milestoneId)
      .single();

    if (error || !data) throw new Error('Milestone not found');
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
      .select('id, project_id, name, step_order, status, project:projects!project_milestones_project_id_fkey(id,status,is_postponed)')
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

  private static async review(approvalId: string, decision: ReviewDecision, note: string | undefined, actor: Actor) {
    const context = await this.getApprovalContext(approvalId);
    const review = buildMilestoneApprovalReview(
      context.approval.status,
      context.milestone.status,
      context.milestone.project,
      decision,
      actor,
      note
    );

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

    let nextMilestone: NextMilestoneSummary | null = null;
    let projectCompleted = false;
    let shouldLogProjectCompleted = false;

    if (decision === 'APPROVED') {
      const [nextMilestoneResult, projectMilestonesResult] = await Promise.all([
        supabaseAdmin
          .from('project_milestones')
          .select('id, name, step_order, status, start_date, duration_working_days, due_date')
          .eq('project_id', context.milestone.project_id)
          .gt('step_order', context.milestone.step_order)
          .order('step_order', { ascending: true })
          .limit(1)
          .maybeSingle(),
        supabaseAdmin
          .from('project_milestones')
          .select('id, status')
          .eq('project_id', context.milestone.project_id),
      ]);

      if (nextMilestoneResult.error) throw new Error(nextMilestoneResult.error.message);
      if (projectMilestonesResult.error) throw new Error(projectMilestonesResult.error.message);

      nextMilestone = nextMilestoneResult.data || null;

      const milestonesAfterUpdate = (projectMilestonesResult.data || []).map((milestone) =>
        milestone.id === updatedMilestone.id
          ? { ...milestone, status: updatedMilestone.status }
          : milestone
      );

      if (!nextMilestone && shouldCompleteProject(context.milestone.project?.status || '', milestonesAfterUpdate)) {
        const { data: updatedProject, error: projectError } = await supabaseAdmin
          .from('projects')
          .update({
            status: 'COMPLETED',
            updated_at: new Date().toISOString(),
          })
          .eq('id', context.milestone.project_id)
          .eq('status', 'ACTIVE')
          .select('id, status')
          .maybeSingle();

        if (projectError) throw new Error(projectError.message);

        projectCompleted = Boolean(updatedProject) || context.milestone.project?.status === 'COMPLETED';
        shouldLogProjectCompleted = Boolean(updatedProject);
      }
    }

    await logMilestoneApprovalReview(
      actor,
      context,
      decision === 'APPROVED' ? 'MILESTONE_APPROVED' : 'MILESTONE_REJECTED'
    );

    if (shouldLogProjectCompleted) {
      await logProjectCompleted(actor, context.milestone.project_id, context.milestone.name);
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
      next_milestone: nextMilestone
        ? {
            id: nextMilestone.id,
            name: nextMilestone.name,
            step_order: nextMilestone.step_order,
            status: nextMilestone.status,
          }
        : null,
      project_completed: projectCompleted,
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

  static async getApprovalHistory(milestoneId: string) {
    await this.ensureMilestoneExists(milestoneId);

    const { data: approvals, error } = await supabaseAdmin
      .from('milestone_approvals')
      .select('id, milestone_id, submitted_by, submission_note, status, reviewed_by, review_note, submitted_at, reviewed_at')
      .eq('milestone_id', milestoneId)
      .order('submitted_at', { ascending: false });

    if (error) throw new Error(error.message);
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

      if (userError) throw new Error(userError.message);
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
