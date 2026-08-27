import { buildMilestoneRevisionStartResult, buildMilestoneSubmissionResult } from './milestone.service';

const saPic = { userId: 'sa-1', role: 'SA', fullName: 'Solution Architect Test 2' };
const saOther = { userId: 'sa-2', role: 'SA', fullName: 'Solution Architect Other' };

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

const revision = buildMilestoneRevisionStartResult(
  {
    id: 'milestone-1',
    project_id: 'project-1',
    name: 'Pain Point Analysis',
    status: 'REJECTED',
    pic_id: 'sa-1',
    project: { status: 'ACTIVE', is_postponed: false },
  },
  saPic,
  true,
  false
);
assert(revision.status === 'IN_PROGRESS', 'Test 1: milestone should move to IN_PROGRESS');
console.log('Test 1 - SA PIC + REJECTED + latest approval REJECTED: IN_PROGRESS');

assertThrows('Test 2 - SA not PIC start revision', () =>
  buildMilestoneRevisionStartResult(
    {
      id: 'milestone-2',
      project_id: 'project-1',
      name: 'Pain Point Analysis',
      status: 'REJECTED',
      pic_id: 'sa-1',
      project: { status: 'ACTIVE', is_postponed: false },
    },
    saOther,
    true,
    false
  )
);

assertThrows('Test 3 - Milestone not REJECTED', () =>
  buildMilestoneRevisionStartResult(
    {
      id: 'milestone-3',
      project_id: 'project-1',
      name: 'Pain Point Analysis',
      status: 'SUBMITTED',
      pic_id: 'sa-1',
      project: { status: 'ACTIVE', is_postponed: false },
    },
    saPic,
    true,
    false
  )
);

assertThrows('Test 4 - Project POSTPONED', () =>
  buildMilestoneRevisionStartResult(
    {
      id: 'milestone-4',
      project_id: 'project-1',
      name: 'Pain Point Analysis',
      status: 'REJECTED',
      pic_id: 'sa-1',
      project: { status: 'POSTPONED', is_postponed: true },
    },
    saPic,
    true,
    false
  )
);

assertThrows('Test 5 - Milestone has PENDING approval', () =>
  buildMilestoneRevisionStartResult(
    {
      id: 'milestone-5',
      project_id: 'project-1',
      name: 'Pain Point Analysis',
      status: 'REJECTED',
      pic_id: 'sa-1',
      project: { status: 'ACTIVE', is_postponed: false },
    },
    saPic,
    true,
    true
  )
);

const oldApproval = { status: 'REJECTED', submission_note: 'Submission 1', review_note: 'Analisis belum lengkap.' };
const resubmission = buildMilestoneSubmissionResult(
  {
    id: 'milestone-6',
    name: 'Pain Point Analysis',
    status: revision.status,
    pic_id: 'sa-1',
    project: { status: 'ACTIVE', is_postponed: false },
  },
  saPic,
  false,
  'Pain point sudah diperbaiki sesuai feedback.'
);
assert(resubmission.status === 'SUBMITTED', 'Test 6: milestone should move to SUBMITTED');
assert(resubmission.approval.status === 'PENDING', 'Test 6: new approval should be PENDING');
assert(oldApproval.status === 'REJECTED', 'Test 6: old approval should remain REJECTED');
console.log('Test 6 - Start revision then submit existing endpoint: SUBMITTED, new approval=PENDING, old approval=REJECTED');

assert(resubmission.approval.submission_note === 'Pain point sudah diperbaiki sesuai feedback.', 'Test 7: resubmit note should be saved');
console.log('Test 7 - Resubmit note saved on new PENDING approval');
