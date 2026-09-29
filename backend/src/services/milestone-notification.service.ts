import { CreateNotificationInput, NotificationService } from './notification.service';
import { runNotificationBestEffort } from './notification-dispatch.service';

export type SalesMilestoneStartedNotificationContext = {
  projectId: string;
  projectName: string;
  milestoneId: string;
  milestoneName: string;
  salesOwnerId: string | null;
};

const milestoneActionUrl = (projectId: string, milestoneId: string) =>
  `/projects/${projectId}#project-milestone-${milestoneId}`;

export function buildSalesMilestoneStartedNotification(
  context: SalesMilestoneStartedNotificationContext
): CreateNotificationInput | null {
  if (!context.salesOwnerId) return null;

  return {
    userId: context.salesOwnerId,
    type: 'MILESTONE_STARTED',
    title: 'Sales Milestone Ready',
    message: `Milestone '${context.milestoneName}' for project '${context.projectName}' is ready for your action.`,
    projectId: context.projectId,
    projectName: context.projectName,
    milestoneId: context.milestoneId,
    milestoneName: context.milestoneName,
    actionUrl: milestoneActionUrl(context.projectId, context.milestoneId),
  };
}

export async function notifySalesMilestoneStarted(
  context: SalesMilestoneStartedNotificationContext
): Promise<void> {
  const notification = buildSalesMilestoneStartedNotification(context);
  if (!notification) return;

  await runNotificationBestEffort('Sales milestone start notification', () =>
    NotificationService.createNotification(notification)
  );
}
