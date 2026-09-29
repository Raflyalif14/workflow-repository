import { NotificationService } from './notification.service';
import { notifySalesMilestoneStarted } from './milestone-notification.service';

const original = NotificationService.createNotification;
async function run() {
  const notifications: unknown[] = [];
  try {
    (NotificationService as any).createNotification = async (input: unknown) => { notifications.push(input); return {}; };
    await notifySalesMilestoneStarted({ projectId: 'project-1', projectName: 'Project', milestoneId: 'sales-1', milestoneName: 'Tender Process', salesOwnerId: 'owner-1' });
    const item = notifications[0] as { userId: string; actionUrl: string };
    if (notifications.length !== 1 || item.userId !== 'owner-1' || item.actionUrl !== '/projects/project-1#project-milestone-sales-1') {
      throw new Error('Sales milestone notification must target its owner and milestone.');
    }
    await notifySalesMilestoneStarted({ projectId: 'project-1', projectName: 'Project', milestoneId: 'sales-1', milestoneName: 'Tender Process', salesOwnerId: null });
    if (notifications.length !== 1) throw new Error('Missing Sales owner must not enqueue a notification.');
  } finally {
    (NotificationService as any).createNotification = original;
  }
}
void run();
