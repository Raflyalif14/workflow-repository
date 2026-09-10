import { supabaseAdmin } from '../config/supabase';
import { ApproveDeadlineApprovalInput, RejectDeadlineApprovalInput } from '../validators/deadline-approval.validator';
import {
  notifyDeadlineChangeApproved,
  notifyDeadlineChangeRejected,
} from './deadline-notification.service';
import { logWorkflowActivityBestEffort } from './workflow-progression.service';

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
    status: string;
    start_date: string | null;
    duration_working_days: number | null;
    due_date: string | null;
    project: {
      id: string;
      name: string;
      sales_id: string | null;
      status: string;
      is_postponed: boolean;
    } | null;
  };
  history: {
    id: string;
    start_date: string;
    duration_working_days: number;
    due_date: string;
  };
};

type DeadlineApprovalReadProject = {
  id: string;
  sales_id: string | null;
  pic_id: string | null;
};

const normalizeRelatedOne = <T>(value: T | T[] | null): T | null => {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
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
  action: 'DEADLINE_APPROVED' | 'DEADLINE_REJECTED'
) {
  const verb = action === 'DEADLINE_APPROVED' ? 'approved' : 'rejected';
  await logWorkflowActivityBestEffort(
    actor,
    context.milestone.project_id,
    action,
    `${actor.fullName} ${verb} deadline for milestone '${context.milestone.name}' with due date ${context.history.due_date}`
  );
}

export function buildDeadlineApprovalResolution(
  currentStatus: ApprovalStatus,
  decision: ReviewDecision,
  reviewerId: string,
  history: Pick<DeadlineHistoryRow, 'start_date' | 'duration_working_days' | 'due_date'>,
  currentEffectiveDeadline: { start_date: string | null; duration_working_days: number | null; due_date: string | null },
  note?: string | null,
  reviewedAt = new Date().toISOString()
) {
  const approval = buildDeadlineApprovalReview(currentStatus, decision, reviewerId, note, reviewedAt);
  const effectiveDeadline = decision === 'APPROVED'
    ? {
        start_date: history.start_date,
        duration_working_days: history.duration_working_days,
        due_date: history.due_date,
      }
    : currentEffectiveDeadline;

  return { approval, effectiveDeadline };
}

export const isDeadlineCompletedEquivalent = (status: string): boolean =>
  status === 'COMPLETED' || status === 'APPROVED';

export function assertDeadlineApprovalReviewer(actor: Actor): void {
  if (actor.role !== 'HEAD_SA') throw new Error('Forbidden');
}

export function assertDeadlineApprovalMilestoneIsReviewable(milestoneStatus: string): void {
  if (isDeadlineCompletedEquivalent(milestoneStatus)) {
    throw new Error('Completed milestone deadline approval cannot be reviewed.');
  }
}

export function assertCanViewDeadlineApproval(project: DeadlineApprovalReadProject | null, actor: Actor): void {
  if (!project) throw new Error('Project not found');
  if (actor.role === 'SUPER_ADMIN' || actor.role === 'HEAD_SA') return;
  if (actor.role === 'SALES' && project.sales_id === actor.userId) return;
  if (actor.role === 'SA' && project.pic_id === actor.userId) return;
  throw new Error('Milestone not found');
}

export class DeadlineApprovalService {
  private static async ensureCanViewDeadlineApproval(milestoneId: string, actor: Actor) {
    const { data, error } = await supabaseAdmin
      .from('project_milestones')
      .select('id, project:projects!project_milestones_project_id_fkey(id,sales_id,pic_id)')
      .eq('id', milestoneId)
      .single();

    if (error || !data) throw new Error('Milestone not found');
    assertCanViewDeadlineApproval(normalizeRelatedOne(data.project), actor);
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
        .select('id, project_id, name, status, start_date, duration_working_days, due_date, project:projects!project_milestones_project_id_fkey(id,name,sales_id,status,is_postponed)')
        .eq('id', approval.milestone_id)
        .single(),
      supabaseAdmin
        .from('milestone_deadline_history')
        .select('id, start_date, duration_working_days, due_date')
        .eq('id', approval.deadline_history_id)
        .single(),
    ]);

    if (milestoneResult.error || !milestoneResult.data) throw new Error('Milestone not found');
    if (historyResult.error || !historyResult.data) throw new Error('Deadline history not found');

    return {
      approval: approval as DeadlineApproval,
      milestone: {
        ...milestoneResult.data,
        project: normalizeRelatedOne(milestoneResult.data.project),
      },
      history: historyResult.data,
    };
  }

  private static async review(approvalId: string, decision: ReviewDecision, note: string | undefined, actor: Actor) {
    assertDeadlineApprovalReviewer(actor);
    const context = await this.getApprovalContext(approvalId);
    assertDeadlineApprovalMilestoneIsReviewable(context.milestone.status);
    if (!context.milestone.project) throw new Error('Project not found');
    if (context.milestone.project.status === 'POSTPONED' || context.milestone.project.is_postponed) throw new Error('Project is postponed.');
    if (context.milestone.project.status !== 'ACTIVE') throw new Error('Deadline changes can only be reviewed for ACTIVE projects.');

    const resolution = buildDeadlineApprovalResolution(
      context.approval.status,
      decision,
      actor.userId,
      context.history,
      {
        start_date: context.milestone.start_date,
        duration_working_days: context.milestone.duration_working_days,
        due_date: context.milestone.due_date,
      },
      note
    );

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('milestone_deadline_approvals')
      .update(resolution.approval)
      .eq('id', approvalId)
      .eq('status', 'PENDING')
      .select('id, milestone_id, deadline_history_id, status, requested_by, reviewed_by, review_note, requested_at, reviewed_at')
      .maybeSingle();

    if (updateError) throw new Error(updateError.message);
    if (!updated) throw new Error('Deadline approval is no longer pending.');

    if (decision === 'APPROVED') {
      const { data: milestone, error: milestoneError } = await supabaseAdmin
        .from('project_milestones')
        .update({
          start_date: context.history.start_date,
          duration_working_days: context.history.duration_working_days,
          due_date: context.history.due_date,
          updated_at: new Date().toISOString(),
        })
        .eq('id', context.milestone.id)
        .not('status', 'in', '(COMPLETED,APPROVED)')
        .select('id')
        .maybeSingle();

      if (milestoneError || !milestone) {
        const { error: rollbackError } = await supabaseAdmin
          .from('milestone_deadline_approvals')
          .update({
            status: 'PENDING',
            reviewed_by: null,
            review_note: null,
            reviewed_at: null,
          })
          .eq('id', approvalId);

        if (rollbackError) {
          throw new Error(`${milestoneError?.message || 'Failed to apply approved deadline.'}; rollback failed: ${rollbackError.message}`);
        }

        throw new Error(milestoneError?.message || 'Failed to apply approved deadline.');
      }
    }

    await logDeadlineApprovalReview(
      actor,
      context,
      decision === 'APPROVED' ? 'DEADLINE_APPROVED' : 'DEADLINE_REJECTED'
    );

    const notificationContext = {
      projectId: context.milestone.project.id,
      projectName: context.milestone.project.name,
      salesId: context.milestone.project.sales_id,
      milestoneId: context.milestone.id,
      milestoneName: context.milestone.name,
    };
    if (decision === 'APPROVED') {
      await notifyDeadlineChangeApproved(notificationContext);
    } else {
      await notifyDeadlineChangeRejected(notificationContext);
    }

    return {
      ...updated,
      effective_deadline: resolution.effectiveDeadline,
    };
  }

  static approveDeadlineApproval(approvalId: string, input: ApproveDeadlineApprovalInput, actor: Actor) {
    return this.review(approvalId, 'APPROVED', input.note, actor);
  }

  static rejectDeadlineApproval(approvalId: string, input: RejectDeadlineApprovalInput, actor: Actor) {
    return this.review(approvalId, 'REJECTED', input.note, actor);
  }

  private static async getReadData(milestoneId: string, actor: Actor) {
    await this.ensureCanViewDeadlineApproval(milestoneId, actor);

    const { data: approvals, error: approvalError } = await supabaseAdmin
      .from('milestone_deadline_approvals')
      .select('id, milestone_id, deadline_history_id, status, requested_by, reviewed_by, review_note, requested_at, reviewed_at')
      .eq('milestone_id', milestoneId)
      .order('requested_at', { ascending: false });

    if (approvalError) throw new Error('Failed to retrieve deadline approval history.');
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

    if (historyResult.error || userResult.error) throw new Error('Failed to retrieve deadline approval history.');

    return {
      approvals: approvals as DeadlineApproval[],
      histories: (historyResult.data || []) as DeadlineHistoryRow[],
      users: (userResult.data || []) as UserSummaryRow[],
    };
  }

  static async getCurrentApproval(milestoneId: string, actor: Actor) {
    const data = await this.getReadData(milestoneId, actor);
    return buildDeadlineApprovalReadResult(true, data.approvals, data.histories, data.users, true);
  }

  static async getApprovalHistory(milestoneId: string, actor: Actor) {
    const data = await this.getReadData(milestoneId, actor);
    return buildDeadlineApprovalReadResult(true, data.approvals, data.histories, data.users, false);
  }
}
