import assert from 'node:assert/strict';
import { supabaseAdmin } from '../config/supabase';
import { ProjectPlanApprovalService } from './project-plan-approval.service';
import { DeadlineService } from './deadline.service';
import * as notifications from './project-plan-notification.service';
import * as picNotifications from './pic-assignment-notification.service';
import { rejectProjectPlanSchema } from '../validators/project-plan.validator';

async function main() {
  const from = supabaseAdmin.from, rpc = supabaseAdmin.rpc, deadline = DeadlineService.calculateDeadline;
  const approvedNotification = notifications.notifyProjectPlanApproved, rejectedNotification = notifications.notifyProjectPlanRejected;
  const picNotification = picNotifications.notifyPicAssignment;
  const project: any = { id: 'p', name: 'Project', customer: 'Customer', sales_id: 'sales', pic_id: null,
    scenario_id: 's-pra', current_scenario_id: 's-tender', active_phase_id: 'tender', status: 'DRAFT', is_postponed: false };
  const oldPlan = { id: 'old-plan', project_id: 'p', phase_id: 'pra', status: 'APPROVED' };
  const pending = { id: 'current-plan', project_id: 'p', phase_id: 'tender', status: 'PENDING' };
  const oldMilestone = { id: 'old', project_id: 'p', phase_id: 'pra', status: 'COMPLETED', step_order: 1,
    start_date: '2026-01-01', duration_working_days: 2, due_date: '2026-01-02' };
  const milestone = { id: 'current', project_id: 'p', phase_id: 'tender', status: 'CREATED', step_order: 2,
    start_date: '2026-10-06', duration_working_days: 1, due_date: '2026-10-06' };
  let rpcCalls = 0, notices = 0, fail = false;
  try {
    (notifications as any).notifyProjectPlanApproved = async () => { notices++; };
    (notifications as any).notifyProjectPlanRejected = async () => { notices++; };
    (picNotifications as any).notifyPicAssignment = async () => {};
    (DeadlineService as any).calculateDeadline = async (start: string) => {
      assert.equal(start, milestone.start_date, 'Previous phase schedule is excluded from new plan validation');
      return { due_date: milestone.due_date };
    };
    (supabaseAdmin as any).from = (table: string) => {
      const filters: Array<[string, any]> = [];
      const source = table === 'projects' ? [project] : table === 'scenarios' ? [{ id: 's-tender', workflow_model: 'OPERATIONAL_V2', workflow_version: 2 }]
        : table === 'project_plan_approvals' ? [oldPlan, pending] : table === 'project_milestones' ? [oldMilestone, milestone] : [];
      const value = (single = false) => { const rows = source.filter(row => filters.every(([key, expected]) => (row as any)[key] === expected)); return { data: single ? rows[0] || null : rows, error: null }; };
      const q: any = { select: () => q, eq: (key: string, expected: any) => { filters.push([key, expected]); return q; },
        order: () => q, limit: () => q, single: async () => value(true), maybeSingle: async () => value(true),
        insert: () => q, then: (resolve: any) => Promise.resolve(value()).then(resolve) }; return q;
    };
    (supabaseAdmin as any).rpc = async (name: string, args: any) => {
      rpcCalls++; assert.equal(name, 'review_project_plan_pic_atomic'); assert.equal(args.p_expected_revision, '0');
      assert.equal(args.p_actor_id, 'head');
      if (args.p_approval_id !== pending.id) return { data: null, error: { code: '40001' } };
      if (project.is_postponed) return { data: null, error: { code: '55000' } };
      if (args.p_decision === 'APPROVED' && !args.p_pic_id) return { data: null, error: { code: '22023' } };
      return fail ? { data: null, error: { code: '40001' } } : { data: { ...pending, status: args.p_decision, project_status: 'ACTIVE' }, error: null };
    };
    const context = { expected_pic_revision: '0', request_id: '00000000-0000-4000-8000-000000000030' };
    const head = { userId: 'head', role: 'HEAD_SA', fullName: 'Head' };
    await assert.rejects(ProjectPlanApprovalService.approve('p', { ...context, pic_id: 'sa', expected_approval_id: oldPlan.id }, head));
    await assert.rejects(ProjectPlanApprovalService.approve('p', { pic_id: 'sa' }, head));
    await assert.rejects(ProjectPlanApprovalService.approve('p', { ...context, expected_approval_id: pending.id }, head));
    await assert.rejects(ProjectPlanApprovalService.approve('p', { ...context, pic_id: 'sa', expected_approval_id: pending.id }, { ...head, role: 'SA' }));
    project.is_postponed = true;
    await assert.rejects(ProjectPlanApprovalService.approve('p', { ...context, pic_id: 'sa', expected_approval_id: pending.id }, head));
    project.is_postponed = false;
    assert.equal(rpcCalls, 2, 'Obsolete approval and postponed state are rejected inside the locked RPC');
    assert(!rejectProjectPlanSchema.safeParse({ note: ' \n ' }).success);
    const result = await ProjectPlanApprovalService.approve('p', { ...context, pic_id: 'sa', expected_approval_id: pending.id }, head);
    assert.equal(result.project_status, 'ACTIVE'); assert.equal(notices, 0, 'Phase 27 persists intent in RPC, not a post-commit notification call');
    assert.equal(oldPlan.status, 'APPROVED'); assert.equal(oldMilestone.due_date, '2026-01-02');
    fail = true;
    await assert.rejects(ProjectPlanApprovalService.reject('p', { ...context, note: 'Please revise', expected_approval_id: pending.id }, head), /PIC_CONFLICT/);
    assert.equal(notices, 0, 'A stale RPC decision cannot dispatch a successful decision notification');
    console.log('Phase plan scoping, separate schedule/approval, PIC/role/postponement guards and stale CAS rejection passed (mocks)');
  } finally {
    (supabaseAdmin as any).from = from; (supabaseAdmin as any).rpc = rpc;
    (DeadlineService as any).calculateDeadline = deadline;
    (notifications as any).notifyProjectPlanApproved = approvedNotification;
    (notifications as any).notifyProjectPlanRejected = rejectedNotification;
    (picNotifications as any).notifyPicAssignment = picNotification;
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
