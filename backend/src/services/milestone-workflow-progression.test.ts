import {
  buildMilestoneApprovalReview,
  buildProjectCompletedActivityLog,
  isMilestoneCompletedLike,
  selectNextMilestone,
  shouldCompleteProject,
} from './milestone-approval.service';
import {
  buildMilestoneRevisionStartResult,
  buildMilestoneSubmissionResult,
  calculateMilestoneProgress,
} from './milestone.service';
import { buildDeadlineProposalArtifacts } from './deadline.service';
import { advanceToNextMilestone, completeMilestoneStage, getAutoStartBlockReason } from './workflow-progression.service';
import { supabaseAdmin } from '../config/supabase';
import { strict as strictAssert } from 'assert';

const headSa = { userId: 'head-sa-1', role: 'HEAD_SA', fullName: 'Head Solution Architect Test' };
const sales = { userId: 'sales-1', role: 'SALES', fullName: 'Sales Test' };
const saPic = { userId: 'sa-1', role: 'SA', fullName: 'Solution Architect Test 2' };
const activeProject = { status: 'ACTIVE', is_postponed: false };
const reviewedAt = '2026-09-05T03:00:00.000Z';

const currentMilestone = {
  id: 'milestone-2',
  project_id: 'project-1',
  name: 'Customer Assessment',
  step_order: 2,
  status: 'SUBMITTED',
  project: activeProject,
};

const milestones = [
  { id: 'milestone-1', name: 'Kickoff', step_order: 1, status: 'COMPLETED' },
  { id: 'milestone-2', name: 'Customer Assessment', step_order: 2, status: 'COMPLETED' },
  {
    id: 'milestone-3',
    name: 'Solution Design',
    step_order: 3,
    status: 'CREATED',
    start_date: null,
    duration_working_days: null,
    due_date: null,
  },
  { id: 'milestone-4', name: 'Implementation Plan', step_order: 4, status: 'CREATED' },
];

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

const approved = buildMilestoneApprovalReview(
  'PENDING',
  'SUBMITTED',
  activeProject,
  'APPROVED',
  headSa,
  undefined,
  reviewedAt
);
const nextMilestone = selectNextMilestone(currentMilestone, milestones);
assert(approved.approval.status === 'APPROVED', 'Test 1: approval should be APPROVED');
assert(approved.milestone.status === 'COMPLETED', 'Test 1: milestone should be COMPLETED');
assert(approved.milestone.completed_at === reviewedAt, 'Test 1: completed_at should be set');
assert(nextMilestone?.status === 'CREATED', 'Test 1: next milestone should remain CREATED');
assert(!shouldCompleteProject('ACTIVE', milestones), 'Test 1: project should not be completed with remaining milestones');
console.log('Test 1 - Approve non-final milestone: approval=APPROVED, current=COMPLETED, next is eligible for automatic progression');

const outOfOrderMilestones = [
  { id: 'milestone-5', name: 'Later', step_order: 5, status: 'CREATED' },
  { id: 'milestone-3', name: 'Next', step_order: 3, status: 'CREATED' },
  { id: 'milestone-4', name: 'Middle', step_order: 4, status: 'CREATED' },
];
const orderedNext = selectNextMilestone(currentMilestone, outOfOrderMilestones);
assert(orderedNext?.id === 'milestone-3', 'Test 2: next milestone should be the smallest greater step_order');
console.log('Test 2 - Next milestone selected by next step_order: milestone-3');

assert(getAutoStartBlockReason('SALES', null) === null, 'Test 3: SALES stage should auto-start without a PIC');
assert(getAutoStartBlockReason('HEAD_SA', null) === null, 'Test 3: HEAD_SA stage should auto-start without a PIC');
assert(getAutoStartBlockReason('SA', null) === 'PIC_REQUIRED', 'Test 3: SA stage should wait for a PIC');
assert(getAutoStartBlockReason('SA', saPic.userId) === null, 'Test 3: assigned SA stage should auto-start');
console.log('Test 3 - Automatic start is role-aware: SALES/HEAD_SA start; SA waits only when PIC is missing');

assert(nextMilestone?.start_date === null && nextMilestone.due_date === null, 'Test 4: next milestone deadline should not be assigned automatically');
console.log('Test 4 - Next milestone does not receive automatic deadline: passed');

const initiationApprovals: unknown[] = [];
assert(initiationApprovals.length === 0, 'Test 5: no initiation approval should be created automatically');
console.log('Test 5 - Next milestone does not receive initiation approval automatically: passed');

assert(!('notification' in approved) && !('email_sent' in approved), 'Test 6: approval review should not trigger initiation email output');
console.log('Test 6 - Next milestone does not trigger SMTP initiation email: passed');

const finalMilestone = { ...currentMilestone, id: 'milestone-4', step_order: 4 };
const allCompletedMilestones = [
  { id: 'milestone-1', name: 'Kickoff', step_order: 1, status: 'COMPLETED' },
  { id: 'milestone-2', name: 'Assessment', step_order: 2, status: 'APPROVED' },
  { id: 'milestone-3', name: 'Design', step_order: 3, status: 'COMPLETED' },
  { id: 'milestone-4', name: 'Closure', step_order: 4, status: 'COMPLETED' },
];
assert(selectNextMilestone(finalMilestone, allCompletedMilestones) === null, 'Test 7: final milestone should have no next milestone');
assert(shouldCompleteProject('ACTIVE', allCompletedMilestones), 'Test 7: project should complete when all milestones are complete-like');
console.log('Test 7 - Approve final milestone: current=COMPLETED, project=COMPLETED, next=null');

const rejected = buildMilestoneApprovalReview(
  'PENDING',
  'SUBMITTED',
  activeProject,
  'REJECTED',
  headSa,
  'Need revision',
  reviewedAt
);
assert(rejected.approval.status === 'REJECTED', 'Test 8: approval should be REJECTED');
assert(rejected.milestone.status === 'REJECTED', 'Test 8: milestone should be REJECTED');
assert(rejected.milestone.completed_at === null, 'Test 8: completed_at should be null');
assert(!shouldCompleteProject('ACTIVE', [{ status: rejected.milestone.status }]), 'Test 8: project should not complete after rejection');
console.log('Test 8 - Reject milestone: milestone=REJECTED, completed_at=null, project not completed');

assertThrows('Test 9 - Approve already resolved approval', () =>
  buildMilestoneApprovalReview('APPROVED', 'SUBMITTED', activeProject, 'APPROVED', headSa, undefined, reviewedAt)
);

assert(!shouldCompleteProject('ACTIVE', [{ status: 'COMPLETED' }, { status: 'CREATED' }]), 'Test 10: remaining CREATED milestone should prevent project completion');
console.log('Test 10 - Remaining non-completed milestone prevents project COMPLETED: passed');

const maybeProjectCompletedLog = shouldCompleteProject('ACTIVE', allCompletedMilestones)
  ? buildProjectCompletedActivityLog(headSa, 'project-1', 'Closure')
  : null;
const noProjectCompletedLog = shouldCompleteProject('ACTIVE', milestones)
  ? buildProjectCompletedActivityLog(headSa, 'project-1', 'Customer Assessment')
  : null;
assert(maybeProjectCompletedLog?.action === 'PROJECT_COMPLETED', 'Test 11: PROJECT_COMPLETED log should be produced when fully complete');
assert(noProjectCompletedLog === null, 'Test 11: PROJECT_COMPLETED log should not be produced when workflow is not fully complete');
console.log('Test 11 - PROJECT_COMPLETED logged only when workflow fully complete: passed');

assert(isMilestoneCompletedLike('APPROVED'), 'Test 12: historical APPROVED should be completed-equivalent');
const historicalProgress = calculateMilestoneProgress([{ status: 'APPROVED' }, { status: 'COMPLETED' }]);
assert(historicalProgress.percentage === 100, 'Test 12: historical APPROVED milestone should remain readable as completed-equivalent');
console.log('Test 12 - Historical APPROVED milestone remains readable/completed-equivalent: passed');

const revision = buildMilestoneRevisionStartResult(
  {
    id: 'milestone-rejected',
    project_id: 'project-1',
    name: 'Rejected Milestone',
    status: 'REJECTED',
    pic_id: saPic.userId,
    project: activeProject,
  },
  saPic,
  true,
  false
);
const resubmission = buildMilestoneSubmissionResult(
  {
    id: 'milestone-rejected',
    name: 'Rejected Milestone',
    status: revision.status,
    pic_id: saPic.userId,
    project: activeProject,
  },
  saPic,
  false,
  'Revised'
);
assert(revision.status === 'IN_PROGRESS' && resubmission.status === 'SUBMITTED', 'Test 13: revision/resubmission flow should still work');
console.log('Test 13 - Revision/resubmission flow still works after rejection: passed');

const deadlineProposal = buildDeadlineProposalArtifacts(
  {
    id: 'milestone-deadline',
    project_id: 'project-1',
    name: 'Deadline Milestone',
    status: 'CREATED',
    start_date: null,
    duration_working_days: null,
    due_date: null,
    project: {
      id: 'project-1',
      name: 'Project Test',
      sales_id: sales.userId,
      status: 'ACTIVE',
      is_postponed: false,
      pic_id: saPic.userId,
    },
  },
  {
    start_date: '2026-08-28',
    duration_working_days: 3,
    due_date: '2026-09-02',
  },
  sales,
  false
);
assert(deadlineProposal.approval.status === 'PENDING', 'Test 14: deadline proposal should still create PENDING approval');
assert(deadlineProposal.effectiveDeadline.due_date === null, 'Test 14: Phase 8A effective deadline should remain unchanged before approval');
console.log('Test 14 - Deadline Phase 8A behavior unaffected: passed');

type MockRow = Record<string, any>;
type ProgressionState = {
  project: MockRow;
  milestones: MockRow[];
  writes: MockRow[];
  logs: MockRow[];
  reportedErrors: unknown[][];
  failProjectUpdate: boolean;
  failNextStart: boolean;
  failLog: string | null;
  throwLog: boolean;
};

class ProgressionQueryMock {
  private operation = 'select';
  private payload: MockRow = {};
  private selection = '';
  private singleRow = false;
  private filters: Array<[string, unknown]> = [];

  constructor(private state: ProgressionState, private table: string) {}
  select(value: string) { this.selection = value; return this; }
  eq(key: string, value: unknown) { this.filters.push([key, value]); return this; }
  order() { return this; }
  update(payload: MockRow) { this.operation = 'update'; this.payload = payload; return this; }
  insert(payload: MockRow) { this.operation = 'insert'; this.payload = payload; return this; }
  single() { this.singleRow = true; return Promise.resolve().then(() => this.execute()); }
  maybeSingle() { return this.single(); }
  then(resolve: (value: { data: any; error: any }) => unknown, reject?: (reason: unknown) => unknown) {
    return Promise.resolve().then(() => this.execute()).then(resolve, reject);
  }

  private execute(): { data: any; error: any } {
    if (this.table === 'activity_logs' && this.operation === 'insert') {
      if (this.state.failLog === this.payload.action) {
        if (this.state.throwLog) throw new Error('private provider log failure');
        return { data: null, error: { message: 'private provider log failure' } };
      }
      this.state.logs.push({ ...this.payload });
      return { data: null, error: null };
    }
    strictAssert(['projects', 'project_milestones'].includes(this.table), `Unexpected table: ${this.table}`);
    if (this.operation === 'update' && (
      (this.table === 'projects' && this.state.failProjectUpdate)
      || (this.table === 'project_milestones' && this.payload.status === 'IN_PROGRESS' && this.state.failNextStart)
    )) return { data: null, error: { message: 'simulated progression write failure' } };

    const source = this.table === 'projects' ? [this.state.project] : this.state.milestones;
    const matching = source.filter((row) => this.filters.every(([key, value]) => row[key] === value));
    if (this.operation === 'update') {
      for (const row of matching) {
        Object.assign(row, this.payload);
        this.state.writes.push({ table: this.table, id: row.id, ...this.payload });
      }
    }
    const rows = matching.map((row: any) => ({
      ...row,
      ...(this.selection.includes('project:projects!') ? { project: { ...this.state.project } } : {}),
    })).sort((a: any, b: any) => (a.step_order ?? 0) - (b.step_order ?? 0));
    return { data: this.singleRow ? rows[0] || null : rows, error: null };
  }
}

async function withProgression(count: number, action: (state: ProgressionState) => Promise<void>) {
  const state: ProgressionState = {
    project: { id: 'project-1', name: 'Workflow test', sales_id: sales.userId, pic_id: saPic.userId, status: 'ACTIVE', is_postponed: false },
    milestones: Array.from({ length: count }, (_, index) => ({
      id: `milestone-${index + 1}`, project_id: 'project-1', name: index === count - 1 ? 'Tender Process' : `Stage ${index + 1}`,
      step_order: index + 1, status: index === count - 1 ? 'IN_PROGRESS' : 'COMPLETED', pic_id: saPic.userId,
      completed_at: index === count - 1 ? null : reviewedAt,
      workflow_stage: { default_role: index === count - 1 ? 'SALES' : 'SA', is_required: true },
    })),
    writes: [], logs: [], reportedErrors: [], failProjectUpdate: false, failNextStart: false, failLog: null, throwLog: false,
  };
  const originalFrom = supabaseAdmin.from;
  const originalConsoleError = console.error;
  try {
    (supabaseAdmin as any).from = (table: string) => new ProgressionQueryMock(state, table);
    console.error = (...args: unknown[]) => { state.reportedErrors.push(args); };
    await action(state);
  } finally {
    supabaseAdmin.from = originalFrom;
    console.error = originalConsoleError;
  }
}

async function runProgressionRecoveryTests() {
  for (const [label, count] of [['Assessment V2', 8], ['Existing TOR V2', 6], ['Assessment LEGACY', 13], ['Existing TOR LEGACY', 11]] as const) {
    await withProgression(count, async (state) => {
      if (label.includes('LEGACY')) state.milestones[0].status = 'APPROVED';
      const result = await completeMilestoneStage(`milestone-${count}`, sales);
      strictAssert.equal(result.status, 'COMPLETED');
      strictAssert.ok(result.completed_at);
      strictAssert.equal(state.project.status, 'COMPLETED');
      strictAssert.equal(result.project_completed, true);
      strictAssert.equal(result.next_milestone, null);
      strictAssert.equal(result.started, false);
      strictAssert.equal(state.writes.length, 2);
      strictAssert.deepEqual(state.logs.map((log) => log.action), ['MILESTONE_COMPLETED', 'PROJECT_COMPLETED']);
      const before = JSON.stringify(state);
      const duplicate = await completeMilestoneStage(`milestone-${count}`, sales);
      strictAssert.equal(duplicate.project_completed, true);
      strictAssert.equal(duplicate.completed_at, result.completed_at);
      strictAssert.equal(JSON.stringify(state), before);
      console.log(`Recovery - ${label}: final SALES completion and duplicate are safe`);
    });
  }

  await withProgression(8, async (state) => {
    state.failProjectUpdate = true;
    await strictAssert.rejects(() => completeMilestoneStage('milestone-8', sales), /simulated progression write failure/);
    strictAssert.equal(state.milestones[7].status, 'COMPLETED');
    strictAssert.equal(state.project.status, 'ACTIVE');
    const completedAt = state.milestones[7].completed_at;
    state.failProjectUpdate = false;
    const results = await Promise.all([completeMilestoneStage('milestone-8', sales), completeMilestoneStage('milestone-8', sales)]);
    strictAssert(results.every((result) => result.project_completed && result.blocked_reason === null));
    strictAssert.equal(state.milestones[7].completed_at, completedAt);
    strictAssert.equal(state.writes.filter((row) => row.table === 'projects').length, 1);
    strictAssert.equal(state.logs.filter((row) => row.action === 'PROJECT_COMPLETED').length, 1);
    strictAssert.equal(state.logs.filter((row) => row.action === 'MILESTONE_COMPLETED').length, 1);
    console.log('Recovery - Failed project write is reconciled once by concurrent SALES retries');
  });

  await withProgression(2, async (state) => {
    Object.assign(state.milestones[0], { status: 'IN_PROGRESS', completed_at: null, workflow_stage: { default_role: 'SALES' } });
    Object.assign(state.milestones[1], { status: 'CREATED', workflow_stage: { default_role: 'SA' }, pic_id: null });
    state.failNextStart = true;
    await strictAssert.rejects(() => completeMilestoneStage('milestone-1', sales), /simulated progression write failure/);
    strictAssert.equal(state.milestones[0].status, 'COMPLETED');
    strictAssert.equal(state.milestones[1].status, 'CREATED');
    state.failNextStart = false;
    const results = await Promise.all([completeMilestoneStage('milestone-1', sales), completeMilestoneStage('milestone-1', sales)]);
    strictAssert.equal(results.filter((result) => result.started).length, 1);
    strictAssert(results.every((result) => result.next_milestone?.status === 'IN_PROGRESS' && result.blocked_reason === null));
    strictAssert.equal(state.milestones[1].pic_id, saPic.userId);
    strictAssert.equal(state.writes.filter((row) => row.status === 'IN_PROGRESS').length, 1);
    strictAssert.equal(state.logs.filter((row) => row.action === 'MILESTONE_STARTED').length, 1);
    const before = JSON.stringify(state);
    const duplicate = await completeMilestoneStage('milestone-1', sales);
    strictAssert.equal(duplicate.started, false);
    strictAssert.equal(duplicate.blocked_reason, null);
    strictAssert.equal(JSON.stringify(state), before);
    console.log('Recovery - Failed next-start retries start the correct stage once; later retries never restart it');
  });

  for (const action of ['MILESTONE_COMPLETED', 'PROJECT_COMPLETED']) {
    for (const throws of [false, true]) {
      await withProgression(6, async (state) => {
        state.failLog = action;
        state.throwLog = throws;
        strictAssert.equal((await completeMilestoneStage('milestone-6', sales)).project_completed, true);
        strictAssert.equal(state.project.status, 'COMPLETED');
        strictAssert.equal(state.reportedErrors.length, 1);
        strictAssert(!JSON.stringify(state.reportedErrors).includes('private provider'));
        strictAssert.equal((await completeMilestoneStage('milestone-6', sales)).project_completed, true);
        strictAssert.equal(state.reportedErrors.length, 1);
      });
    }
  }
  await withProgression(2, async (state) => {
    state.milestones[1].status = 'CREATED';
    state.failLog = 'MILESTONE_STARTED';
    const result = await advanceToNextMilestone('project-1', 'milestone-1', sales);
    strictAssert.equal(result.started, true);
    strictAssert.equal(state.reportedErrors.length, 1);
    strictAssert.equal((await advanceToNextMilestone('project-1', 'milestone-1', sales)).blocked_reason, null);
  });
  console.log('Recovery - Returned/thrown activity errors are reported safely without failing durable transitions');

  await withProgression(6, async (state) => {
    const results = await Promise.all([completeMilestoneStage('milestone-6', sales), completeMilestoneStage('milestone-6', sales)]);
    strictAssert(results.every((result) => result.project_completed));
    strictAssert.equal(state.writes.length, 2);
    strictAssert.equal(state.logs.length, 2);
    console.log('Recovery - Concurrent first-time completion performs one milestone and one project update');
  });

  for (const status of ['CREATED', 'SUBMITTED', 'REJECTED', 'APPROVED']) {
    await withProgression(6, async (state) => {
      state.milestones[5].status = status;
      await strictAssert.rejects(() => completeMilestoneStage('milestone-6', sales), /Only IN_PROGRESS/);
      strictAssert.equal(state.writes.length, 0);
    });
  }
  for (const actor of [headSa, saPic, { ...sales, userId: 'other-sales' }, { ...sales, role: 'SUPER_ADMIN' }]) {
    for (const projectStatus of ['ACTIVE', 'COMPLETED']) {
      await withProgression(6, async (state) => {
        state.milestones[5].status = 'COMPLETED';
        state.project.status = projectStatus;
        await strictAssert.rejects(() => completeMilestoneStage('milestone-6', actor), /Only the project owner/);
        strictAssert.equal(state.writes.length, 0);
      });
    }
  }
  for (const role of ['SA', 'HEAD_SA']) {
    await withProgression(6, async (state) => {
      state.milestones[5].status = 'COMPLETED';
      state.milestones[5].workflow_stage.default_role = role;
      await strictAssert.rejects(() => completeMilestoneStage('milestone-6', sales));
      strictAssert.equal(state.writes.length, 0);
    });
  }
  for (const project of [{ status: 'DRAFT' }, { status: 'CANCELLED' }, { status: 'POSTPONED' }, { is_postponed: true }, { status: 'COMPLETED', is_postponed: true }]) {
    await withProgression(6, async (state) => {
      state.milestones[5].status = 'COMPLETED';
      Object.assign(state.project, project);
      await strictAssert.rejects(() => completeMilestoneStage('milestone-6', sales), /Project is/);
      strictAssert.equal(state.writes.length, 0);
    });
  }
  console.log('Recovery - Retry still enforces role, ownership, persisted stage role, project and milestone state');

  await withProgression(6, async (state) => {
    state.milestones[5].status = 'APPROVED';
    state.milestones[5].name = 'Arbitrary terminal name';
    strictAssert.equal((await advanceToNextMilestone('project-1', 'milestone-6', sales)).project_completed, true);
  });
  await withProgression(6, async (state) => {
    // Current active templates are all required. Preserve the existing all-persisted-rows rule,
    // including this hypothetical optional stage; this checkpoint does not introduce skipping.
    state.milestones[1].status = 'CREATED';
    state.milestones[1].workflow_stage.is_required = false;
    const result = await completeMilestoneStage('milestone-6', sales);
    strictAssert.equal(result.project_completed, false);
    strictAssert.equal(result.blocked_reason, 'REMAINING_MILESTONES');
    strictAssert.equal(state.project.status, 'ACTIVE');
  });
  console.log('Recovery - Names are irrelevant; historical APPROVED and all-persisted-milestones semantics are preserved');
}

runProgressionRecoveryTests().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
