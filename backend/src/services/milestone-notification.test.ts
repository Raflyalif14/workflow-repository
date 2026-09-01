import { readFileSync } from 'fs';
import { join } from 'path';
import { supabaseAdmin } from '../config/supabase';
import { CreateNotificationInput, NotificationService } from './notification.service';
import {
  notifyMilestoneApproved,
  notifyMilestoneRejected,
  notifyMilestoneSubmitted,
} from './milestone-notification.service';

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

const context = {
  projectId: 'project-1',
  projectName: 'Enterprise Assessment',
  milestoneId: 'milestone-1',
  milestoneName: 'Requirement Gathering',
  picId: 'pic-from-milestone',
};

const originalFrom = supabaseAdmin.from;
const originalCreateNotification = NotificationService.createNotification;
const originalConsoleError = console.error;

async function run(): Promise<void> {
  try {
    const requestedNotifications: CreateNotificationInput[] = [];
    const submittedRecipientFilters: Array<[string, unknown]> = [];

    (NotificationService as any).createNotification = async (input: CreateNotificationInput) => {
      requestedNotifications.push(input);
      return {};
    };
    (supabaseAdmin as any).from = (table: string) => {
      assert(table === 'users', 'Test 1: submitted milestone recipients must be read from users');
      const query: any = {
        select: () => query,
        eq: (field: string, value: unknown) => {
          submittedRecipientFilters.push([field, value]);
          return query;
        },
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve({ data: [{ id: 'headsa-1' }, { id: 'headsa-2' }], error: null }).then(resolve, reject),
      };
      return query;
    };
    await notifyMilestoneSubmitted(context);
    assert(requestedNotifications.length === 2, 'Test 1: submit must request one notification per active HEAD_SA');
    assert(requestedNotifications.every((item) => item.type === 'MILESTONE_SUBMITTED' && item.actionUrl === '/approvals'), 'Test 1: submit notification must target approvals');
    assert(submittedRecipientFilters.some(([field, value]) => field === 'role' && value === 'HEAD_SA'), 'Test 1: submit must resolve HEAD_SA recipients');
    assert(submittedRecipientFilters.some(([field, value]) => field === 'is_active' && value === true), 'Test 1: submit must exclude inactive users');
    const milestoneSource = readFileSync(join(__dirname, 'milestone.service.ts'), 'utf8');
    assert(milestoneSource.includes('await notifyMilestoneSubmitted({'), 'Test 1: submit workflow must trigger HEAD_SA notifications');
    console.log('Test 1 - SA submit requests notifications for active HEAD_SA users: passed');

    requestedNotifications.length = 0;
    await notifyMilestoneApproved(context);
    assert(requestedNotifications.length === 1, 'Test 2: approve must request one PIC notification');
    assert(requestedNotifications[0].userId === 'pic-from-milestone', 'Test 2: approve recipient must be the assigned milestone PIC');
    assert(requestedNotifications[0].type === 'MILESTONE_APPROVED' && requestedNotifications[0].actionUrl === '/projects/project-1', 'Test 2: approve notification content must target the project');
    const approvalSource = readFileSync(join(__dirname, 'milestone-approval.service.ts'), 'utf8');
    assert(approvalSource.includes('await notifyMilestoneApproved(notificationContext);'), 'Test 2: approve workflow must trigger PIC notification');
    console.log('Test 2 - HEAD_SA approval requests a notification for the assigned PIC: passed');

    requestedNotifications.length = 0;
    await notifyMilestoneRejected(context);
    assert(requestedNotifications.length === 1, 'Test 3: reject must request one PIC notification');
    assert(requestedNotifications[0].userId === 'pic-from-milestone', 'Test 3: reject recipient must be the assigned milestone PIC');
    assert(requestedNotifications[0].type === 'MILESTONE_REJECTED' && requestedNotifications[0].message.includes('requires revision'), 'Test 3: reject notification must request revision');
    assert(approvalSource.includes('await notifyMilestoneRejected(notificationContext);'), 'Test 3: reject workflow must trigger PIC notification');
    console.log('Test 3 - HEAD_SA rejection requests a notification for the assigned PIC: passed');

    let notificationFailureLogged = false;
    (NotificationService as any).createNotification = async () => {
      throw new Error('notification insert failed');
    };
    console.error = (...args: unknown[]) => {
      notificationFailureLogged = String(args[0]).includes('[NotificationDispatch]');
    };
    await notifyMilestoneApproved(context);
    assert(notificationFailureLogged, 'Test 4: notification failure must be logged server-side');
    console.log('Test 4 - Notification failure does not fail the milestone notification flow: passed');

    requestedNotifications.length = 0;
    (NotificationService as any).createNotification = async (input: CreateNotificationInput) => {
      requestedNotifications.push(input);
      return {};
    };
    await notifyMilestoneApproved({ ...context, picId: 'trusted-pic-id', frontend_recipient_id: 'untrusted-user-id' } as typeof context);
    assert(requestedNotifications[0].userId === 'trusted-pic-id', 'Test 5: recipient must come from trusted milestone.pic_id, not frontend data');
    console.log('Test 5 - Milestone recipient is derived from trusted milestone state: passed');

    requestedNotifications.length = 0;
    await notifyMilestoneApproved({ ...context, picId: null });
    await notifyMilestoneRejected({ ...context, picId: null });
    assert(requestedNotifications.length === 0, 'Test 6: approve/reject must safely skip notifications without a PIC');
    console.log('Test 6 - Missing PIC safely skips approval and rejection notifications: passed');
  } finally {
    (supabaseAdmin as any).from = originalFrom;
    (NotificationService as any).createNotification = originalCreateNotification;
    console.error = originalConsoleError;
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
