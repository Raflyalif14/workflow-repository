import { readFileSync } from 'fs';
import { join } from 'path';
import { CreateNotificationInput, NotificationService } from './notification.service';
import { notifyPicAssignment } from './pic-assignment-notification.service';

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

const projectAssignment = {
  projectId: 'project-1',
  projectName: 'Enterprise Assessment',
  previousPicId: null,
  currentPicId: 'sa-new',
};

const originalCreateNotification = NotificationService.createNotification;
const originalConsoleError = console.error;

async function run(): Promise<void> {
  try {
    const requestedNotifications: CreateNotificationInput[] = [];
    (NotificationService as any).createNotification = async (input: CreateNotificationInput) => {
      requestedNotifications.push(input);
      return {};
    };

    await notifyPicAssignment(projectAssignment);
    assert(requestedNotifications.length === 1, 'Test 1: no PIC to new PIC must request one notification');
    assert(requestedNotifications[0].userId === 'sa-new', 'Test 1: new PIC must receive the assignment notification');
    assert(requestedNotifications[0].type === 'PIC_ASSIGNED', 'Test 1: initial assignment must use PIC_ASSIGNED');
    const assignmentSource = readFileSync(join(__dirname, 'assignment-phase5.service.ts'), 'utf8');
    assert(assignmentSource.includes('await notifyPicAssignment({'), 'Test 1: canonical assignment workflow must trigger notification');
    assert(
      assignmentSource.includes("if (workflowMode === 'OPERATIONAL_V2')") &&
      assignmentSource.indexOf('const workflow = await completeAssignPicStageIfCurrent') < assignmentSource.lastIndexOf('await notifyPicAssignment({'),
      'Test 1: legacy notification must run after legacy workflow progression while V2 retains its direct assignment notification'
    );
    console.log('Test 1 - No PIC to new PIC requests PIC_ASSIGNED for the new PIC: passed');

    requestedNotifications.length = 0;
    await notifyPicAssignment({ ...projectAssignment, previousPicId: 'sa-previous', currentPicId: 'sa-reassigned' });
    assert(requestedNotifications.length === 1, 'Test 2: reassignment must request one notification');
    assert(requestedNotifications[0].userId === 'sa-reassigned', 'Test 2: newly assigned PIC must receive reassignment notification');
    assert(requestedNotifications[0].type === 'PIC_REASSIGNED', 'Test 2: changed PIC must use PIC_REASSIGNED');
    console.log('Test 2 - Existing PIC A to PIC B requests PIC_REASSIGNED for PIC B: passed');

    requestedNotifications.length = 0;
    await notifyPicAssignment({ ...projectAssignment, previousPicId: 'sa-same', currentPicId: 'sa-same' });
    assert(requestedNotifications.length === 0, 'Test 3: same-PIC assignment must not request a duplicate notification');
    console.log('Test 3 - Existing PIC A to PIC A does not create a duplicate notification: passed');

    let notificationFailureLogged = false;
    (NotificationService as any).createNotification = async () => {
      throw new Error('notification insert failed');
    };
    console.error = (...args: unknown[]) => {
      notificationFailureLogged = String(args[0]).includes('[NotificationDispatch]');
    };
    await notifyPicAssignment(projectAssignment);
    assert(notificationFailureLogged, 'Test 4: notification failure must be logged server-side');
    console.log('Test 4 - Notification failure does not fail the PIC assignment notification flow: passed');

    requestedNotifications.length = 0;
    (NotificationService as any).createNotification = async (input: CreateNotificationInput) => {
      requestedNotifications.push(input);
      return {};
    };
    await notifyPicAssignment({ ...projectAssignment, currentPicId: 'trusted-history-pic', frontend_recipient_id: 'untrusted-user-id' } as typeof projectAssignment);
    assert(requestedNotifications[0].userId === 'trusted-history-pic', 'Test 5: recipient must come from trusted assignment state, not frontend data');
    console.log('Test 5 - PIC recipient is derived from trusted assignment state: passed');

    requestedNotifications.length = 0;
    await notifyPicAssignment({
      ...projectAssignment,
      milestoneId: 'milestone-1',
      milestoneName: 'Requirement Gathering',
    });
    assert(requestedNotifications[0].projectId === 'project-1', 'Test 6: notification must include the project ID');
    assert(requestedNotifications[0].milestoneId === 'milestone-1', 'Test 6: milestone-specific assignment must include milestone ID');
    assert(requestedNotifications[0].actionUrl === '/projects/project-1', 'Test 6: notification must target the assigned project');
    console.log('Test 6 - Assignment payload includes project, milestone context, and project action URL: passed');
  } finally {
    (NotificationService as any).createNotification = originalCreateNotification;
    console.error = originalConsoleError;
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
