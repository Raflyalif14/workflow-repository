import { buildMilestoneSubmissionResult } from './milestone.service';

const saPic = { userId: 'sa-1', role: 'SA', fullName: 'Solution Architect Test 2' };
const saOther = { userId: 'sa-2', role: 'SA', fullName: 'Solution Architect Other' };
const headSaPic = { userId: 'head-sa-1', role: 'HEAD_SA', fullName: 'Head SA Test' };
const headSaOther = { userId: 'head-sa-2', role: 'HEAD_SA', fullName: 'Head SA Other' };

const assertThrows = (name: string, action: () => unknown) => {
  try {
    action();
  } catch {
    console.log(`${name}: rejected`);
    return;
  }

  throw new Error(`${name}: expected rejection`);
};

const submitted = buildMilestoneSubmissionResult(
  {
    id: 'milestone-1',
    name: 'Requirement Gathering',
    status: 'IN_PROGRESS',
    pic_id: 'sa-1',
    project: { status: 'ACTIVE', is_postponed: false },
  },
  saPic,
  false
);
if (
  submitted.status !== 'SUBMITTED' ||
  submitted.approval.status !== 'PENDING' ||
  submitted.approval.submitted_by !== 'sa-1'
) {
  throw new Error('Test 1 failed');
}
console.log('Test 1 - SA PIC + IN_PROGRESS + no pending approval: SUBMITTED, approval=PENDING, submitted_by=SA PIC');

const submittedWithNote = buildMilestoneSubmissionResult(
  {
    id: 'milestone-2',
    name: 'Requirement Gathering',
    status: 'IN_PROGRESS',
    pic_id: 'sa-1',
    project: { status: 'ACTIVE', is_postponed: false },
  },
  saPic,
  false,
  'Requirement gathering selesai.'
);
if (submittedWithNote.approval.submission_note !== 'Requirement gathering selesai.') {
  throw new Error('Test 2 failed');
}
console.log('Test 2 - Submission with note: submission_note saved');

assertThrows('Test 3 - Existing PENDING approval', () =>
  buildMilestoneSubmissionResult(
    {
      id: 'milestone-3',
      name: 'Requirement Gathering',
      status: 'IN_PROGRESS',
      pic_id: 'sa-1',
      project: { status: 'ACTIVE', is_postponed: false },
    },
    saPic,
    true
  )
);

assertThrows('Test 4 - SA not PIC', () =>
  buildMilestoneSubmissionResult(
    {
      id: 'milestone-4',
      name: 'Requirement Gathering',
      status: 'IN_PROGRESS',
      pic_id: 'sa-1',
      project: { status: 'ACTIVE', is_postponed: false },
    },
    saOther,
    false
  )
);

assertThrows('Test 5 - Milestone not IN_PROGRESS', () =>
  buildMilestoneSubmissionResult(
    {
      id: 'milestone-5',
      name: 'Requirement Gathering',
      status: 'PENDING',
      pic_id: 'sa-1',
      project: { status: 'ACTIVE', is_postponed: false },
    },
    saPic,
    false
  )
);

const headSaSubmission = buildMilestoneSubmissionResult(
  {
    id: 'milestone-6',
    name: 'Requirement Gathering',
    status: 'IN_PROGRESS',
    pic_id: 'head-sa-1',
    project: { status: 'ACTIVE', is_postponed: false },
  },
  headSaPic,
  false
);
if (headSaSubmission.status !== 'SUBMITTED' || headSaSubmission.approval.submitted_by !== 'head-sa-1') {
  throw new Error('Test 6 failed');
}
console.log('Test 6 - Assigned HEAD_SA PIC can submit an IN_PROGRESS SA milestone');

assertThrows('Test 7 - Unassigned HEAD_SA cannot submit milestone', () =>
  buildMilestoneSubmissionResult(
    {
      id: 'milestone-7',
      name: 'Requirement Gathering',
      status: 'IN_PROGRESS',
      pic_id: 'head-sa-1',
      project: { status: 'ACTIVE', is_postponed: false },
    },
    headSaOther,
    false
  )
);
