import { supabaseAdmin } from '../config/supabase';
import { ApproveDeadlineApprovalInput, RejectDeadlineApprovalInput } from '../validators/deadline-approval.validator';

type Actor = { userId: string; role: string; fullName: string };
type ReviewDecision = 'APPROVED' | 'REJECTED';
type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED';

type DeadlineApproval = {
  id: string;
  milestone_id: string;
  deadline_history_id: string;
  status: ApprovalStatus;
  requested_by: string;
  reviewed_by: string | null;
  review_note: string | null;
  requested_at: string;
  reviewed_at: string | null;
};

type DeadlineHistoryRow = {
  id: string;
  start_date: string;
  duration_working_days: number;
  due_date: string;
  change_reason: string | null;
};

type UserSummaryRow = {
  id: string;
  full_name: string;
  email: string;
};

type DeadlineApprovalContext = {
  approval: DeadlineApproval;
  milestone: {
    id: string;
    project_id: string;
    name: string;
  };
  history: {
    id: string;
    due_date: string;
  };
};

export function buildDeadlineApprovalReview(
  currentStatus: ApprovalStatus,
  decision: ReviewDecision,
  reviewerId: string,
  note?: string | null,
  reviewedAt = new Date().toISOString()
) {
  const trimmedNote = note?.trim() || null;

  if (currentStatus !== 'PENDING') {
    throw new Error('Deadline approval is no longer pending.');
  }

  if (decision === 'REJECTED' && !trimmedNote) {
    throw new Error('note is required');
  }

  return {
    status: decision,
    reviewed_by: reviewerId,
    review_note: trimmedNote,
    reviewed_at: reviewedAt,
  };
}

export function buildDeadlineApprovalReadItem(
  approval: DeadlineApproval,
  deadline: DeadlineHistoryRow | null,
  users: Map<string, UserSummaryRow>
) {
  return {
    id: approval.id,
    milestone_id: approval.milestone_id,
    deadline_history_id: approval.deadline_history_id,
    status: approval.status,
    requested_by: users.get(approval.requested_by) || null,
    reviewed_by: approval.reviewed_by ? users.get(approval.reviewed_by) || null : null,
    review_note: approval.review_note,
    requested_at: approval.requested_at,
    reviewed_at: approval.reviewed_at,
    deadline: deadline
      ? {
          start_date: deadline.start_date,
          duration_working_days: deadline.duration_working_days,
          due_date: deadline.due_date,
          change_reason: deadline.change_reason,
        }
      : null,
  };
}

export function buildDeadlineApprovalReadResult(
  milestoneFound: boolean,
  approvals: DeadlineApproval[],
  deadlineHistories: DeadlineHistoryRow[],
  users: UserSummaryRow[],
  currentOnly: boolean
) {
  if (!milestoneFound) throw new Error('Milestone not found');

  const userMap = new Map(users.map((user) => [user.id, user]));
  const historyMap = new Map(deadlineHistories.map((history) => [history.id, history]));
  const sortedApprovals = [...approvals].sort((a, b) => b.requested_at.localeCompare(a.requested_at));
  const mappedApprovals = sortedApprovals.map((approval) =>
    buildDeadlineApprovalReadItem(approval, historyMap.get(approval.deadline_history_id) || null, userMap)
  );

  return currentOnly ? mappedApprovals[0] || null : mappedApprovals;
}

async function logDeadlineApprovalReview(
  actor: Actor,
  context: DeadlineApprovalContext,
  action: 'DEADLINE_APPROVAL_APPROVED' | 'DEADLINE_APPROVAL_REJECTED'
) {
  const verb = action === 'DEADLINE_APPROVAL_APPROVED' ? 'approved' : 'rejected';
  const { error } = await supabaseAdmin.from('activity_logs').insert({
    project_id: context.milestone.project_id,
    user_id: actor.userId,
    action,
    description: `${actor.fullName} ${verb} deadline for milestone '${context.milestone.name}' with due date ${context.history.due_date}`,
  });

  if (error) {
    throw error;
  }
}

export class DeadlineApprovalService {
  private static async ensureMilestoneExists(milestoneId: string) {
    const { data, error } = await supabaseAdmin
      .from('project_milestones')
      .select('id')
      .eq('id', milestoneId)
      .single();

    if (error || !data) throw new Error('Milestone not found');
  }

  private static async getApprovalContext(approvalId: string): Promise<DeadlineApprovalContext> {
    const { data: approval, error: approvalError } = await supabaseAdmin
      .from('milestone_deadline_approvals')
      .select('id, milestone_id, deadline_history_id, status, requested_by, reviewed_by, review_note, requested_at, reviewed_at')
      .eq('id', approvalId)
      .single();

    if (approvalError || !approval) throw new Error('Deadline approval not found');

    const [milestoneResult, historyResult] = await Promise.all([
      supabaseAdmin
        .from('project_milestones')
        .select('id, project_id, name')
        .eq('id', approval.milestone_id)
        .single(),
      supabaseAdmin
        .from('milestone_deadline_history')
        .select('id, due_date')
        .eq('id', approval.deadline_history_id)
        .single(),
    ]);

    if (milestoneResult.error || !milestoneResult.data) throw new Error('Milestone not found');
    if (historyResult.error || !historyResult.data) throw new Error('Deadline history not found');

    return {
      approval: approval as DeadlineApproval,
      milestone: milestoneResult.data,
      history: historyResult.data,
    };
  }

  private static async review(approvalId: string, decision: ReviewDecision, note: string | undefined, actor: Actor) {
    const context = await this.getApprovalContext(approvalId);
    const review = buildDeadlineApprovalReview(context.approval.status, decision, actor.userId, note);

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('milestone_deadline_approvals')
      .update(review)
      .eq('id', approvalId)
      .eq('status', 'PENDING')
      .select('id, milestone_id, deadline_history_id, status, requested_by, reviewed_by, review_note, requested_at, reviewed_at')
      .maybeSingle();

    if (updateError) throw new Error(updateError.message);
    if (!updated) throw new Error('Deadline approval is no longer pending.');

    await logDeadlineApprovalReview(
      actor,
      context,
      decision === 'APPROVED' ? 'DEADLINE_APPROVAL_APPROVED' : 'DEADLINE_APPROVAL_REJECTED'
    );

    return updated;
  }

  static approveDeadlineApproval(approvalId: string, input: ApproveDeadlineApprovalInput, actor: Actor) {
    return this.review(approvalId, 'APPROVED', input.note, actor);
  }

  static rejectDeadlineApproval(approvalId: string, input: RejectDeadlineApprovalInput, actor: Actor) {
    return this.review(approvalId, 'REJECTED', input.note, actor);
  }

  private static async getReadData(milestoneId: string) {
    await this.ensureMilestoneExists(milestoneId);

    const { data: approvals, error: approvalError } = await supabaseAdmin
      .from('milestone_deadline_approvals')
      .select('id, milestone_id, deadline_history_id, status, requested_by, reviewed_by, review_note, requested_at, reviewed_at')
      .eq('milestone_id', milestoneId)
      .order('requested_at', { ascending: false });

    if (approvalError) throw new Error(approvalError.message);
    if (!approvals?.length) return { approvals: [], histories: [], users: [] };

    const historyIds = [...new Set(approvals.map((approval) => approval.deadline_history_id).filter(Boolean))];
    const userIds = [
      ...new Set(
        approvals
          .flatMap((approval) => [approval.requested_by, approval.reviewed_by])
          .filter((userId): userId is string => Boolean(userId))
      ),
    ];

    const [historyResult, userResult] = await Promise.all([
      historyIds.length
        ? supabaseAdmin
            .from('milestone_deadline_history')
            .select('id, start_date, duration_working_days, due_date, change_reason')
            .in('id', historyIds)
        : Promise.resolve({ data: [], error: null }),
      userIds.length
        ? supabaseAdmin
            .from('users')
            .select('id, full_name, email')
            .in('id', userIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (historyResult.error) throw new Error(historyResult.error.message);
    if (userResult.error) throw new Error(userResult.error.message);

    return {
      approvals: approvals as DeadlineApproval[],
      histories: (historyResult.data || []) as DeadlineHistoryRow[],
      users: (userResult.data || []) as UserSummaryRow[],
    };
  }

  static async getCurrentApproval(milestoneId: string) {
    const data = await this.getReadData(milestoneId);
    return buildDeadlineApprovalReadResult(true, data.approvals, data.histories, data.users, true);
  }

  static async getApprovalHistory(milestoneId: string) {
    const data = await this.getReadData(milestoneId);
    return buildDeadlineApprovalReadResult(true, data.approvals, data.histories, data.users, false);
  }
}
