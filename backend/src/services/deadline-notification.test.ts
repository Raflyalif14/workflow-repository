import { readFileSync } from 'fs';
import { join } from 'path';
import { supabaseAdmin } from '../config/supabase';
import { CreateNotificationInput, NotificationService } from './notification.service';
import {
  notifyDeadlineChangeApproved,
  notifyDeadlineChangeRejected,
  notifyDeadlineChangeRequested,
} from './deadline-notification.service';

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

const context = {
  projectId: 'project-1',
  projectName: 'Enterprise Assessment',
  salesId: 'sales-from-project',
  milestoneId: 'milestone-1',
  milestoneName: 'Customer Assessment',
};

const originalFrom = supabaseAdmin.from;
const originalCreateNotification = NotificationService.createNotification;
const originalConsoleError = console.error;

async function run(): Promise<void> {
  try {
    const requestedNotifications: CreateNotificationInput[] = [];
    const requestRecipientFilters: Array<[string, unknown]> = [];

    (NotificationService as any).createNotification = async (input: CreateNotificationInput) => {
      requestedNotifications.push(input);
      return {};
    };
    (supabaseAdmin as any).from = (table: string) => {
      assert(table === 'users', 'Test 1: deadline request recipients must be read from users');
      const query: any = {
        select: () => query,
        eq: (field: string, value: unknown) => {
          requestRecipientFilters.push([field, value]);
          return query;
        },
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve({ data: [{ id: 'headsa-1' }, { id: 'headsa-2' }], error: null }).then(resolve, reject),
      };
      return query;
    };
    await notifyDeadlineChangeRequested(context);
    assert(requestedNotifications.length === 2, 'Test 1: request must notify every active HEAD_SA');
    assert(
      requestedNotifications.every((item) =>
        item.type === 'DEADLINE_CHANGE_REQUESTED' &&
        item.actionUrl === '/approvals' &&
        item.projectId === context.projectId &&
        item.milestoneId === context.milestoneId
      ),
      'Test 1: request notification must include trusted project and milestone context'
    );
    assert(requestRecipientFilters.some(([field, value]) => field === 'role' && value === 'HEAD_SA'), 'Test 1: request must resolve HEAD_SA recipients');
    assert(requestRecipientFilters.some(([field, value]) => field === 'is_active' && value === true), 'Test 1: request must exclude inactive users');
    const deadlineSource = readFileSync(join(__dirname, 'deadline.service.ts'), 'utf8');
    assert(deadlineSource.includes('await notifyDeadlineChangeRequested({'), 'Test 1: request workflow must trigger HEAD_SA notifications');
    assert(
      deadlineSource.indexOf('await logDeadlineChangeRequested') < deadlineSource.indexOf('await notifyDeadlineChangeRequested({'),
      'Test 1: request notification must run after the activity log'
    );
    console.log('Test 1 - ACTIVE deadline change request notifies active HEAD_SA users: passed');

    requestedNotifications.length = 0;
    await notifyDeadlineChangeApproved(context);
    assert(requestedNotifications.length === 1, 'Test 2: approval must notify the project SALES owner');
    assert(requestedNotifications[0].userId === 'sales-from-project', 'Test 2: approval recipient must be project.sales_id');
    assert(
      requestedNotifications[0].type === 'DEADLINE_CHANGE_APPROVED' &&
      requestedNotifications[0].actionUrl === '/projects/project-1',
      'Test 2: approval notification must target the project'
    );
    const approvalSource = readFileSync(join(__dirname, 'deadline-approval.service.ts'), 'utf8');
    assert(approvalSource.includes('await notifyDeadlineChangeApproved(notificationContext);'), 'Test 2: approval workflow must notify SALES after approval');
    assert(
      approvalSource.indexOf('await logDeadlineApprovalReview') < approvalSource.indexOf('await notifyDeadlineChangeApproved(notificationContext);'),
      'Test 2: approval notification must run after the activity log'
    );
    console.log('Test 2 - Approved deadline change notifies the project SALES owner: passed');

    requestedNotifications.length = 0;
    await notifyDeadlineChangeRejected(context);
    assert(requestedNotifications.length === 1, 'Test 3: rejection must notify the project SALES owner');
    assert(requestedNotifications[0].userId === 'sales-from-project', 'Test 3: rejection recipient must be project.sales_id');
    assert(
      requestedNotifications[0].type === 'DEADLINE_CHANGE_REJECTED' &&
      requestedNotifications[0].message.includes('rejected'),
      'Test 3: rejection notification must identify the rejected deadline change'
    );
    assert(approvalSource.includes('await notifyDeadlineChangeRejected(notificationContext);'), 'Test 3: rejection workflow must notify SALES after rejection');
    console.log('Test 3 - Rejected deadline change notifies the project SALES owner: passed');

    let notificationFailureLogged = false;
    (NotificationService as any).createNotification = async () => {
      throw new Error('notification insert failed');
    };
    console.error = (...args: unknown[]) => {
      notificationFailureLogged = String(args[0]).includes('[NotificationDispatch]');
    };
    await notifyDeadlineChangeApproved(context);
    assert(notificationFailureLogged, 'Test 4: notification failure must be logged server-side without throwing');
    console.log('Test 4 - Notification failure remains non-blocking: passed');

    requestedNotifications.length = 0;
    (NotificationService as any).createNotification = async (input: CreateNotificationInput) => {
      requestedNotifications.push(input);
      return {};
    };
    await notifyDeadlineChangeApproved({
      ...context,
      salesId: 'trusted-sales-id',
      frontend_recipient_id: 'untrusted-user-id',
    } as typeof context);
    assert(requestedNotifications[0].userId === 'trusted-sales-id', 'Test 5: recipient must come from trusted project.sales_id');
    console.log('Test 5 - Decision recipient is derived from trusted project state: passed');

    requestedNotifications.length = 0;
    await notifyDeadlineChangeApproved({ ...context, salesId: null });
    await notifyDeadlineChangeRejected({ ...context, salesId: null });
    assert(requestedNotifications.length === 0, 'Test 6: decision notifications must skip safely without sales_id');
    console.log('Test 6 - Missing project sales_id safely skips decision notifications: passed');

    const projectPlanSource = readFileSync(join(__dirname, 'project-plan-approval.service.ts'), 'utf8');
    assert(!projectPlanSource.includes('deadline-notification.service'), 'Test 7: DRAFT project-plan timeline must not import deadline notifications');
    assert(deadlineSource.includes("status !== 'ACTIVE'"), 'Test 7: deadline change notification path must remain limited to ACTIVE projects');
    console.log('Test 7 - DRAFT initial timeline does not trigger deadline-change notifications: passed');
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
