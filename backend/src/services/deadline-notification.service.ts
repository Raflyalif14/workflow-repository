import { supabaseAdmin } from '../config/supabase';
import { CreateNotificationInput, NotificationService } from './notification.service';
import { runNotificationBestEffort } from './notification-dispatch.service';

export type DeadlineNotificationContext = {
  projectId: string;
  projectName: string;
  salesId: string | null;
  milestoneId: string;
  milestoneName: string;
};

type ActiveHeadSaRow = { id: string };

const projectActionUrl = (projectId: string) => `/projects/${projectId}`;

export function buildDeadlineChangeRequestedNotification(
  userId: string,
  context: DeadlineNotificationContext
): CreateNotificationInput {
  return {
    userId,
    type: 'DEADLINE_CHANGE_REQUESTED',
    title: 'Deadline Change Requested',
    message: `Deadline change for milestone '${context.milestoneName}' in project '${context.projectName}' is waiting for review.`,
    projectId: context.projectId,
    milestoneId: context.milestoneId,
    actionUrl: '/approvals',
  };
}

function buildDeadlineChangeDecisionNotification(
  context: DeadlineNotificationContext,
  decision: 'APPROVED' | 'REJECTED'
): CreateNotificationInput | null {
  if (!context.salesId) return null;

  return decision === 'APPROVED'
    ? {
        userId: context.salesId,
        type: 'DEADLINE_CHANGE_APPROVED',
        title: 'Deadline Change Approved',
        message: `Requested deadline change for milestone '${context.milestoneName}' in project '${context.projectName}' was approved.`,
        projectId: context.projectId,
        milestoneId: context.milestoneId,
        actionUrl: projectActionUrl(context.projectId),
      }
    : {
        userId: context.salesId,
        type: 'DEADLINE_CHANGE_REJECTED',
        title: 'Deadline Change Rejected',
        message: `Requested deadline change for milestone '${context.milestoneName}' in project '${context.projectName}' was rejected.`,
        projectId: context.projectId,
        milestoneId: context.milestoneId,
        actionUrl: projectActionUrl(context.projectId),
      };
}

export async function notifyDeadlineChangeRequested(context: DeadlineNotificationContext): Promise<void> {
  await runNotificationBestEffort('deadline change request notifications', async () => {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('role', 'HEAD_SA')
      .eq('is_active', true);

    if (error) throw error;

    await Promise.all(
      ((data || []) as ActiveHeadSaRow[]).map((user) =>
        NotificationService.createNotification(buildDeadlineChangeRequestedNotification(user.id, context))
      )
    );
  });
}

async function notifyDeadlineChangeDecision(
  context: DeadlineNotificationContext,
  decision: 'APPROVED' | 'REJECTED'
): Promise<void> {
  const notification = buildDeadlineChangeDecisionNotification(context, decision);
  if (!notification) return;

  await runNotificationBestEffort(`deadline change ${decision.toLowerCase()} notification`, () =>
    NotificationService.createNotification(notification)
  );
}

export async function notifyDeadlineChangeApproved(context: DeadlineNotificationContext): Promise<void> {
  await notifyDeadlineChangeDecision(context, 'APPROVED');
}

export async function notifyDeadlineChangeRejected(context: DeadlineNotificationContext): Promise<void> {
  await notifyDeadlineChangeDecision(context, 'REJECTED');
}
