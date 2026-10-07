import {
  assertDraftProject,
  assertNoPendingProjectPlanApproval,
  assertProjectPlanApprovalProgressionState,
  assertOperationalV2ApprovalPic,
  assertSalesOwner,
  buildInitialTimelineUpdate,
  buildRejectedProjectPlanReviewResult,
  hasValidInitialTimeline,
  ProjectPlanApprovalService,
} from './project-plan-approval.service';
import { supabaseAdmin } from '../config/supabase';
import { DeadlineService } from './deadline.service';
import * as projectPlanNotifications from './project-plan-notification.service';
import * as picAssignmentNotifications from './pic-assignment-notification.service';
import * as workflowProgression from './workflow-progression.service';

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

const assertThrows = (name: string, action: () => void): void => {
  try {
    action();
  } catch {
    console.log(`${name}: rejected`);
    return;
  }

  throw new Error(`${name}: expected rejection`);
};

const salesOwner = { userId: 'sales-1', role: 'SALES', fullName: 'Sales Owner' };
const ownerProject = {
  id: 'project-1',
  name: 'Project Test',
  customer: 'Customer Test',
  scenario_id: 'scenario-1',
  sales_id: 'sales-1',
  pic_id: null,
  status: 'DRAFT',
  is_postponed: false,
};
const executableMilestone = {
  id: 'milestone-3',
  project_id: 'project-1',
  name: 'Assessment',
  step_order: 3,
  status: 'CREATED',
  start_date: '2026-09-01',
  duration_working_days: 3,
  due_date: '2026-09-03',
};
const setDeadlineMilestone = { ...executableMilestone, id: 'milestone-2', name: 'Set Deadline', step_order: 2, status: 'IN_PROGRESS' };

assertSalesOwner(ownerProject, salesOwner);
assertThrows('Test 1 - Non-owner SALES cannot manage plan', () =>
  assertSalesOwner(ownerProject, { userId: 'sales-2', role: 'SALES', fullName: 'Other Sales' })
);
assertDraftProject(ownerProject);
assertThrows('Test 2 - Non-DRAFT project cannot change plan', () =>
  assertDraftProject({ ...ownerProject, status: 'ACTIVE' })
);
assert(hasValidInitialTimeline([setDeadlineMilestone, executableMilestone]), 'Test 3: complete executable timeline should be valid');
console.log('Test 3 - Full executable timeline required: complete timeline accepted');
assert(!hasValidInitialTimeline([{ ...executableMilestone, due_date: null }]), 'Test 4: incomplete timeline should be invalid');
console.log('Test 4 - Incomplete executable timeline: rejected');
assertThrows('Test 5 - Planning milestone cannot be edited', () =>
  buildInitialTimelineUpdate(setDeadlineMilestone, {
    start_date: '2026-09-01',
    duration_working_days: 3,
    due_date: '2026-09-03',
  })
);
assertThrows('Test 6 - Duplicate pending approval', () =>
  assertNoPendingProjectPlanApproval(true, 'A project plan approval is already pending.')
);

const rejected = buildRejectedProjectPlanReviewResult(ownerProject.status);
assert(rejected.project_status === 'DRAFT' && rejected.next_milestone === null, 'Test 7: rejection must keep project DRAFT');
console.log('Test 7 - Rejected plan remains DRAFT: passed');

assertProjectPlanApprovalProgressionState(ownerProject, setDeadlineMilestone);
console.log('Test 8 - APPROVED plan prerequisites: DRAFT plus IN_PROGRESS Set Deadline accepted');
assertThrows('Test 9 - Set Deadline must be IN_PROGRESS', () =>
  assertProjectPlanApprovalProgressionState(ownerProject, { ...setDeadlineMilestone, status: 'COMPLETED' })
);
assertThrows('Test 10 - Approval progression requires DRAFT project', () =>
  assertProjectPlanApprovalProgressionState({ ...ownerProject, status: 'ACTIVE' }, setDeadlineMilestone)
);

type ReviewTestState = {
  workflow_model: string;
  workflow_version: number;
  failProjectActivation?: boolean;
  failMilestoneAssignment?: boolean;
  project: Record<string, any>;
  milestones: Array<Record<string, any>>;
  workflowStages: Array<Record<string, any>>;
  selectedPic: Record<string, any>;
  approval: Record<string, any>;
  assignments: Array<Record<string, any>>;
  activityLogs: Array<Record<string, any>>;
  milestoneUpdateCount: number;
  progressionCalls: number;
  approvalNotificationCalls: number;
  rejectionNotificationCalls: number;
  picNotificationCalls: number;
};

const headSa = { userId: 'head-sa-1', role: 'HEAD_SA', fullName: 'Head SA Test' };
const plannedDate = {
  start_date: '2026-09-01',
  duration_working_days: 3,
  due_date: '2026-09-03',
};
const operationalV2StageNames = [
  'Customer Assessment',
  'Assessment Report',
  'Requirement Gathering',
  'Pain Point Analysis',
  'Proposal Solution',
  'Deliverables',
  'Technical Proposal & BOQ',
  'Tender Process',
];

function makeReviewTestState(
  workflow_model: string,
  workflow_version: number,
  failProjectActivation = false,
  selectedPic: Record<string, any> = {
    id: 'sa-1',
    full_name: 'Solution Architect Test',
    email: 'sa@test.com',
    role: 'SA',
    is_active: true,
  }
): ReviewTestState {
  const isV2 = workflow_model === 'OPERATIONAL_V2' && workflow_version === 2;
  const milestones = isV2
    ? operationalV2StageNames.map((name, index) => ({
      id: `v2-milestone-${index + 1}`,
      project_id: 'project-review-1',
      workflow_stage_id: `v2-stage-${index + 1}`,
      name,
      step_order: index + 1,
      status: 'CREATED',
      pic_id: null,
      ...plannedDate,
    }))
    : [
      { id: 'legacy-milestone-1', project_id: 'project-review-1', workflow_stage_id: 'legacy-stage-1', name: 'Create Project', step_order: 1, status: 'COMPLETED', pic_id: null, start_date: null, duration_working_days: null, due_date: null },
      { id: 'legacy-milestone-2', project_id: 'project-review-1', workflow_stage_id: 'legacy-stage-2', name: 'Set Deadline', step_order: 2, status: 'IN_PROGRESS', pic_id: null, start_date: null, duration_working_days: null, due_date: null },
      { id: 'legacy-milestone-3', project_id: 'project-review-1', workflow_stage_id: 'legacy-stage-3', name: 'Customer Assessment', step_order: 3, status: 'CREATED', pic_id: null, ...plannedDate },
    ];

  return {
    workflow_model,
    workflow_version,
    failProjectActivation,
    project: {
      id: 'project-review-1',
      name: 'Project Plan Review Test',
      customer: 'Customer Test',
      scenario_id: 'scenario-review-1',
      sales_id: salesOwner.userId,
      pic_id: null,
      status: 'DRAFT',
      is_postponed: false,
    },
    milestones,
    workflowStages: isV2
      ? operationalV2StageNames.map((name, index) => ({
          id: `v2-stage-${index + 1}`,
          scenario_id: 'scenario-review-1',
          name,
          default_role: index === operationalV2StageNames.length - 1 ? 'SALES' : 'SA',
          is_active: true,
        }))
      : [],
    selectedPic,
    approval: {
      id: 'plan-approval-1',
      project_id: 'project-review-1',
      requested_by: salesOwner.userId,
      status: 'PENDING',
      request_note: null,
      reviewed_by: null,
      review_note: null,
      submitted_at: '2026-09-01T00:00:00.000Z',
      reviewed_at: null,
      created_at: '2026-09-01T00:00:00.000Z',
      updated_at: '2026-09-01T00:00:00.000Z',
    },
    assignments: [],
    activityLogs: [],
    milestoneUpdateCount: 0,
    progressionCalls: 0,
    approvalNotificationCalls: 0,
    rejectionNotificationCalls: 0,
    picNotificationCalls: 0,
  };
}

class ReviewQueryMock {
  private operation: 'select' | 'update' | 'insert' | 'delete' = 'select';
  private payload: any = {};
  private readonly filters: Array<{ operator: 'eq' | 'in' | 'is'; column: string; value: any }> = [];

  constructor(private readonly state: ReviewTestState, private readonly table: string) {}

  select(): this { return this; }
  update(payload: Record<string, any>): this { this.operation = 'update'; this.payload = payload; return this; }
  insert(payload: Record<string, any> | Array<Record<string, any>>): this { this.operation = 'insert'; this.payload = payload; return this; }
  delete(): this { this.operation = 'delete'; return this; }
  eq(column: string, value: unknown): this { this.filters.push({ operator: 'eq', column, value }); return this; }
  is(column: string, value: unknown): this { this.filters.push({ operator: 'is', column, value }); return this; }
  in(column: string, value: unknown[]): this { this.filters.push({ operator: 'in', column, value }); return this; }
  order(): this { return this; }
  limit(): this { return this; }
  single(): Promise<{ data: any; error: any }> { return Promise.resolve(this.execute(true)); }
  maybeSingle(): Promise<{ data: any; error: any }> { return Promise.resolve(this.execute(true)); }
  then<TResult1 = { data: any; error: any }, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.execute(false)).then(onfulfilled, onrejected);
  }

  private matches(row: Record<string, any>): boolean {
    return this.filters.every((filter) => {
      if (filter.operator === 'in') return filter.value.includes(row[filter.column]);
      return row[filter.column] === filter.value;
    });
  }

  private execute(single: boolean): { data: any; error: any } {
    if (this.table === 'scenarios') {
      return {
        data: { workflow_model: this.state.workflow_model, workflow_version: this.state.workflow_version },
        error: null,
      };
    }

    if (this.table === 'users') {
      const user = this.matches(this.state.selectedPic) ? { ...this.state.selectedPic } : null;
      return { data: single ? user : user ? [user] : [], error: null };
    }

    if (this.table === 'workflow_stages') {
      const stages = this.state.workflowStages.filter((stage) => this.matches(stage)).map((stage) => ({ ...stage }));
      return { data: single ? stages[0] || null : stages, error: null };
    }

    if (this.table === 'projects') {
      if (this.operation !== 'update') return { data: { ...this.state.project }, error: null };
      if (!this.matches(this.state.project)) return { data: null, error: null };
      if (this.state.failProjectActivation && this.payload.status === 'ACTIVE') {
        return { data: null, error: { message: 'Project activation failed.' } };
      }
      Object.assign(this.state.project, this.payload);
      return { data: { id: this.state.project.id, status: this.state.project.status, pic_id: this.state.project.pic_id }, error: null };
    }

    if (this.table === 'project_milestones') {
      const matches = this.state.milestones.filter((item) => this.matches(item));
      if (this.operation !== 'update') {
        const data = matches.map((milestone) => ({ ...milestone }));
        return { data: single ? data[0] || null : data, error: null };
      }
      if (this.state.failMilestoneAssignment && this.payload.pic_id && !this.payload.status) {
        return { data: single ? null : [], error: { message: 'Milestone assignment failed.' } };
      }
      for (const milestone of matches) {
        this.state.milestoneUpdateCount += 1;
        Object.assign(milestone, this.payload);
      }
      const data = matches.map((milestone) => ({ ...milestone }));
      return { data: single ? data[0] || null : data, error: null };
    }

    if (this.table === 'project_plan_approvals') {
      if (this.operation !== 'update') {
        return { data: this.matches(this.state.approval) ? { ...this.state.approval } : null, error: null };
      }
      if (!this.matches(this.state.approval)) return { data: null, error: null };
      Object.assign(this.state.approval, this.payload);
      return { data: { ...this.state.approval }, error: null };
    }

    if (this.table === 'project_assignments') {
      if (this.operation === 'insert') {
        const assignment = { id: `assignment-${this.state.assignments.length + 1}`, created_at: new Date().toISOString(), ...this.payload };
        this.state.assignments.push(assignment);
        return { data: { ...assignment }, error: null };
      }
      if (this.operation === 'delete') {
        const index = this.state.assignments.findIndex((assignment) => this.matches(assignment));
        if (index < 0) return { data: single ? null : [], error: null };
        const [assignment] = this.state.assignments.splice(index, 1);
        return { data: single ? { id: assignment.id } : [{ id: assignment.id }], error: null };
      }
      const assignments = this.state.assignments.filter((assignment) => this.matches(assignment));
      return { data: single ? assignments[0] || null : assignments, error: null };
    }

    if (this.table === 'activity_logs') {
      if (this.operation === 'insert') {
        const entries = Array.isArray(this.payload) ? this.payload : [this.payload];
        this.state.activityLogs.push(...entries.map((entry) => ({ ...entry })));
      }
      return { data: null, error: null };
    }

    return { data: null, error: null };
  }
}

async function withReviewTestState(
  state: ReviewTestState,
  action: () => Promise<void>
): Promise<void> {
  const originalFrom = supabaseAdmin.from;
  const originalRpc = supabaseAdmin.rpc;
  const originalCalculateDeadline = DeadlineService.calculateDeadline;
  const originalAdvance = workflowProgression.advanceToNextMilestone;
  const originalNotifyApproved = projectPlanNotifications.notifyProjectPlanApproved;
  const originalNotifyRejected = projectPlanNotifications.notifyProjectPlanRejected;
  const originalNotifyPicAssignment = picAssignmentNotifications.notifyPicAssignment;

  try {
    state.project.updated_at='2026-09-01T00:00:00.000Z';
    (supabaseAdmin as any).from = (table: string) => new ReviewQueryMock(state, table);
    (supabaseAdmin as any).rpc = async (name:string,args:any) => {
      if (name!=='mutate_project_business' || args.p_action!=='LEGACY_PLAN_REVIEW') throw new Error('Unexpected RPC');
      if (state.failProjectActivation) return {data:null,error:{code:'XX000'}};
      const decision=args.p_payload.decision,stage=state.milestones[1];
      if(decision==='APPROVED'){stage.status='COMPLETED';state.project.status='ACTIVE';state.milestoneUpdateCount++;}
      state.approval.status=decision;state.activityLogs.push({action:'PROJECT_PLAN_'+decision});
      return {data:{value:{...state.approval,project_status:state.project.status,set_deadline_milestone:{...stage}},replayed:false},error:null};
    };
    (DeadlineService as any).calculateDeadline = async (startDate: string, durationWorkingDays: number) => ({
      start_date: startDate,
      duration_working_days: durationWorkingDays,
      due_date: plannedDate.due_date,
    });
    (workflowProgression as any).advanceToNextMilestone = async () => {
      state.progressionCalls += 1;
      return { next_milestone: { id: 'legacy-milestone-3', status: 'IN_PROGRESS' }, started: true, project_completed: false, blocked_reason: null };
    };
    (projectPlanNotifications as any).notifyProjectPlanApproved = async () => {
      state.approvalNotificationCalls += 1;
    };
    (projectPlanNotifications as any).notifyProjectPlanRejected = async () => {
      state.rejectionNotificationCalls += 1;
    };
    (picAssignmentNotifications as any).notifyPicAssignment = async () => {
      state.picNotificationCalls += 1;
    };

    await action();
  } finally {
    (supabaseAdmin as any).from = originalFrom;
    supabaseAdmin.rpc = originalRpc;
    (DeadlineService as any).calculateDeadline = originalCalculateDeadline;
    (workflowProgression as any).advanceToNextMilestone = originalAdvance;
    (projectPlanNotifications as any).notifyProjectPlanApproved = originalNotifyApproved;
    (projectPlanNotifications as any).notifyProjectPlanRejected = originalNotifyRejected;
    (picAssignmentNotifications as any).notifyPicAssignment = originalNotifyPicAssignment;
  }
}

async function expectApprovalFailure(action: () => Promise<unknown>, message: string): Promise<void> {
  try {
    await action();
    throw new Error(`Expected approval failure: ${message}`);
  } catch (error) {
    assert(error instanceof Error && error.message === message, `Expected approval failure message: ${message}`);
  }
}

async function runWorkflowModelApprovalTests(): Promise<void> {
  const v2TimelineUpdate = buildInitialTimelineUpdate(
    { ...executableMilestone, step_order: 1, status: 'CREATED' },
    plannedDate,
    'OPERATIONAL_V2'
  );
  assert(v2TimelineUpdate.id === executableMilestone.id, 'Test 11: V2 planning must allow Customer Assessment timeline data');
  assert(
    hasValidInitialTimeline([{ ...executableMilestone, step_order: 1, status: 'CREATED', ...plannedDate }], 'OPERATIONAL_V2'),
    'Test 11: V2 timeline validation must include operational step one'
  );
  console.log('Test 11 - OPERATIONAL_V2 timeline planning includes every operational milestone: passed');

  const legacyState = makeReviewTestState('LEGACY', 1);
  await withReviewTestState(legacyState, async () => {
    const result = await ProjectPlanApprovalService.approve(legacyState.project.id, {}, headSa);
    assert(result.project_status === 'ACTIVE', 'Test 12: legacy approval must activate the project');
    assert(legacyState.milestones[1].status === 'COMPLETED', 'Test 12: legacy approval must complete Set Deadline');
    assert(legacyState.milestoneUpdateCount === 1 && legacyState.progressionCalls === 1, 'Test 12: legacy approval must retain progression behavior');
    assert(legacyState.approval.status === 'APPROVED' && legacyState.approvalNotificationCalls === 1, 'Test 12: legacy approval must finalize approval and notify SALES');
  });
  console.log('Test 12 - LEGACY approval completes Set Deadline, activates the project, and progresses unchanged: passed');
  const rejectedState = makeReviewTestState('LEGACY', 1, true);
  await withReviewTestState(rejectedState, async () => {
    let failed=false;try { await ProjectPlanApprovalService.approve(rejectedState.project.id, {}, headSa); } catch { failed=true; }
    assert(failed, 'An atomic RPC failure must fail the review');
    assert(rejectedState.project.status==='DRAFT' && rejectedState.approval.status==='PENDING' && rejectedState.milestones[1].status==='IN_PROGRESS', 'RPC failure must not fall back to independent metadata writes');
    assert(rejectedState.activityLogs.length===0 && rejectedState.progressionCalls===0 && rejectedState.approvalNotificationCalls===0, 'Failed review must not log success, progress or notify');
  });

  assertThrows('Test 13 - OPERATIONAL_V2 approval requires a PIC', () =>
    assertOperationalV2ApprovalPic('OPERATIONAL_V2')
  );
  assertOperationalV2ApprovalPic('LEGACY');
  console.log('Test 13 - PIC is required only for OPERATIONAL_V2 approval: passed');

  // V2's former compensation/write-call fixtures are superseded by the RPC
  // contract tests in pic-assignment-atomic.test.ts. Preserve legacy workflow
  // coverage here; do not assert the removed non-transactional implementation.
  const unsupportedState = makeReviewTestState('UNSUPPORTED', 99);
  await withReviewTestState(unsupportedState, async () => {
    await expectApprovalFailure(() => ProjectPlanApprovalService.approve(unsupportedState.project.id, {}, headSa), 'Unsupported scenario workflow model/version.');
    assert(unsupportedState.project.status === 'DRAFT' && unsupportedState.approval.status === 'PENDING', 'Unsupported workflow must not mutate');
  });
}
runWorkflowModelApprovalTests().catch(error => { console.error(error); process.exitCode = 1; });
