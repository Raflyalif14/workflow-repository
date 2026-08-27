import { supabaseAdmin } from '../config/supabase';
import {
  ApproveMilestoneInitiationApprovalInput,
  RejectMilestoneInitiationApprovalInput,
  RequestMilestoneInitiationApprovalInput,
} from '../validators/milestone-initiation-approval.validator';
import { EmailService, MilestoneInitiatedEmailInput } from './email.service';

type Actor = { userId: string; role: string; fullName: string };
type InitiationApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
type ReviewDecision = 'APPROVED' | 'REJECTED';

type ProjectState = {
  sales_id?: string;
  name?: string;
  customer?: string;
  status: string;
  is_postponed: boolean;
};

type InitiationMilestoneState = {
  id: string;
  project_id: string;
  name: string;
  status: string;
  pic_id: string | null;
  pic?: {
    id: string;
    full_name: string;
    email?: string | null;
  } | null;
  start_date: string | null;
  duration_working_days: number | null;
  due_date: string | null;
  project: ProjectState | null;
};

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

type InitiationApprovalContext = {
  approval: InitiationApproval;
  milestone: InitiationMilestoneState;
};

const initiationApprovalSelect = 'id, milestone_id, requested_by, status, reviewed_by, request_note, review_note, requested_at, reviewed_at';

const normalizeRelatedOne = <T>(value: T | T[] | null): T | null => {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
};

const hasDeadline = (milestone: Pick<InitiationMilestoneState, 'start_date' | 'duration_working_days' | 'due_date'>) =>
  Boolean(milestone.start_date && milestone.duration_working_days && milestone.due_date);

export function buildInitiationApprovalRequest(
  milestone: InitiationMilestoneState,
  actor: Actor,
  hasPendingInitiationApproval: boolean,
  latestDeadlineApprovalStatus?: string | null,
  note?: string | null
) {
  if (actor.role !== 'SALES') throw new Error('Forbidden');
  if (!milestone.project) throw new Error('Project not found');
  if (milestone.project.sales_id !== actor.userId) throw new Error('Forbidden');
  if (milestone.project.status === 'POSTPONED' || milestone.project.is_postponed) throw new Error('Project is postponed.');
  if (milestone.status !== 'CREATED') throw new Error('Only a CREATED milestone can request initiation approval.');
  if (!milestone.pic_id) throw new Error('Milestone must have a PIC before initiation approval can be requested.');
  if (!hasDeadline(milestone)) throw new Error('Milestone must have a deadline before initiation approval can be requested.');
  if (latestDeadlineApprovalStatus !== 'APPROVED') throw new Error('Milestone deadline must be approved before initiation approval can be requested.');
  if (hasPendingInitiationApproval) throw new Error('This milestone already has a pending initiation approval.');

  return {
    milestone_id: milestone.id,
    requested_by: actor.userId,
    status: 'PENDING' as const,
    request_note: note?.trim() || null,
  };
}

export function buildInitiationApprovalReview(
  approvalStatus: InitiationApprovalStatus,
  milestone: InitiationMilestoneState,
  decision: ReviewDecision,
  actor: Actor,
  note?: string | null,
  latestDeadlineApprovalStatus?: string | null,
  reviewedAt = new Date().toISOString()
) {
  const trimmedNote = note?.trim() || null;

  if (actor.role !== 'HEAD_SA') throw new Error('Forbidden');
  if (approvalStatus !== 'PENDING') throw new Error('Milestone initiation approval is no longer pending.');
  if (!milestone.project) throw new Error('Project not found');
  if (milestone.project.status === 'POSTPONED' || milestone.project.is_postponed) throw new Error('Project is postponed.');
  if (milestone.status !== 'CREATED') throw new Error('Only a CREATED milestone can be reviewed for initiation.');
  if (decision === 'APPROVED') {
    if (!hasDeadline(milestone)) throw new Error('Milestone must have a deadline before initiation approval can be approved.');
    if (latestDeadlineApprovalStatus !== 'APPROVED') throw new Error('Milestone deadline must be approved before initiation approval can be approved.');
  }
  if (decision === 'REJECTED' && !trimmedNote) throw new Error('note is required');

  return {
    status: decision,
    reviewed_by: actor.userId,
    review_note: trimmedNote,
    reviewed_at: reviewedAt,
  };
}

export function buildMilestoneInitiationResult(
  milestone: InitiationMilestoneState,
  actor: Actor,
  latestDeadlineApprovalStatus?: string | null,
  latestInitiationApprovalStatus?: string | null
) {
  if (actor.role !== 'SALES') throw new Error('Forbidden');
  if (!milestone.project) throw new Error('Project not found');
  if (milestone.project.sales_id !== actor.userId) throw new Error('Only the project owner can initiate this milestone.');
  if (milestone.project.status === 'POSTPONED' || milestone.project.is_postponed) throw new Error('Project is postponed.');
  if (milestone.status !== 'CREATED') throw new Error('Only CREATED milestones can be initiated.');
  if (!milestone.pic_id) throw new Error('Milestone must have a PIC before it can be initiated.');
  if (!hasDeadline(milestone)) throw new Error('Milestone must have a deadline before it can be initiated.');
  if (latestDeadlineApprovalStatus !== 'APPROVED') throw new Error('Milestone must have an approved deadline before it can be initiated.');
  if (latestInitiationApprovalStatus !== 'APPROVED') throw new Error('Milestone initiation approval must be APPROVED before initiation.');

  return {
    milestone_id: milestone.id,
    name: milestone.name,
    status: 'IN_PROGRESS' as const,
    pic: {
      id: milestone.pic?.id || milestone.pic_id,
      full_name: milestone.pic?.full_name || null,
    },
    initiated_by: {
      id: actor.userId,
      full_name: actor.fullName,
    },
  };
}

export function buildMilestoneInitiatedActivityLog(
  actor: Actor,
  milestone: Pick<InitiationMilestoneState, 'project_id' | 'name'>
) {
  return {
    project_id: milestone.project_id,
    user_id: actor.userId,
    action: 'MILESTONE_INITIATED',
    description: `${actor.fullName} initiated milestone '${milestone.name}'`,
  };
}

export function buildMilestoneInitiationEmailInput(
  milestone: Pick<InitiationMilestoneState, 'name' | 'due_date' | 'pic' | 'project'>,
  actor: Actor
): MilestoneInitiatedEmailInput {
  if (!milestone.pic?.email) throw new Error('PIC email is required');

  return {
    recipientEmail: milestone.pic.email,
    recipientName: milestone.pic.full_name,
    milestoneName: milestone.name,
    projectName: milestone.project?.name || '-',
    customer: milestone.project?.customer || '-',
    deadline: milestone.due_date || '-',
    salesName: actor.fullName,
  };
}

export function buildMilestoneInitiationEmailActivityLog(
  actor: Actor,
  milestone: Pick<InitiationMilestoneState, 'project_id' | 'name' | 'pic'>,
  sent: boolean
) {
  return {
    project_id: milestone.project_id,
    user_id: actor.userId,
    action: sent ? 'MILESTONE_INITIATION_EMAIL_SENT' : 'MILESTONE_INITIATION_EMAIL_FAILED',
    description: sent
      ? `Initiation email sent to ${milestone.pic?.full_name || 'PIC'} for milestone '${milestone.name}'`
      : `Failed to send initiation email for milestone '${milestone.name}' to PIC ${milestone.pic?.full_name || 'PIC'}`,
  };
}

export function buildInitiationApprovalResponse(
  milestone: Pick<InitiationMilestoneState, 'id' | 'name' | 'status'>,
  approval: Pick<InitiationApproval, 'id' | 'status' | 'review_note' | 'reviewed_by'>,
  reviewer?: Pick<Actor, 'userId' | 'fullName'> | null
) {
  return {
    milestone_id: milestone.id,
    name: milestone.name,
    milestone_status: milestone.status,
    approval: {
      id: approval.id,
      status: approval.status,
      ...(approval.review_note !== undefined ? { review_note: approval.review_note } : {}),
      ...(reviewer && approval.reviewed_by
        ? {
            reviewed_by: {
              id: reviewer.userId,
              full_name: reviewer.fullName,
            },
          }
        : {}),
    },
  };
}

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

async function logInitiationApproval(
  actor: Actor,
  milestone: Pick<InitiationMilestoneState, 'project_id' | 'name'>,
  action: 'MILESTONE_INITIATION_APPROVAL_REQUESTED' | 'MILESTONE_INITIATION_APPROVED' | 'MILESTONE_INITIATION_REJECTED'
) {
  const verb =
    action === 'MILESTONE_INITIATION_APPROVAL_REQUESTED'
      ? 'requested initiation approval for'
      : action === 'MILESTONE_INITIATION_APPROVED'
        ? 'approved'
        : 'rejected';
  const suffix = action === 'MILESTONE_INITIATION_APPROVAL_REQUESTED' ? '' : ' for initiation';

  const { error } = await supabaseAdmin.from('activity_logs').insert({
    project_id: milestone.project_id,
    user_id: actor.userId,
    action,
    description: `${actor.fullName} ${verb} milestone '${milestone.name}'${suffix}`,
  });

  if (error) throw error;
}

async function logMilestoneInitiated(actor: Actor, milestone: Pick<InitiationMilestoneState, 'project_id' | 'name'>) {
  const { error } = await supabaseAdmin.from('activity_logs').insert(buildMilestoneInitiatedActivityLog(actor, milestone));
  if (error) throw error;
}

async function logMilestoneInitiationEmail(actor: Actor, milestone: Pick<InitiationMilestoneState, 'project_id' | 'name' | 'pic'>, sent: boolean) {
  const { error } = await supabaseAdmin.from('activity_logs').insert(buildMilestoneInitiationEmailActivityLog(actor, milestone, sent));
  if (error) {
    console.warn('Failed to record milestone initiation email activity log.');
  }
}

export async function sendMilestoneInitiationNotification(
  milestone: Pick<InitiationMilestoneState, 'project_id' | 'name' | 'due_date' | 'pic' | 'project'>,
  actor: Actor,
  sendEmail: (input: MilestoneInitiatedEmailInput) => Promise<unknown> = (input) => EmailService.sendMilestoneInitiatedEmail(input),
  recordEmailActivity: (sent: boolean) => Promise<void> = (sent) => logMilestoneInitiationEmail(actor, milestone, sent)
) {
  if (!milestone.pic?.email) {
    await recordEmailActivity(false);
    return { email_sent: false };
  }

  try {
    await sendEmail(buildMilestoneInitiationEmailInput(milestone, actor));
    await recordEmailActivity(true);
    return { email_sent: true };
  } catch {
    await recordEmailActivity(false);
    return { email_sent: false };
  }
}

export class MilestoneInitiationApprovalService {
  private static async getMilestoneContext(milestoneId: string): Promise<InitiationMilestoneState> {
    const { data, error } = await supabaseAdmin
      .from('project_milestones')
      .select('id, project_id, name, status, pic_id, start_date, duration_working_days, due_date, pic:users!project_milestones_pic_id_fkey(id,full_name,email), project:projects!project_milestones_project_id_fkey(id,sales_id,name,customer,status,is_postponed)')
      .eq('id', milestoneId)
      .single();

    if (error || !data) throw new Error('Milestone not found');

    return {
      ...data,
      pic: normalizeRelatedOne(data.pic),
      project: normalizeRelatedOne(data.project),
    } as InitiationMilestoneState;
  }

  private static async getLatestDeadlineApprovalStatus(milestoneId: string) {
    const { data, error } = await supabaseAdmin
      .from('milestone_deadline_approvals')
      .select('id, status')
      .eq('milestone_id', milestoneId)
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data?.status || null;
  }

  private static async getLatestInitiationApprovalStatus(milestoneId: string) {
    const { data, error } = await supabaseAdmin
      .from('milestone_initiation_approvals')
      .select('id, status')
      .eq('milestone_id', milestoneId)
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data?.status || null;
  }

  private static async getApprovalContext(approvalId: string): Promise<InitiationApprovalContext> {
    const { data: approval, error } = await supabaseAdmin
      .from('milestone_initiation_approvals')
      .select(initiationApprovalSelect)
      .eq('id', approvalId)
      .single();

    if (error || !approval) throw new Error('Milestone initiation approval not found');

    const milestone = await this.getMilestoneContext(approval.milestone_id);
    return {
      approval: approval as InitiationApproval,
      milestone,
    };
  }

  static async requestInitiationApproval(
    milestoneId: string,
    input: RequestMilestoneInitiationApprovalInput,
    actor: Actor
  ) {
    const milestone = await this.getMilestoneContext(milestoneId);

    const [pendingResult, latestDeadlineApprovalStatus] = await Promise.all([
      supabaseAdmin
        .from('milestone_initiation_approvals')
        .select('id')
        .eq('milestone_id', milestoneId)
        .eq('status', 'PENDING')
        .maybeSingle(),
      this.getLatestDeadlineApprovalStatus(milestoneId),
    ]);

    if (pendingResult.error) throw new Error(pendingResult.error.message);

    const request = buildInitiationApprovalRequest(
      milestone,
      actor,
      Boolean(pendingResult.data),
      latestDeadlineApprovalStatus,
      input.note
    );

    const { data: approval, error: insertError } = await supabaseAdmin
      .from('milestone_initiation_approvals')
      .insert(request)
      .select(initiationApprovalSelect)
      .single();

    if (insertError || !approval) throw new Error(insertError?.message || 'Failed to create milestone initiation approval.');

    await logInitiationApproval(actor, milestone, 'MILESTONE_INITIATION_APPROVAL_REQUESTED');

    return buildInitiationApprovalResponse(milestone, approval as InitiationApproval);
  }

  private static async review(approvalId: string, decision: ReviewDecision, note: string | undefined, actor: Actor) {
    const context = await this.getApprovalContext(approvalId);
    const latestDeadlineApprovalStatus =
      decision === 'APPROVED' ? await this.getLatestDeadlineApprovalStatus(context.approval.milestone_id) : null;
    const review = buildInitiationApprovalReview(
      context.approval.status,
      context.milestone,
      decision,
      actor,
      note,
      latestDeadlineApprovalStatus
    );

    const { data: updatedApproval, error: updateError } = await supabaseAdmin
      .from('milestone_initiation_approvals')
      .update(review)
      .eq('id', approvalId)
      .eq('status', 'PENDING')
      .select(initiationApprovalSelect)
      .maybeSingle();

    if (updateError) throw new Error(updateError.message);
    if (!updatedApproval) throw new Error('Milestone initiation approval is no longer pending.');

    await logInitiationApproval(
      actor,
      context.milestone,
      decision === 'APPROVED' ? 'MILESTONE_INITIATION_APPROVED' : 'MILESTONE_INITIATION_REJECTED'
    );

    return buildInitiationApprovalResponse(context.milestone, updatedApproval as InitiationApproval, actor);
  }

  static approveInitiationApproval(
    approvalId: string,
    input: ApproveMilestoneInitiationApprovalInput,
    actor: Actor
  ) {
    return this.review(approvalId, 'APPROVED', input.note, actor);
  }

  static rejectInitiationApproval(
    approvalId: string,
    input: RejectMilestoneInitiationApprovalInput,
    actor: Actor
  ) {
    return this.review(approvalId, 'REJECTED', input.note, actor);
  }

  static async initiateMilestone(milestoneId: string, actor: Actor) {
    const milestone = await this.getMilestoneContext(milestoneId);

    const [latestDeadlineApprovalStatus, latestInitiationApprovalStatus] = await Promise.all([
      this.getLatestDeadlineApprovalStatus(milestoneId),
      this.getLatestInitiationApprovalStatus(milestoneId),
    ]);

    buildMilestoneInitiationResult(
      milestone,
      actor,
      latestDeadlineApprovalStatus,
      latestInitiationApprovalStatus
    );

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('project_milestones')
      .update({
        status: 'IN_PROGRESS',
        updated_at: new Date().toISOString(),
      })
      .eq('id', milestoneId)
      .eq('status', 'CREATED')
      .select('id, project_id, name, status, pic_id, due_date, pic:users!project_milestones_pic_id_fkey(id,full_name,email), project:projects!project_milestones_project_id_fkey(id,name,customer)')
      .maybeSingle();

    if (updateError) throw new Error(updateError.message);
    if (!updated) throw new Error('Only CREATED milestones can be initiated.');

    await logMilestoneInitiated(actor, milestone);

    const updatedPic = normalizeRelatedOne(updated.pic);
    const updatedProject = normalizeRelatedOne(updated.project);
    const emailMilestone = {
      ...milestone,
      status: updated.status,
      due_date: updated.due_date || milestone.due_date,
      pic: updatedPic || milestone.pic || null,
      project: {
        ...(milestone.project || { status: 'ACTIVE', is_postponed: false }),
        name: updatedProject?.name || milestone.project?.name,
        customer: updatedProject?.customer || milestone.project?.customer,
      },
    };
    const notification = await sendMilestoneInitiationNotification(emailMilestone, actor);

    return {
      milestone_id: updated.id,
      name: updated.name,
      status: updated.status,
      pic: {
        id: updated.pic_id,
        full_name: updatedPic?.full_name || null,
      },
      initiated_by: {
        id: actor.userId,
        full_name: actor.fullName,
      },
      notification: {
        email_sent: notification.email_sent,
      },
    };
  }

  private static async getReadData(milestoneId: string) {
    await this.getMilestoneContext(milestoneId);

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
