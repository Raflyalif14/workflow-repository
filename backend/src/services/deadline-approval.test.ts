import { buildDeadlineApprovalReview } from './deadline-approval.service';

const reviewerId = 'head-sa-user-id';
const reviewedAt = '2026-09-07T00:00:00.000Z';

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

const approved = buildDeadlineApprovalReview('PENDING', 'APPROVED', reviewerId, undefined, reviewedAt);
assert(approved.status === 'APPROVED', 'Test 1: status should be APPROVED');
assert(approved.reviewed_by === reviewerId, 'Test 1: reviewed_by should be set');
assert(approved.reviewed_at === reviewedAt, 'Test 1: reviewed_at should be set');
console.log('Test 1 - PENDING to APPROVED: APPROVED, reviewed_by set, reviewed_at set');

const rejected = buildDeadlineApprovalReview('PENDING', 'REJECTED', reviewerId, 'Deadline terlalu lama', reviewedAt);
assert(rejected.status === 'REJECTED', 'Test 2: status should be REJECTED');
assert(rejected.review_note === 'Deadline terlalu lama', 'Test 2: review_note should be saved');
console.log('Test 2 - PENDING to REJECTED with note: REJECTED, review_note saved');

assertThrows('Test 3 - REJECT without note', () =>
  buildDeadlineApprovalReview('PENDING', 'REJECTED', reviewerId, '   ', reviewedAt)
);

assertThrows('Test 4 - SUPERSEDED to APPROVE', () =>
  buildDeadlineApprovalReview('SUPERSEDED', 'APPROVED', reviewerId, undefined, reviewedAt)
);

assertThrows('Test 5 - APPROVED to APPROVE again', () =>
  buildDeadlineApprovalReview('APPROVED', 'APPROVED', reviewerId, undefined, reviewedAt)
);
