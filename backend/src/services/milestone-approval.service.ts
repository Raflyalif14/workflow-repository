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

const normalizeRelatedOne = <T>(value: T | T[] | null): T | null => {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
};

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
    milestone_status: decision,
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
      .select('id, project_id, name, status, project:projects!project_milestones_project_id_fkey(id,status,is_postponed)')
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
        status: review.milestone_status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', context.milestone.id)
      .eq('status', 'SUBMITTED')
      .select('id, name, status')
      .maybeSingle();

    if (milestoneError || !updatedMilestone) {
      await supabaseAdmin
        .from('milestone_approvals')
        .update({
          status: 'PENDING',
          reviewed_by: null,
          review_note: null,
          reviewed_at: null,
        })
        .eq('id', approvalId);
      throw new Error(milestoneError?.message || 'Only a SUBMITTED milestone can be reviewed.');
    }

    await logMilestoneApprovalReview(
      actor,
      context,
      decision === 'APPROVED' ? 'MILESTONE_APPROVED' : 'MILESTONE_REJECTED'
    );

    return {
      milestone_id: updatedMilestone.id,
      name: updatedMilestone.name,
      status: updatedMilestone.status,
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
