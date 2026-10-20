import { DeadlineApprovalController } from './deadline-approval.controller';
import { DeadlineController } from './deadline.controller';
import { DeadlineApprovalService } from '../services/deadline-approval.service';
import { DeadlineService } from '../services/deadline.service';
import { BusinessAuditError } from '../services/business-audit.service';
import {
  DeadlineError,
  toSafeDeadlineError,
} from '../utils/deadline-error.util';

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

type ResponseCapture = {
  statusCode: number | null;
  body: Record<string, any> | null;
  status: (statusCode: number) => ResponseCapture;
  json: (body: Record<string, any>) => ResponseCapture;
};

const createResponseCapture = (): ResponseCapture => {
  const response: ResponseCapture = {
    statusCode: null,
    body: null,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  return response;
};

async function run(): Promise<void> {
  const pending = toSafeDeadlineError(
    new Error('A deadline change request is already pending approval.'),
    'Failed to save milestone deadline.'
  );
  assert(pending.statusCode === 409 && pending.message === 'A deadline change request is already pending approval.', 'Test 1: known pending request error must remain readable');

  const forbidden = toSafeDeadlineError(new Error('Forbidden'), 'Failed to save milestone deadline.');
  assert(forbidden.statusCode === 403 && forbidden.message === 'Forbidden', 'Test 1: known authorization error must remain readable');

  const invalidState = toSafeDeadlineError(new Error('Deadline approval is no longer pending.'), 'Failed to review deadline approval.');
  assert(invalidState.statusCode === 400 && invalidState.message === 'Deadline approval is no longer pending.', 'Test 1: known invalid review state must remain readable');
  console.log('Test 1 - Known deadline business errors retain safe readable messages and statuses: passed');

  const providerMessage = 'PostgREST: relation milestone_deadline_approvals does not exist';
  const hiddenProviderError = toSafeDeadlineError(new Error(providerMessage), 'Failed to save milestone deadline.');
  assert(hiddenProviderError.statusCode === 500, 'Test 2: unknown provider failure must use HTTP 500');
  assert(hiddenProviderError.message === 'Failed to save milestone deadline.', 'Test 2: unknown provider failure must use generic deadline message');
  assert(!hiddenProviderError.message.includes('PostgREST'), 'Test 2: client error must not expose provider detail');
  console.log('Test 2 - Unknown provider errors map to a generic 500 response: passed');

  const businessError = new BusinessAuditError('The project changed. Refresh and try again.', 409);
  assert(toSafeDeadlineError(businessError, 'Failed to save milestone deadline.') === businessError,
    'Test 2b: trusted DeadlineError subclasses must retain their safe message and status');
  console.log('Test 2b - Trusted business error subclasses remain supported: passed');

  const originalSave = DeadlineService.saveMilestoneDeadline;
  const originalReject = DeadlineApprovalService.rejectDeadlineApproval;
  const originalConsoleError = console.error;
  const serverErrors: unknown[][] = [];

  try {
    console.error = (...args: unknown[]) => {
      serverErrors.push(args);
    };

    (DeadlineService as any).saveMilestoneDeadline = async () => {
      throw new DeadlineError('Failed to create deadline approval.', 500, new Error(providerMessage));
    };
    const failedSaveResponse = createResponseCapture();
    await DeadlineController.saveMilestoneDeadline(
      { params: { milestoneId: 'milestone-1' }, body: {}, user: { userId: 'sales-1', role: 'SALES', fullName: 'Sales Test' } } as any,
      failedSaveResponse as any
    );
    assert(failedSaveResponse.statusCode === 500, 'Test 3: controller must return HTTP 500 for internal deadline error');
    assert(failedSaveResponse.body?.message === 'Failed to create deadline approval.', 'Test 3: controller must return the safe service message');
    assert(!JSON.stringify(failedSaveResponse.body).includes('PostgREST'), 'Test 3: controller response must not include provider detail');
    assert(JSON.stringify(serverErrors).includes(providerMessage), 'Test 3: provider detail must be logged server-side');
    console.log('Test 3 - Internal deadline failure is logged server-side without leaking through the API: passed');

    (DeadlineService as any).saveMilestoneDeadline = async () => ({ milestone_id: 'milestone-1', approval: { id: 'approval-1', status: 'PENDING' } });
    const successfulSaveResponse = createResponseCapture();
    await DeadlineController.saveMilestoneDeadline(
      { params: { milestoneId: 'milestone-1' }, body: {}, user: { userId: 'sales-1', role: 'SALES', fullName: 'Sales Test' } } as any,
      successfulSaveResponse as any
    );
    assert(successfulSaveResponse.statusCode === 200 && successfulSaveResponse.body?.data?.approval?.status === 'PENDING', 'Test 4: successful deadline request response must remain unchanged');

    (DeadlineApprovalService as any).rejectDeadlineApproval = async () => ({
      id: 'approval-1',
      status: 'REJECTED',
      review_note: 'Keep the existing deadline.',
      reviewed_by: 'head-sa-1',
      reviewed_at: '2026-09-10T00:00:00.000Z',
    });
    const successfulReviewResponse = createResponseCapture();
    await DeadlineApprovalController.reject(
      { params: { approvalId: 'approval-1' }, body: { note: 'Keep the existing deadline.' }, user: { userId: 'head-sa-1', role: 'HEAD_SA', fullName: 'Head SA Test' } } as any,
      successfulReviewResponse as any
    );
    assert(successfulReviewResponse.statusCode === 200 && successfulReviewResponse.body?.data?.review_note === 'Keep the existing deadline.', 'Test 4: successful rejection response must retain the review note');
    console.log('Test 4 - Successful deadline request/rejection responses remain unchanged and retain review notes: passed');

    const namedErrors = [
      Object.assign(new Error(providerMessage), { name: 'DeadlineError' }),
      { name: 'DeadlineError', message: providerMessage, statusCode: 409 },
    ];
    for (const namedError of namedErrors) {
      const loggedBefore = serverErrors.length;
      (DeadlineService as any).saveMilestoneDeadline = async () => { throw namedError; };
      (DeadlineApprovalService as any).rejectDeadlineApproval = async () => { throw namedError; };

      const saveResponse = createResponseCapture();
      await DeadlineController.saveMilestoneDeadline(
        { params: { milestoneId: 'milestone-1' }, body: {}, headers: {}, user: { userId: 'sales-1', role: 'SALES' } } as any,
        saveResponse as any
      );
      const rejectResponse = createResponseCapture();
      await DeadlineApprovalController.reject(
        { params: { approvalId: 'approval-1' }, body: { note: 'Keep deadline.' }, headers: {}, user: { userId: 'head-sa-1', role: 'HEAD_SA' } } as any,
        rejectResponse as any
      );

      assert(saveResponse.statusCode === 500 && rejectResponse.statusCode === 500,
        'Test 5: an unknown error named DeadlineError must not choose the HTTP status');
      assert(saveResponse.body?.message === 'Failed to save milestone deadline.',
        'Test 5: saving must use its generic fallback for an unknown named error');
      assert(rejectResponse.body?.message === 'Failed to reject deadline approval.',
        'Test 5: reviewing must use its generic fallback for an unknown named error');
      assert(!JSON.stringify([saveResponse.body, rejectResponse.body]).includes(providerMessage),
        'Test 5: neither controller may expose the internal message of an unknown named error');
      const newLogs = serverErrors.slice(loggedBefore);
      assert(newLogs.length === 2 && newLogs.every(entry => JSON.stringify(entry).includes(providerMessage)),
        'Test 5: both controllers must retain the unknown error detail in server-side logs');
    }
    console.log('Test 5 - Error names and lookalike objects cannot bypass either controller sanitizer: passed');
  } finally {
    (DeadlineService as any).saveMilestoneDeadline = originalSave;
    (DeadlineApprovalService as any).rejectDeadlineApproval = originalReject;
    console.error = originalConsoleError;
  }

}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
