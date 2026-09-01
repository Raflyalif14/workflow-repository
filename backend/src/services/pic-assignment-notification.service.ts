import { CreateNotificationInput, NotificationService } from './notification.service';
import { runNotificationBestEffort } from './notification-dispatch.service';

export type PicAssignmentNotificationContext = {
  projectId: string;
  projectName: string;
  previousPicId: string | null;
  currentPicId: string | null;
  milestoneId?: string | null;
  milestoneName?: string | null;
};

const projectActionUrl = (projectId: string) => `/projects/${projectId}`;

export function buildPicAssignmentNotification(
  context: PicAssignmentNotificationContext
): CreateNotificationInput | null {
  if (!context.currentPicId || context.currentPicId === context.previousPicId) return null;

  const isReassignment = Boolean(context.previousPicId);
  const milestoneContext = context.milestoneName ? ` for milestone '${context.milestoneName}'` : '';

  return {
    userId: context.currentPicId,
    type: isReassignment ? 'PIC_REASSIGNED' : 'PIC_ASSIGNED',
    title: isReassignment ? 'PIC Reassignment' : 'PIC Assignment',
    message: isReassignment
      ? `You are now assigned as PIC${milestoneContext} for project '${context.projectName}'.`
      : `You have been assigned as PIC${milestoneContext} for project '${context.projectName}'.`,
    projectId: context.projectId,
    milestoneId: context.milestoneId || null,
    actionUrl: projectActionUrl(context.projectId),
  };
}

export async function notifyPicAssignment(context: PicAssignmentNotificationContext): Promise<void> {
  const notification = buildPicAssignmentNotification(context);
  if (!notification) return;

  await runNotificationBestEffort('PIC assignment notification', () =>
    NotificationService.createNotification(notification)
  );
}
