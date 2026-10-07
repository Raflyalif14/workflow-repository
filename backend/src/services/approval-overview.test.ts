import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { supabaseAdmin } from '../config/supabase';
import { ApprovalOverviewService } from './approval-overview.service';
import routes from '../routes/approval-overview.routes';

async function main() {
  const project: any = { id: 'p', name: 'User project', customer: 'Client', status: 'ACTIVE', is_postponed: false,
    scenario_id: 'sp', current_scenario_id: 'st', active_phase_id: 'tender', pic_id: 'sa', sales_id: 'sales',
    scenario: { name: 'Pra-Tender' }, phases: [{ id: 'pra', project_id: 'p', phase_key: 'PRA_TENDER', scenario_id: 'sp' },
      { id: 'tender', project_id: 'p', phase_key: 'ON_SUBMISSION_TENDER', scenario_id: 'st' }] };
  const milestone: any = { id: 'm', project_id: 'p', phase_id: 'tender', name: 'Technical proposal', step_order: 3,
    status: 'IN_PROGRESS', start_date: '2099-01-01', workflow_stage: { stage_key: 'TECHNICAL_PROPOSAL_BOQ', default_role: 'SA', scenario_id: 'st' } };
  const output: any = { id: 'o', project_id: 'p', phase_id: 'tender', milestone_id: 'm', document_key: 'timeline_proyek',
    status: 'IN_REVIEW', is_required: true, is_selected: true, current_version_id: 'v' };
  const version: any = { id: 'v', project_id: 'p', output_document_id: 'o', status: 'IN_REVIEW', snapshot_kind: 'SUBMITTED',
    version_number: 2, submitted_at: '2026-10-06T01:00:00Z', submission_actor_id: 'submitter', uploaded_by: 'different-uploader' };
  const refs = [1, 2].map(position => ({ version_id: 'v', project_id: 'p', output_document_id: 'o', file_id: `f${position}`, position }));
  const files = refs.map(ref => ({ id: ref.file_id, project_id: 'p', output_document_id: 'o', storage_path: 'private', signed_url: 'private' }));
  const tables: Record<string, any[]> = { projects: [project], project_milestones: [milestone], project_plan_approvals: [],
    milestone_deadline_approvals: [], milestone_deadline_history: [], project_output_documents: [output],
    project_output_document_versions: [version, { ...version, id: 'old', version_number: 1 }],
    project_output_document_version_files: refs, project_output_document_files: files,
    users: [{ id: 'submitter', full_name: 'Actual submitter', role: 'SA', email: 'private' }] };
  const originalFrom = supabaseAdmin.from, originalAuth = supabaseAdmin.auth.getUser;
  let profile: any = { id: 'actor', full_name: 'Actor', role: 'HEAD_SA', is_active: true, must_change_password: false };
  let failing = '', throwing = '', reads = 0;
  const projections: Array<{ table: string; fields: string }> = [];
  (supabaseAdmin as any).from = (table: string) => {
    assert(table in tables, table);
    const filters: Array<(row: any) => boolean> = [], orders: Array<[string, boolean]> = [];
    let bounds = [0, 999], projection = '';
    const result = () => {
      reads++;
      if (table === throwing) throw new Error('private transport failure');
      projections.push({ table, fields: projection });
      const data = tables[table].filter(row => filters.every(filter => filter(row)));
      data.sort((a, b) => { for (const [key, ascending] of orders) { const diff = String(a[key] ?? '').localeCompare(String(b[key] ?? '')); if (diff) return ascending ? diff : -diff; } return 0; });
      return { data: data.slice(bounds[0], bounds[1] + 1), error: table === failing ? { message: 'private provider failure' } : null };
    };
    const query: any = { select: (fields: string) => { projection = fields; return query; },
      eq: (key: string, value: any) => { filters.push(row => row[key] === value); return query; },
      in: (key: string, ids: any[]) => { assert(ids.length <= 200); filters.push(row => ids.includes(row[key])); return query; },
      order: (key: string, options: any) => {
        if (table === 'project_output_document_version_files') assert(['version_id', 'file_id'].includes(key), 'Snapshot references have a composite primary key, no id column');
        orders.push([key, options.ascending]); return query;
      },
      range: (a: number, b: number) => { assert(b - a < 250); bounds = [a, b]; return query; },
      single: async () => ({ data: profile, error: null }), then: (resolve: any, reject: any) => Promise.resolve(result()).then(resolve, reject) };
    return query;
  };
  (supabaseAdmin.auth as any).getUser = async () => ({ data: { user: { id: profile.id } }, error: null });
  const head = { userId: 'actor', role: 'HEAD_SA', fullName: 'Actor' };
  const overview = () => ApprovalOverviewService.getOverview(head);
  let server: ReturnType<ReturnType<typeof express>['listen']> | undefined;
  try {
    let result = await overview();
    assert.equal(result.items.length, 1); assert.equal(result.stats.pendingDocs, 1); assert.equal(result.stats.totalPending, 1);
    const item: any = result.items[0];
    assert.equal(item.snapshotId, 'v'); assert.equal(item.versionNumber, 2); assert.equal(item.fileCount, 2);
    assert.equal(item.submittedBy, 'Actual submitter'); assert.equal(item.phaseName, 'On Submission Tender'); assert(item.canReview, 'Review does not add an upload start-date restriction');
    assert(!JSON.stringify(result).includes('private')); assert(!JSON.stringify(result).includes('uploaded_by'));
    assert(projections.every(({ fields }) => !fields.includes('*') && !/storage_path|signed_url|file_name|email/.test(fields)));
    tables.project_plan_approvals = [
      { id: 'plan-current', project_id: 'p', phase_id: 'tender', phase: { phase_key: 'ON_SUBMISSION_TENDER' }, status: 'PENDING', requested_by: 'submitter', submitted_at: '2026-10-06', reviewed_by: null },
      { id: 'plan-old', project_id: 'p', phase_id: 'pra', phase: { phase_key: 'PRA_TENDER' }, status: 'PENDING', requested_by: 'submitter', submitted_at: '2026-10-05', reviewed_by: null },
    ];
    tables.milestone_deadline_approvals = [{ id: 'deadline', milestone_id: 'm', deadline_history_id: 'history',
      status: 'PENDING', requested_by: 'submitter', reviewed_by: null, requested_at: '2026-10-06', reviewed_at: null }];
    tables.milestone_deadline_history = [{ id: 'history', start_date: '2026-10-01', duration_working_days: 2, due_date: '2026-10-02', change_reason: 'User note' }];
    const combined = await overview();
    assert.equal(combined.stats.totalPending, 3); assert.equal(combined.stats.pendingProjectPlans, 1); assert.equal(combined.stats.pendingDeadlines, 1);
    assert.equal(combined.items.length, 4, 'Previous phase plan history remains readable without counting as current pending');
    assert.equal(combined.items.find(item => item.id === 'plan-old')?.isCurrentApproval, false);
    tables.project_plan_approvals = []; tables.milestone_deadline_approvals = []; tables.milestone_deadline_history = [];
    for (const status of ['DRAFT', 'APPROVED', 'REVISION_REQUIRED', 'TO_DO', 'NOT_REQUIRED']) {
      output.status = status; assert.equal((await overview()).stats.pendingDocs, 0);
    }
    output.status = 'IN_REVIEW'; output.is_required = false; output.is_selected = false;
    await assert.rejects(overview(), /Failed to load approval overview/, 'Corrupt mandatory scope cannot become a valid zero count');
    output.document_key = 'metodologi_implementasi'; milestone.workflow_stage.stage_key = 'PROPOSAL_SOLUTION';
    assert.equal((await overview()).stats.pendingDocs, 0);
    output.is_selected = true;
    assert.equal((await overview()).stats.pendingDocs, 1, 'Selected optional output is required work');
    output.document_key = 'timeline_proyek'; milestone.workflow_stage.stage_key = 'TECHNICAL_PROPOSAL_BOQ'; output.is_required = true;
    for (const [target, key, wrong] of [[version, 'project_id', 'other'], [version, 'output_document_id', 'other'],
      [version, 'status', 'APPROVED'], [version, 'snapshot_kind', 'LEGACY_UPLOAD_UNCONFIRMED'], [output, 'current_version_id', 'missing'],
      [output, 'phase_id', 'pra'], [milestone, 'project_id', 'other'], [milestone.workflow_stage, 'stage_key', 'UNKNOWN'],
      [refs[0], 'project_id', 'other'], [files[0], 'output_document_id', 'other'], [output, 'is_selected', false]] as const) {
      const old = target[key]; target[key] = wrong; await assert.rejects(overview(), /^Error: Failed to load approval overview\.$/); target[key] = old;
    }
    const savedRefs = tables.project_output_document_version_files; tables.project_output_document_version_files = [];
    await assert.rejects(overview()); tables.project_output_document_version_files = savedRefs;
    for (const [key, value, reason] of [['is_postponed', true, 'POSTPONED'], ['status', 'COMPLETED', 'PROJECT_NOT_ACTIVE']] as const) {
      const old = project[key]; project[key] = value; const blocked: any = (await overview()).items[0];
      assert.equal(blocked.canReview, false); assert.equal(blocked.reviewBlockedReason, reason); assert.equal((await overview()).stats.pendingDocs, 1); project[key] = old;
    }
    project.active_phase_id = 'pra'; assert.equal(((await overview()).items[0] as any).reviewBlockedReason, 'PHASE_NOT_ACTIVE'); project.active_phase_id = 'tender';
    milestone.status = 'COMPLETED'; assert.equal(((await overview()).items[0] as any).reviewBlockedReason, 'MILESTONE_NOT_ACTIVE'); milestone.status = 'IN_PROGRESS';
    // Legacy Pra-Tender historically included both catalog groups. Never infer a submitter from the uploader.
    project.active_phase_id = null; output.phase_id = null; milestone.phase_id = null; milestone.workflow_stage.scenario_id = 'sp';
    version.snapshot_kind = 'LEGACY_SUBMITTED'; version.submission_actor_id = null; version.submitted_at = null;
    const legacy: any = (await overview()).items[0]; assert.equal(legacy.submittedBy, ''); assert.equal(legacy.submittedAt, ''); assert(legacy.canReview);
    project.active_phase_id = 'tender'; output.phase_id = 'tender'; milestone.phase_id = 'tender'; milestone.workflow_stage.scenario_id = 'st';
    version.snapshot_kind = 'SUBMITTED'; version.submission_actor_id = 'submitter'; version.submitted_at = '2026-10-06T01:00:00Z';
    failing = 'project_output_document_version_files'; await assert.rejects(overview(), /Failed to load approval overview/); failing = '';
    const before = projections.length;
    const admin = await ApprovalOverviewService.getOverview({ ...head, role: 'SUPER_ADMIN' }); assert.equal(admin.stats.pendingDocs, 0);
    assert(!projections.slice(before).some(value => value.table.startsWith('project_output_document')), 'No non-final metadata read for SUPER_ADMIN');
    for (const role of ['SA', 'SALES']) { const count = reads; await assert.rejects(ApprovalOverviewService.getOverview({ ...head, role }), /Forbidden/); assert.equal(reads, count); }
    // More than a database page and more than an IN batch: every output remains one item.
    tables.projects = Array.from({ length: 270 }, (_, i) => ({ ...project, id: `p${String(i).padStart(3, '0')}` }));
    tables.projects.forEach(p => { p.phases = project.phases.map((phase: any) => ({ ...phase, project_id: p.id })); });
    tables.project_milestones = tables.projects.map(p => ({ ...milestone, id: `m${p.id}`, project_id: p.id }));
    tables.project_output_documents = tables.projects.map(p => ({ ...output, id: `o${p.id}`, project_id: p.id, milestone_id: `m${p.id}`, current_version_id: `v${p.id}` }));
    tables.project_output_document_versions = tables.projects.map(p => ({ ...version, id: `v${p.id}`, project_id: p.id, output_document_id: `o${p.id}` }));
    tables.project_output_document_version_files = tables.projects.flatMap(p => [1, 2].map(position => ({ version_id: `v${p.id}`, project_id: p.id, output_document_id: `o${p.id}`, file_id: `f${p.id}-${position}`, position })));
    tables.project_output_document_files = tables.project_output_document_version_files.map(ref => ({ id: ref.file_id, project_id: ref.project_id, output_document_id: ref.output_document_id }));
    result = await overview(); assert.equal(result.stats.pendingDocs, 270); assert.equal(result.stats.totalPending, 270); assert.equal(new Set(result.items.map(item => item.id)).size, 270);
    const app = express(); app.use('/api/approvals', routes); server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    const address = server.address(); assert(address && typeof address !== 'string');
    const request = () => fetch(`http://127.0.0.1:${address.port}/api/approvals/overview?role=HEAD_SA`, { headers: { authorization: 'Bearer local-fixture-only' } });
    for (const role of ['SALES', 'SA']) { profile.role = role; const before = reads; assert.equal((await request()).status, 403); assert.equal(reads, before); }
    profile.role = 'HEAD_SA'; profile.is_active = false; assert.equal((await request()).status, 401);
    profile.is_active = true; assert.equal((await request()).status, 200);
    profile.role = 'SUPER_ADMIN'; assert.equal((await request()).status, 200);
    profile.role = 'HEAD_SA';
    for (const transport of [false, true]) {
      failing = transport ? '' : 'projects'; throwing = transport ? 'projects' : '';
      const response = await request(); assert.equal(response.status, 500);
      const body = await response.json() as any;
      assert.equal(body.message, 'Failed to load approval overview.');
      assert(!JSON.stringify(body).includes('private')); assert.equal(body.data, undefined, 'Source failure has no misleading valid-zero response');
    }
    failing = ''; throwing = '';
    tables.projects = []; result = await overview(); assert.equal(result.stats.totalPending, 0); assert.deepEqual(result.items, []);
    console.log('Approval overview: snapshot identity/scope, multi-file counts, legacy, role/active-account HTTP guards, blocked visibility, safe projection, complete pagination and source errors passed (mock providers).');
  } finally {
    if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server!.close(() => resolve())); }
    (supabaseAdmin as any).from = originalFrom; (supabaseAdmin.auth as any).getUser = originalAuth;
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
