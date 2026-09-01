import { readFileSync } from 'fs';
import { join } from 'path';
import { supabaseAdmin } from '../config/supabase';
import { CreateNotificationInput, NotificationService } from './notification.service';
import {
  notifyProjectPlanApproved,
  notifyProjectPlanRejected,
  notifyProjectPlanSubmitted,
} from './project-plan-notification.service';

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

const project = {
  id: 'project-1',
  name: 'Enterprise Assessment',
  sales_id: 'sales-from-project',
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
      assert(table === 'users', 'Test 1: submitted plan recipients must be read from users');
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
    await notifyProjectPlanSubmitted(project);
    assert(requestedNotifications.length === 2, 'Test 1: submit must request one notification per active HEAD_SA');
    assert(requestedNotifications.every((item) => item.type === 'PROJECT_PLAN_SUBMITTED' && item.actionUrl === '/approvals'), 'Test 1: submit notification content must target approvals');
    assert(submittedRecipientFilters.some(([field, value]) => field === 'role' && value === 'HEAD_SA'), 'Test 1: submit must resolve HEAD_SA recipients');
    assert(submittedRecipientFilters.some(([field, value]) => field === 'is_active' && value === true), 'Test 1: submit must exclude inactive users');
    const projectPlanSource = readFileSync(join(__dirname, 'project-plan-approval.service.ts'), 'utf8');
    assert(projectPlanSource.includes('await notifyProjectPlanSubmitted(project);'), 'Test 1: submit workflow must trigger HEAD_SA notifications');
    console.log('Test 1 - Project plan submit requests notifications for active HEAD_SA users: passed');

    requestedNotifications.length = 0;
    await notifyProjectPlanApproved(project);
    assert(requestedNotifications.length === 1, 'Test 2: approve must request one SALES notification');
    assert(requestedNotifications[0].userId === 'sales-from-project', 'Test 2: approve recipient must be the project SALES owner');
    assert(requestedNotifications[0].type === 'PROJECT_PLAN_APPROVED' && requestedNotifications[0].actionUrl === '/projects/project-1', 'Test 2: approve notification content must target the project');
    assert(projectPlanSource.includes('await notifyProjectPlanApproved(project);'), 'Test 2: approve workflow must trigger SALES notification');
    console.log('Test 2 - Project plan approve requests a notification for the SALES owner: passed');

    requestedNotifications.length = 0;
    await notifyProjectPlanRejected(project);
    assert(requestedNotifications.length === 1, 'Test 3: reject must request one SALES notification');
    assert(requestedNotifications[0].userId === 'sales-from-project', 'Test 3: reject recipient must be the project SALES owner');
    assert(requestedNotifications[0].type === 'PROJECT_PLAN_REJECTED' && requestedNotifications[0].message.includes('requires revision'), 'Test 3: reject notification must request revision');
    assert(projectPlanSource.includes('await notifyProjectPlanRejected(project);'), 'Test 3: reject workflow must trigger SALES notification');
    console.log('Test 3 - Project plan reject requests a notification for the SALES owner: passed');

    let notificationFailureLogged = false;
    (NotificationService as any).createNotification = async () => {
      throw new Error('notification insert failed');
    };
    console.error = (...args: unknown[]) => {
      notificationFailureLogged = String(args[0]).includes('[NotificationDispatch]');
    };
    await notifyProjectPlanApproved(project);
    assert(notificationFailureLogged, 'Test 4: notification failure must be logged server-side');
    console.log('Test 4 - Notification failure does not fail the Project Plan notification flow: passed');

    requestedNotifications.length = 0;
    (NotificationService as any).createNotification = async (input: CreateNotificationInput) => {
      requestedNotifications.push(input);
      return {};
    };
    await notifyProjectPlanApproved({ ...project, sales_id: 'trusted-sales-id', frontend_recipient_id: 'untrusted-user-id' } as typeof project);
    assert(requestedNotifications[0].userId === 'trusted-sales-id', 'Test 5: recipient must come from trusted project.sales_id, not frontend data');
    console.log('Test 5 - Project Plan recipient is derived from trusted project state: passed');
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
