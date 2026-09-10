import { DeadlineApprovalController } from './deadline-approval.controller';
import { DeadlineController } from './deadline.controller';
import { DeadlineApprovalService } from '../services/deadline-approval.service';
import { DeadlineService } from '../services/deadline.service';
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
