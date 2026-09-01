import { supabaseAdmin } from '../config/supabase';
import { CreateNotificationInput, NotificationService } from './notification.service';
import { runNotificationBestEffort } from './notification-dispatch.service';

export type MilestoneNotificationContext = {
  projectId: string;
  projectName: string;
  milestoneId: string;
  milestoneName: string;
  picId: string | null;
};

type ActiveHeadSaRow = { id: string };

const projectActionUrl = (projectId: string) => `/projects/${projectId}`;

export function buildMilestoneSubmittedNotification(
  userId: string,
  context: MilestoneNotificationContext
): CreateNotificationInput {
  return {
    userId,
    type: 'MILESTONE_SUBMITTED',
    title: 'Milestone Submitted',
    message: `Milestone '${context.milestoneName}' for project '${context.projectName}' is waiting for review.`,
    projectId: context.projectId,
    milestoneId: context.milestoneId,
    actionUrl: '/approvals',
  };
}

function buildMilestoneDecisionNotification(
  context: MilestoneNotificationContext,
  decision: 'APPROVED' | 'REJECTED'
): CreateNotificationInput | null {
  if (!context.picId) return null;

  return decision === 'APPROVED'
    ? {
        userId: context.picId,
        type: 'MILESTONE_APPROVED',
        title: 'Milestone Approved',
        message: `Milestone '${context.milestoneName}' for project '${context.projectName}' has been approved.`,
        projectId: context.projectId,
        milestoneId: context.milestoneId,
        actionUrl: projectActionUrl(context.projectId),
      }
    : {
        userId: context.picId,
        type: 'MILESTONE_REJECTED',
        title: 'Milestone Rejected',
        message: `Milestone '${context.milestoneName}' for project '${context.projectName}' was rejected and requires revision.`,
        projectId: context.projectId,
        milestoneId: context.milestoneId,
        actionUrl: projectActionUrl(context.projectId),
      };
}

export async function notifyMilestoneSubmitted(context: MilestoneNotificationContext): Promise<void> {
  await runNotificationBestEffort('milestone submission notifications', async () => {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('role', 'HEAD_SA')
      .eq('is_active', true);

    if (error) throw error;

    await Promise.all(
      ((data || []) as ActiveHeadSaRow[]).map((user) =>
        NotificationService.createNotification(buildMilestoneSubmittedNotification(user.id, context))
      )
    );
  });
}

async function notifyMilestoneDecision(
  context: MilestoneNotificationContext,
  decision: 'APPROVED' | 'REJECTED'
): Promise<void> {
  const notification = buildMilestoneDecisionNotification(context, decision);
  if (!notification) return;

  await runNotificationBestEffort(`milestone ${decision.toLowerCase()} notification`, () =>
    NotificationService.createNotification(notification)
  );
}

export async function notifyMilestoneApproved(context: MilestoneNotificationContext): Promise<void> {
  await notifyMilestoneDecision(context, 'APPROVED');
}

export async function notifyMilestoneRejected(context: MilestoneNotificationContext): Promise<void> {
  await notifyMilestoneDecision(context, 'REJECTED');
}
