import { supabaseAdmin } from '../config/supabase';

type InitiationApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

type InitiationApproval = {
  id: string;
  milestone_id: string;
  requested_by: string;
  status: InitiationApprovalStatus;
  reviewed_by: string | null;
  request_note: string | null;
  review_note: string | null;
  requested_at: string;
  reviewed_at: string | null;
};

type UserSummary = {
  id: string;
  full_name: string;
  email: string;
};

const initiationApprovalSelect = 'id, milestone_id, requested_by, status, reviewed_by, request_note, review_note, requested_at, reviewed_at';

export function buildInitiationApprovalReadResult(
  milestoneFound: boolean,
  approvals: InitiationApproval[],
  users: UserSummary[],
  currentOnly: boolean
) {
  if (!milestoneFound) throw new Error('Milestone not found');

  const userMap = new Map(users.map((user) => [user.id, user]));
  const sortedApprovals = [...approvals].sort((a, b) => b.requested_at.localeCompare(a.requested_at));
  const mappedApprovals = sortedApprovals.map((approval) => ({
    id: approval.id,
    milestone_id: approval.milestone_id,
    status: approval.status,
    requested_by: userMap.get(approval.requested_by) || null,
    reviewed_by: approval.reviewed_by ? userMap.get(approval.reviewed_by) || null : null,
    request_note: approval.request_note,
    review_note: approval.review_note,
    requested_at: approval.requested_at,
    reviewed_at: approval.reviewed_at,
  }));

  return currentOnly ? mappedApprovals[0] || null : mappedApprovals;
}

export class MilestoneInitiationApprovalService {
  private static async assertMilestoneExists(milestoneId: string): Promise<void> {
    const { data, error } = await supabaseAdmin
      .from('project_milestones')
      .select('id')
      .eq('id', milestoneId)
      .maybeSingle();

    if (error || !data) throw new Error('Milestone not found');
  }

  private static async getReadData(milestoneId: string) {
    await this.assertMilestoneExists(milestoneId);

    const { data: approvals, error } = await supabaseAdmin
      .from('milestone_initiation_approvals')
      .select(initiationApprovalSelect)
      .eq('milestone_id', milestoneId)
      .order('requested_at', { ascending: false });

    if (error) throw new Error(error.message);
    if (!approvals?.length) return { approvals: [], users: [] };

    const userIds = [
      ...new Set(
        approvals
          .flatMap((approval) => [approval.requested_by, approval.reviewed_by])
          .filter((userId): userId is string => Boolean(userId))
      ),
    ];

    const { data: users, error: userError } = userIds.length
      ? await supabaseAdmin.from('users').select('id, full_name, email').in('id', userIds)
      : { data: [], error: null };

    if (userError) throw new Error(userError.message);

    return {
      approvals: approvals as InitiationApproval[],
      users: (users || []) as UserSummary[],
    };
  }

  static async getCurrentApproval(milestoneId: string) {
    const data = await this.getReadData(milestoneId);
    return buildInitiationApprovalReadResult(true, data.approvals, data.users, true);
  }

  static async getApprovalHistory(milestoneId: string) {
    const data = await this.getReadData(milestoneId);
    return buildInitiationApprovalReadResult(true, data.approvals, data.users, false);
  }
}
