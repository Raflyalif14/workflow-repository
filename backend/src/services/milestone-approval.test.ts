import { buildMilestoneApprovalReview } from './milestone-approval.service';

const headSa = { userId: 'head-sa-1', role: 'HEAD_SA', fullName: 'Head Solution Architect Test' };
const sa = { userId: 'sa-1', role: 'SA', fullName: 'Solution Architect Test' };
const activeProject = { status: 'ACTIVE', is_postponed: false };
const postponedProject = { status: 'POSTPONED', is_postponed: true };
const reviewedAt = '2026-08-27T00:00:00.000Z';

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

const approved = buildMilestoneApprovalReview('PENDING', 'SUBMITTED', activeProject, 'APPROVED', headSa, undefined, reviewedAt);
assert(approved.approval.status === 'APPROVED', 'Test 1: approval should be APPROVED');
assert(approved.milestone.status === 'COMPLETED', 'Test 1: milestone should be COMPLETED');
assert(approved.milestone.completed_at === reviewedAt, 'Test 1: completed_at should be set');
assert(approved.approval.reviewed_by === headSa.userId, 'Test 1: reviewed_by should be HEAD_SA');
console.log('Test 1 - HEAD_SA approve PENDING + SUBMITTED: approval=APPROVED, milestone=COMPLETED, completed_at set');

const rejected = buildMilestoneApprovalReview('PENDING', 'SUBMITTED', activeProject, 'REJECTED', headSa, 'Dokumentasi requirement belum lengkap.', reviewedAt);
assert(rejected.approval.status === 'REJECTED', 'Test 2: approval should be REJECTED');
assert(rejected.milestone.status === 'REJECTED', 'Test 2: milestone should be REJECTED');
assert(rejected.milestone.completed_at === null, 'Test 2: completed_at should be null');
assert(rejected.approval.review_note === 'Dokumentasi requirement belum lengkap.', 'Test 2: review_note should be saved');
console.log('Test 2 - HEAD_SA reject PENDING with note: approval=REJECTED, milestone=REJECTED, completed_at null');

assertThrows('Test 3 - Reject without note', () =>
  buildMilestoneApprovalReview('PENDING', 'SUBMITTED', activeProject, 'REJECTED', headSa, '   ', reviewedAt)
);

assertThrows('Test 4 - Non HEAD_SA approve/reject', () =>
  buildMilestoneApprovalReview('PENDING', 'SUBMITTED', activeProject, 'APPROVED', sa, undefined, reviewedAt)
);

assertThrows('Test 5 - Review already APPROVED approval', () =>
  buildMilestoneApprovalReview('APPROVED', 'SUBMITTED', activeProject, 'APPROVED', headSa, undefined, reviewedAt)
);

assertThrows('Test 6 - Milestone not SUBMITTED', () =>
  buildMilestoneApprovalReview('PENDING', 'IN_PROGRESS', activeProject, 'APPROVED', headSa, undefined, reviewedAt)
);

assertThrows('Test 7 - Project POSTPONED', () =>
  buildMilestoneApprovalReview('PENDING', 'SUBMITTED', postponedProject, 'APPROVED', headSa, undefined, reviewedAt)
);
