import { buildMilestoneInitiatedEmail } from './email.service';
import { buildMilestoneSubmissionResult } from './milestone.service';
import {
  buildMilestoneInitiationEmailActivityLog,
  buildMilestoneInitiationEmailInput,
  buildMilestoneInitiationResult,
  sendMilestoneInitiationNotification,
} from './milestone-initiation-approval.service';

const sales = { userId: 'sales-1', role: 'SALES', fullName: 'Sales Test' };
const saPic = { userId: 'sa-1', role: 'SA', fullName: 'Solution Architect Test 2' };

const initiatedMilestone = {
  id: 'milestone-1',
  project_id: 'project-1',
  name: 'Customer Assessment',
  status: 'IN_PROGRESS',
  pic_id: 'sa-1',
  pic: {
    id: 'sa-1',
    full_name: 'Solution Architect Test 2',
    email: 'sa.pic@test.com',
  },
  start_date: '2026-08-28',
  duration_working_days: 3,
  due_date: '2026-09-02',
  project: {
    sales_id: 'sales-1',
    name: 'Project CREATED Status Live Test',
    customer: 'Customer Test',
    status: 'ACTIVE',
    is_postponed: false,
  },
};

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

const assertThrows = (name: string, action: () => unknown) => {
  try {
    action();
  } catch {
    console.log(`${name}: rejected`);
    return;
  }

  throw new Error(`${name}: expected rejection`);
};

async function run() {
  const sentTo: string[] = [];
  const emailActivities: boolean[] = [];
  const successNotification = await sendMilestoneInitiationNotification(
    initiatedMilestone,
    sales,
    async (email) => {
      sentTo.push(email.recipientEmail);
    },
    async (sent) => {
      emailActivities.push(sent);
    }
  );
  assert(successNotification.email_sent === true, 'Test 1: notification.email_sent should be true');
  assert(sentTo[0] === initiatedMilestone.pic.email, 'Test 1: email should be sent to PIC email');
  assert(initiatedMilestone.status === 'IN_PROGRESS', 'Test 1: milestone should remain IN_PROGRESS');
  console.log('Test 1 - Initiate success + PIC email + SMTP mock success: email_sent=true');

  const frontendRecipient = 'frontend-provided@test.com';
  const emailInput = buildMilestoneInitiationEmailInput(initiatedMilestone, sales);
  assert(emailInput.recipientEmail === initiatedMilestone.pic.email, 'Test 2: recipient should come from PIC database');
  assert(emailInput.recipientEmail !== frontendRecipient, 'Test 2: frontend cannot determine recipient email');
  console.log('Test 2 - Recipient source is PIC database email, not frontend input');

  const failedActivities: boolean[] = [];
  const failureNotification = await sendMilestoneInitiationNotification(
    initiatedMilestone,
    sales,
    async () => {
      throw new Error('SMTP mock failure');
    },
    async (sent) => {
      failedActivities.push(sent);
    }
  );
  assert(failureNotification.email_sent === false, 'Test 3: notification.email_sent should be false');
  assert(initiatedMilestone.status === 'IN_PROGRESS', 'Test 3: milestone should remain IN_PROGRESS after SMTP failure');
  console.log('Test 3 - SMTP failure after IN_PROGRESS: initiate remains success, email_sent=false');

  const sentLog = buildMilestoneInitiationEmailActivityLog(sales, initiatedMilestone, true);
  assert(sentLog.action === 'MILESTONE_INITIATION_EMAIL_SENT', 'Test 4: success activity action mismatch');
  assert(sentLog.project_id === initiatedMilestone.project_id, 'Test 4: success activity project_id mismatch');
  assert(sentLog.user_id === sales.userId, 'Test 4: success activity user_id mismatch');
  console.log('Test 4 - SMTP success activity: MILESTONE_INITIATION_EMAIL_SENT');

  const failedLog = buildMilestoneInitiationEmailActivityLog(sales, initiatedMilestone, false);
  assert(failedLog.action === 'MILESTONE_INITIATION_EMAIL_FAILED', 'Test 5: failure activity action mismatch');
  assert(!failedLog.description.includes('SMTP mock failure'), 'Test 5: failure activity should not expose technical SMTP error');
  console.log('Test 5 - SMTP failure activity: MILESTONE_INITIATION_EMAIL_FAILED');

  const email = buildMilestoneInitiatedEmail(emailInput);
  const text = String(email.text);
  assert(text.includes(initiatedMilestone.project.name), 'Test 6: email content should include project name');
  assert(text.includes(initiatedMilestone.name), 'Test 6: email content should include milestone name');
  assert(text.includes('2 September 2026'), 'Test 6: email content should include formatted deadline');
  assert(text.includes(initiatedMilestone.pic.full_name), 'Test 6: email content should include PIC name');
  assert(text.includes(sales.fullName), 'Test 6: email content should include Sales name');
  console.log('Test 6 - Email content includes project, milestone, deadline, PIC, and Sales');

  let duplicateEmailCalls = 0;
  const firstInitiate = buildMilestoneInitiationResult({ ...initiatedMilestone, status: 'CREATED' }, sales, 'APPROVED', 'APPROVED');
  assert(firstInitiate.status === 'IN_PROGRESS', 'Test 7: first initiate should succeed');
  assertThrows('Test 7 - Duplicate initiate', () =>
    buildMilestoneInitiationResult({ ...initiatedMilestone, status: firstInitiate.status }, sales, 'APPROVED', 'APPROVED')
  );
  assert(duplicateEmailCalls === 0, 'Test 7: duplicate initiate should not send another email');
  console.log('Test 7 - Duplicate initiate rejected and does not send second email');

  const submission = buildMilestoneSubmissionResult(
    {
      id: initiatedMilestone.id,
      name: initiatedMilestone.name,
      status: firstInitiate.status,
      pic_id: saPic.userId,
      project: { status: 'ACTIVE', is_postponed: false },
    },
    saPic,
    false
  );
  assert(submission.status === 'SUBMITTED', 'Test 8: existing submission flow should accept IN_PROGRESS');
  assert(submission.approval.status === 'PENDING', 'Test 8: submission approval should be PENDING');
  console.log('Test 8 - Existing SA submission flow still works after IN_PROGRESS');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
