import {
  AssignmentPhase5Service,
  assertAssignablePic,
  assertPicAssignmentActor,
  assertPicAssignmentChange,
  assertPicAssignmentProjectState,
} from './assignment-phase5.service';
import { supabaseAdmin } from '../config/supabase';
import * as workflowProgression from './workflow-progression.service';
import * as picAssignmentNotifications from './pic-assignment-notification.service';

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

const headSa = { userId: 'head-sa-1', role: 'HEAD_SA', fullName: 'Head SA Test' };
const sales = { userId: 'sales-1', role: 'SALES', fullName: 'Sales Test' };
const superAdmin = { userId: 'super-admin-1', role: 'SUPER_ADMIN', fullName: 'Super Admin Test' };
const activeProject = { pic_id: null, status: 'ACTIVE', is_postponed: false };
const activeSa = { id: 'sa-1', role: 'SA', is_active: true };
const activeHeadSa = { id: 'head-sa-1', role: 'HEAD_SA', is_active: true };

assertThrows('Test 1 - Non-HEAD_SA assignment', () => assertPicAssignmentActor(sales));
assertThrows('Test 1 - SUPER_ADMIN assignment', () => assertPicAssignmentActor(superAdmin));
assertThrows('Test 2 - Inactive SA assignment', () => assertAssignablePic({ ...activeSa, is_active: false }, headSa));
assertThrows('Test 3 - SALES target assignment', () => assertAssignablePic({ ...activeSa, role: 'SALES' }, headSa));
assertThrows('Test 4 - DRAFT project assignment', () =>
  assertPicAssignmentProjectState({ ...activeProject, status: 'DRAFT' })
);
assertThrows('Test 5 - POSTPONED project assignment', () =>
  assertPicAssignmentProjectState({ ...activeProject, status: 'POSTPONED', is_postponed: true })
);
assertThrows('Test 6 - COMPLETED project assignment', () =>
  assertPicAssignmentProjectState({ ...activeProject, status: 'COMPLETED' })
);

assertPicAssignmentActor(headSa);
assertPicAssignmentProjectState(activeProject);
assertAssignablePic(activeSa, headSa);
assertPicAssignmentChange(activeProject, activeSa.id);
console.log('Test 7 - ACTIVE project with active SA PIC: accepted');

assertThrows('Test 8 - Reassignment without reason', () =>
  assertPicAssignmentChange({ ...activeProject, pic_id: 'sa-old' }, activeSa.id)
);

assert(
  (() => {
    try {
      assertPicAssignmentProjectState({ ...activeProject, is_postponed: true });
      return false;
    } catch {
      return true;
    }
  })(),
  'Test 9: inconsistent ACTIVE + is_postponed=true must be rejected'
);
console.log('Test 9 - Inconsistent postponed state: rejected');

assertAssignablePic(activeHeadSa, headSa);
console.log('Test 10 - HEAD_SA can assign their own active account as PIC: accepted');

assertThrows('Test 11 - HEAD_SA cannot assign another HEAD_SA', () =>
  assertAssignablePic({ ...activeHeadSa, id: 'head-sa-2' }, headSa)
);
assertThrows('Test 12 - Inactive HEAD_SA self assignment', () =>
  assertAssignablePic({ ...activeHeadSa, is_active: false }, headSa)
);
assertThrows('Test 13 - SUPER_ADMIN target assignment', () =>
  assertAssignablePic({ ...activeHeadSa, id: superAdmin.userId, role: 'SUPER_ADMIN' }, headSa)
);

async function verifyAvailablePics(): Promise<void> {
  const originalFrom = supabaseAdmin.from;
  const calls: Array<[string, unknown]> = [];

  (supabaseAdmin as any).from = (table: string) => {
    assert(table === 'users', 'Test 14: available PICs must query users');
    const query: any = {
      select: () => query,
      eq: (field: string, value: unknown) => {
        calls.push([field, value]);
        return query;
      },
      or: (value: string) => {
        calls.push(['or', value]);
        return query;
      },
      order: () => Promise.resolve({ data: [], error: null }),
    };
    return query;
  };

  try {
    await AssignmentPhase5Service.availablePics(headSa);
    assert(calls.some(([field, value]) => field === 'is_active' && value === true), 'Test 14: available PICs must be active');
    assert(
      calls.some(([field, value]) => field === 'or' && value === 'role.eq.SA,and(role.eq.HEAD_SA,id.eq.head-sa-1)'),
      'Test 14: HEAD_SA list must include only active SAs and the actor themself'
    );

    calls.length = 0;
    await AssignmentPhase5Service.availablePics(superAdmin);
    assert(calls.some(([field, value]) => field === 'role' && value === 'SA'), 'Test 14: SUPER_ADMIN list must contain active SAs only');
    assert(!calls.some(([field]) => field === 'or'), 'Test 14: SUPER_ADMIN list must not include HEAD_SA users');
    console.log('Test 14 - Eligible PIC lists are actor-scoped: passed');
  } finally {
    (supabaseAdmin as any).from = originalFrom;
  }
}

type AssignmentTestState = {
  workflow_model: string;
  workflow_version: number;
  plan_status: string;
  failFirstMilestoneActivation?: boolean;
  project: Record<string, any>;
  users: Record<string, Record<string, any>>;
  stages: Array<Record<string, any>>;
  milestones: Array<Record<string, any>>;
  assignments: Array<Record<string, any>>;
  activityLogs: Array<Record<string, any>>;
  workflowProgressionCalls: number;
  notificationCalls: number;
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

function makeAssignmentTestState(
  workflow_model: string,
  workflow_version: number,
  options: {
    projectPicId?: string | null;
    firstMilestoneStatus?: string;
    planStatus?: string;
    failFirstMilestoneActivation?: boolean;
  } = {}
): AssignmentTestState {
  const isOperationalV2 = workflow_model === 'OPERATIONAL_V2' && workflow_version === 2;
  const users = {
    'sa-1': { id: 'sa-1', full_name: 'Solution Architect One', email: 'sa-1@example.com', role: 'SA', is_active: true },
    'sa-2': { id: 'sa-2', full_name: 'Solution Architect Two', email: 'sa-2@example.com', role: 'SA', is_active: true },
    'head-sa-1': { id: 'head-sa-1', full_name: 'Head SA Test', email: 'head-sa@example.com', role: 'HEAD_SA', is_active: true },
    'head-sa-2': { id: 'head-sa-2', full_name: 'Other Head SA', email: 'other-head-sa@example.com', role: 'HEAD_SA', is_active: true },
    'sales-1': { id: 'sales-1', full_name: 'Sales Test', email: 'sales@example.com', role: 'SALES', is_active: true },
  } as Record<string, Record<string, any>>;
  const projectPicId = options.projectPicId ?? null;
  const stages = isOperationalV2
    ? operationalV2StageNames.map((name, index) => ({
      id: `v2-stage-${index + 1}`,
      scenario_id: 'scenario-assignment-1',
      name,
      default_role: index === operationalV2StageNames.length - 1 ? 'SALES' : 'SA',
      is_active: true,
    }))
    : [
      { id: 'legacy-assign-stage', scenario_id: 'scenario-assignment-1', name: 'Assign PIC', default_role: 'HEAD_SA', is_active: true },
      { id: 'legacy-assessment-stage', scenario_id: 'scenario-assignment-1', name: 'Customer Assessment', default_role: 'SA', is_active: true },
    ];
  const milestones = isOperationalV2
    ? stages.map((stage, index) => ({
      id: `v2-milestone-${index + 1}`,
      project_id: 'project-assignment-1',
      workflow_stage_id: stage.id,
      name: stage.name,
      step_order: index + 1,
      status: index === 0 ? options.firstMilestoneStatus || 'CREATED' : 'CREATED',
      pic_id: stage.default_role === 'SA' ? projectPicId : null,
      updated_at: index === 0 ? '2026-09-01T00:00:00.000Z' : '2026-09-01T00:00:00.000Z',
    }))
    : [
      {
        id: 'legacy-assign-milestone',
        project_id: 'project-assignment-1',
        workflow_stage_id: 'legacy-assign-stage',
        name: 'Assign PIC',
        step_order: 1,
        status: 'IN_PROGRESS',
        pic_id: null,
        updated_at: '2026-09-01T00:00:00.000Z',
      },
      {
        id: 'legacy-assessment-milestone',
        project_id: 'project-assignment-1',
        workflow_stage_id: 'legacy-assessment-stage',
        name: 'Customer Assessment',
        step_order: 2,
        status: 'CREATED',
        pic_id: projectPicId,
        updated_at: '2026-09-01T00:00:00.000Z',
      },
    ];

  return {
    workflow_model,
    workflow_version,
    plan_status: options.planStatus || 'APPROVED',
    failFirstMilestoneActivation: options.failFirstMilestoneActivation,
    project: {
      id: 'project-assignment-1',
      name: 'Operational Assignment Test',
      scenario_id: 'scenario-assignment-1',
      pic_id: projectPicId,
      status: 'ACTIVE',
      is_postponed: false,
      pic: projectPicId ? users[projectPicId] : null,
    },
    users,
    stages,
    milestones,
    assignments: [],
    activityLogs: [],
    workflowProgressionCalls: 0,
    notificationCalls: 0,
  };
}

type AssignmentFilter =
  | { type: 'eq' | 'is'; column: string; value: unknown }
  | { type: 'in'; column: string; value: unknown[] }
  | { type: 'notIn'; column: string; value: string[] };

class AssignmentQueryMock {
  private operation: 'select' | 'update' | 'insert' | 'delete' = 'select';
  private payload: Record<string, any> = {};
  private readonly filters: AssignmentFilter[] = [];

  constructor(private readonly state: AssignmentTestState, private readonly table: string) {}

  select(): this { return this; }
  update(payload: Record<string, any>): this { this.operation = 'update'; this.payload = payload; return this; }
  insert(payload: Record<string, any>): this { this.operation = 'insert'; this.payload = payload; return this; }
  delete(): this { this.operation = 'delete'; return this; }
  eq(column: string, value: unknown): this { this.filters.push({ type: 'eq', column, value }); return this; }
  is(column: string, value: unknown): this { this.filters.push({ type: 'is', column, value }); return this; }
  in(column: string, value: unknown[]): this { this.filters.push({ type: 'in', column, value }); return this; }
  not(column: string, operator: string, value: string): this {
    const values = operator === 'in'
      ? value.replace(/^\(/, '').replace(/\)$/, '').split(',')
      : [];
    this.filters.push({ type: 'notIn', column, value: values });
    return this;
  }
  order(): this { return this; }
  limit(): this { return this; }
  single(): Promise<{ data: any; error: any }> { return Promise.resolve(this.unwrapSingle()); }
  maybeSingle(): Promise<{ data: any; error: any }> { return Promise.resolve(this.unwrapSingle()); }
  then<TResult1 = { data: any; error: any }, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private unwrapSingle(): { data: any; error: any } {
    const result = this.execute();
    return { ...result, data: Array.isArray(result.data) ? result.data[0] || null : result.data };
  }

  private matches(row: Record<string, any>): boolean {
    return this.filters.every((filter) => {
      if (filter.type === 'in') return filter.value.includes(row[filter.column]);
      if (filter.type === 'notIn') return !filter.value.includes(row[filter.column]);
      return row[filter.column] === filter.value;
    });
  }

  private execute(): { data: any; error: any } {
    if (this.table === 'scenarios') {
      return { data: { workflow_model: this.state.workflow_model, workflow_version: this.state.workflow_version }, error: null };
    }

    if (this.table === 'project_plan_approvals') {
      const approval = { id: 'plan-approval-1', project_id: this.state.project.id, status: this.state.plan_status };
      return { data: this.matches(approval) ? approval : null, error: null };
    }

    if (this.table === 'projects') {
      if (this.operation !== 'update') return { data: { ...this.state.project }, error: null };
      if (!this.matches(this.state.project)) return { data: null, error: null };
      Object.assign(this.state.project, this.payload);
      return { data: { id: this.state.project.id }, error: null };
    }

    if (this.table === 'users') {
      const user = Object.values(this.state.users).find((item) => this.matches(item));
      return { data: user ? { ...user } : null, error: null };
    }

    if (this.table === 'workflow_stages') {
      return { data: this.state.stages.filter((stage) => this.matches(stage)).map((stage) => ({ ...stage })), error: null };
    }

    if (this.table === 'project_milestones') {
      const matched = this.state.milestones.filter((milestone) => this.matches(milestone));
      if (this.operation !== 'update') return { data: matched.map((milestone) => ({ ...milestone })), error: null };
      const activatingFirstMilestone = this.payload.status === 'IN_PROGRESS' && matched.some((milestone) => milestone.step_order === 1);
      if (activatingFirstMilestone && this.state.failFirstMilestoneActivation) {
        return { data: null, error: { message: 'simulated first-milestone activation failure' } };
      }
      matched.forEach((milestone) => Object.assign(milestone, this.payload));
      return { data: matched.map((milestone) => ({ ...milestone })), error: null };
    }

    if (this.table === 'project_assignments') {
      if (this.operation === 'insert') {
        const history = {
          id: `assignment-${this.state.assignments.length + 1}`,
          ...this.payload,
          created_at: '2026-09-01T00:00:00.000Z',
          pic: this.state.users[this.payload.pic_id],
          previous_pic: this.payload.previous_pic_id ? this.state.users[this.payload.previous_pic_id] : null,
          assigned_by_user: this.state.users[this.payload.assigned_by],
        };
        this.state.assignments.push(history);
        return { data: { ...history }, error: null };
      }
      if (this.operation === 'delete') {
        const before = this.state.assignments.length;
        this.state.assignments = this.state.assignments.filter((history) => !this.matches(history));
        return { data: before === this.state.assignments.length ? null : { id: 'deleted' }, error: null };
      }
      return { data: this.state.assignments.filter((history) => this.matches(history)).map((history) => ({ ...history })), error: null };
    }

    if (this.table === 'activity_logs') {
      if (this.operation === 'insert') this.state.activityLogs.push({ ...this.payload });
      return { data: null, error: null };
    }

    return { data: null, error: null };
  }
}

async function withAssignmentTestState(
  state: AssignmentTestState,
  action: () => Promise<void>
): Promise<void> {
  const originalFrom = supabaseAdmin.from;
  const originalCompleteAssignPicStage = workflowProgression.completeAssignPicStageIfCurrent;
  const originalNotifyPicAssignment = picAssignmentNotifications.notifyPicAssignment;

  try {
    (supabaseAdmin as any).from = (table: string) => new AssignmentQueryMock(state, table);
    (workflowProgression as any).completeAssignPicStageIfCurrent = async () => {
      state.workflowProgressionCalls += 1;
      return { completed: true, progression: null };
    };
    (picAssignmentNotifications as any).notifyPicAssignment = async () => {
      state.notificationCalls += 1;
    };
    await action();
  } finally {
    (supabaseAdmin as any).from = originalFrom;
    (workflowProgression as any).completeAssignPicStageIfCurrent = originalCompleteAssignPicStage;
    (picAssignmentNotifications as any).notifyPicAssignment = originalNotifyPicAssignment;
  }
}

async function expectAssignmentFailure(action: () => Promise<unknown>, message: string): Promise<void> {
  try {
    await action();
    throw new Error(`Expected assignment failure: ${message}`);
  } catch (error) {
    assert(error instanceof Error && error.message === message, `Expected assignment failure message: ${message}`);
  }
}

async function runWorkflowModelAssignmentTests(): Promise<void> {
  const legacyState = makeAssignmentTestState('LEGACY', 1);
  await withAssignmentTestState(legacyState, async () => {
    await AssignmentPhase5Service.assign(legacyState.project.id, 'sa-1', undefined, headSa);
    assert(legacyState.project.pic_id === 'sa-1', 'Test 15: legacy assignment must update the project PIC');
    assert(legacyState.milestones[1].pic_id === 'sa-1', 'Test 15: legacy assignment must propagate the SA PIC');
    assert(legacyState.workflowProgressionCalls === 1, 'Test 15: legacy assignment must retain Assign PIC progression');
    assert(legacyState.notificationCalls === 1 && legacyState.assignments.length === 1, 'Test 15: legacy assignment must retain history and notification');
  });
  console.log('Test 15 - LEGACY assignment retains PIC propagation, Assign PIC progression, history, and notification: passed');

  const v2State = makeAssignmentTestState('OPERATIONAL_V2', 2);
  await withAssignmentTestState(v2State, async () => {
    await AssignmentPhase5Service.assign(v2State.project.id, 'sa-1', undefined, headSa);
    const first = v2State.milestones[0];
    assert(v2State.project.pic_id === 'sa-1' && v2State.assignments.length === 1, 'Test 16: V2 assignment must update project PIC and history');
    assert(first.status === 'IN_PROGRESS' && first.pic_id === 'sa-1', 'Test 16: V2 Customer Assessment must start once with the selected PIC');
    assert(v2State.milestones.slice(1, 7).every((milestone) => milestone.status === 'CREATED' && milestone.pic_id === 'sa-1'), 'Test 16: V2 SA stages must remain CREATED and receive the PIC');
    assert(v2State.milestones[7].status === 'CREATED' && v2State.milestones[7].pic_id === null, 'Test 16: V2 SALES stage must not receive a PIC');
    assert(v2State.activityLogs[0]?.action === 'PIC_ASSIGNED', 'Test 16: V2 assignment must retain the activity log');
    assert(v2State.workflowProgressionCalls === 0 && v2State.notificationCalls === 1, 'Test 16: V2 must not invoke legacy Assign PIC progression and must notify');
  });
  console.log('Test 16 - OPERATIONAL_V2 assignment starts Customer Assessment exactly once without legacy progression: passed');

  const selfPicV2State = makeAssignmentTestState('OPERATIONAL_V2', 2);
  await withAssignmentTestState(selfPicV2State, async () => {
    await AssignmentPhase5Service.assign(selfPicV2State.project.id, headSa.userId, undefined, headSa);
    assert(selfPicV2State.project.pic_id === headSa.userId && selfPicV2State.milestones[0].pic_id === headSa.userId, 'Test 17: HEAD_SA self-PIC must be persisted and start Customer Assessment');
    assert(selfPicV2State.workflowProgressionCalls === 0, 'Test 17: HEAD_SA self-PIC must not invoke legacy progression');
  });
  console.log('Test 17 - OPERATIONAL_V2 permits the active HEAD_SA to assign themself as PIC: passed');

  const reassignmentState = makeAssignmentTestState('OPERATIONAL_V2', 2, {
    projectPicId: 'sa-1',
    firstMilestoneStatus: 'IN_PROGRESS',
  });
  const firstMilestoneUpdatedAt = reassignmentState.milestones[0].updated_at;
  await withAssignmentTestState(reassignmentState, async () => {
    await AssignmentPhase5Service.assign(reassignmentState.project.id, 'sa-2', 'Capacity change', headSa);
    assert(reassignmentState.project.pic_id === 'sa-2' && reassignmentState.assignments[0].assignment_type === 'REASSIGNMENT', 'Test 18: V2 reassignment must update trusted PIC and history');
    assert(reassignmentState.milestones[0].status === 'IN_PROGRESS' && reassignmentState.milestones[0].updated_at === firstMilestoneUpdatedAt, 'Test 18: V2 reassignment must not restart or reset Customer Assessment');
    assert(reassignmentState.milestones[0].pic_id === 'sa-2' && reassignmentState.workflowProgressionCalls === 0, 'Test 18: V2 reassignment must transfer the PIC without legacy progression');
  });
  console.log('Test 18 - OPERATIONAL_V2 reassignment updates PIC without restarting Customer Assessment: passed');

  const unapprovedPlanState = makeAssignmentTestState('OPERATIONAL_V2', 2, { planStatus: 'PENDING' });
  await withAssignmentTestState(unapprovedPlanState, async () => {
    await expectAssignmentFailure(
      () => AssignmentPhase5Service.assign(unapprovedPlanState.project.id, 'sa-1', undefined, headSa),
      'Project plan must be approved before assigning a V2 PIC.'
    );
    assert(unapprovedPlanState.project.pic_id === null && unapprovedPlanState.assignments.length === 0, 'Test 19: unapproved V2 plan must not mutate PIC or history');
  });
  console.log('Test 19 - OPERATIONAL_V2 assignment requires the latest project plan approval to be APPROVED: passed');

  const unsupportedState = makeAssignmentTestState('UNSUPPORTED', 99);
  await withAssignmentTestState(unsupportedState, async () => {
    await expectAssignmentFailure(
      () => AssignmentPhase5Service.assign(unsupportedState.project.id, 'sa-1', undefined, headSa),
      'Unsupported scenario workflow model/version.'
    );
    assert(unsupportedState.project.pic_id === null && unsupportedState.assignments.length === 0, 'Test 20: unsupported model must not fall back to legacy assignment');
  });
  console.log('Test 20 - Unsupported scenario workflow model/version rejects without assignment mutation: passed');

  const failedActivationState = makeAssignmentTestState('OPERATIONAL_V2', 2, { failFirstMilestoneActivation: true });
  await withAssignmentTestState(failedActivationState, async () => {
    await expectAssignmentFailure(
      () => AssignmentPhase5Service.assign(failedActivationState.project.id, 'sa-1', undefined, headSa),
      'Failed to start the first Operational V2 milestone.'
    );
    assert(failedActivationState.project.pic_id === null && failedActivationState.assignments.length === 0, 'Test 21: failed V2 activation must restore project PIC and assignment history');
    assert(failedActivationState.milestones.every((milestone) => milestone.status === 'CREATED' && milestone.pic_id === null), 'Test 21: failed V2 activation must restore milestone PIC propagation');
    assert(failedActivationState.workflowProgressionCalls === 0 && failedActivationState.notificationCalls === 0, 'Test 21: failed V2 activation must not progress or notify success');
  });
  console.log('Test 21 - Failed V2 Customer Assessment activation compensates PIC and history mutations: passed');
}

async function run(): Promise<void> {
  await verifyAvailablePics();
  await runWorkflowModelAssignmentTests();
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
