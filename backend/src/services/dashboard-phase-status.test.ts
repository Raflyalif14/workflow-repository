import assert from 'node:assert/strict';
import { supabaseAdmin } from '../config/supabase';
import { buildDashboardOverviewFromRows, DashboardProjectRow, DashboardService, DashboardSourceRows } from './dashboard.service';

const scenarios = [{ id: 'pra', name: 'Pra-Tender' }, { id: 'tender', name: 'On Submission Tender' }];
function project(id: string, status: string, phase = 'PRA_TENDER'): DashboardProjectRow {
  const scenario = phase === 'PRA_TENDER' ? 'pra' : 'tender';
  return { id, name: id, customer: null, status, is_postponed: false, scenario_id: 'pra', current_scenario_id: scenario,
    active_phase_id: `${id}-phase`, phase_migration_state: 'READY', sales_id: 'sales', pic_id: 'sa',
    active_phase: { id: `${id}-phase`, project_id: id, scenario_id: scenario, phase_key: phase } };
}
const sourceRows = (projects: DashboardProjectRow[]): DashboardSourceRows => ({ projects, scenarios,
  milestones: [], deadlineApprovals: [], projectPlanApprovals: [], activityLogs: [], users: [] });
const head = { role: 'HEAD_SA', userId: 'head' };
const samples = [
  project('active', 'ACTIVE'), project('waiting-sales', 'ACTIVE'),
  { ...project('paused-active', 'ACTIVE'), is_postponed: true },
  { ...project('paused-status', 'POSTPONED'), is_postponed: false },
  { ...project('paused-both', 'POSTPONED'), is_postponed: true },
  { ...project('closed', 'COMPLETED'), is_postponed: true },
  { ...project('tender-paused', 'ACTIVE', 'ON_SUBMISSION_TENDER'), is_postponed: true },
  project('pra-draft', 'DRAFT'), project('pra-won', 'WON'), project('pra-lost', 'LOST'),
  project('transitioned-won', 'WON', 'ON_SUBMISSION_TENDER'), project('transitioned-lost', 'LOST', 'ON_SUBMISSION_TENDER'),
  ...['DRAFT', 'ACTIVE', 'WAITING_RESULT', 'COMPLETED', 'CANCELLED'].map(s => project(`tender-${s}`, s, 'ON_SUBMISSION_TENDER')),
  { ...project('legacy-pra', 'ACTIVE'), active_phase_id: null, active_phase: null, current_scenario_id: null, phase_migration_state: 'LEGACY_REVIEW' },
  { ...project('legacy-tender', 'WON'), active_phase_id: null, active_phase: null, current_scenario_id: null, scenario_id: 'tender', phase_migration_state: 'LEGACY_REVIEW' },
];
const invalidSources: DashboardProjectRow[] = [
  { ...project('broken-ready', 'ACTIVE'), active_phase_id: null, active_phase: null },
  { ...project('missing-embed', 'ACTIVE'), active_phase: undefined },
  { ...project('wrong-project', 'ACTIVE'), active_phase: { id: 'wrong-project-phase', project_id: 'other', scenario_id: 'pra', phase_key: 'PRA_TENDER' } },
  { ...project('wrong-scenario', 'ACTIVE'), current_scenario_id: 'tender' },
  { ...project('missing-current-scenario', 'ACTIVE'), current_scenario_id: undefined },
  { ...project('unknown-phase-key', 'ACTIVE'), active_phase: { ...project('unknown-phase-key', 'ACTIVE').active_phase!, phase_key: 'UNKNOWN' } },
  { ...project('missing-status', 'ACTIVE'), status: '' },
  { ...project('legacy-missing-scenario', 'ACTIVE'), active_phase_id: null, active_phase: null, phase_migration_state: 'LEGACY_REVIEW', scenario_id: 'not-loaded' },
];
for (const invalid of invalidSources) {
  const overview = buildDashboardOverviewFromRows(sourceRows([project('valid', 'ACTIVE'), invalid]), head);
  assert.equal(overview.phaseWorkStatus, null, 'Incomplete phase data must not produce zero/partial counts');
  assert.equal(overview.summary.totalProjects, 2, 'Other dashboard panels remain available');
}
// Independent availability: valid statuses still allow the full scope chart
// when a phase relation is missing, foreign or mismatched.
for (const invalid of invalidSources.filter(row => row.status)) {
  const overview = buildDashboardOverviewFromRows(sourceRows([project('valid', 'ACTIVE'), invalid]), head);
  assert.equal(overview.allWorkStatus!.total, 2); assert.equal(overview.allWorkStatus!.active, 2);
}
const mixed = buildDashboardOverviewFromRows(sourceRows(samples), head).allWorkStatus!;
assert.deepEqual(mixed, { total: 19, planning: 2, active: 4, postponed: 4, completed: 2, won: 3, lost: 2, waitingResult: 1, cancelled: 1 });
assert.equal(Object.entries(mixed).filter(([key]) => key !== 'total').reduce((sum, [, count]) => sum + count, 0), mixed.total);
assert.deepEqual(buildDashboardOverviewFromRows(sourceRows([...samples, samples[0]]), head).allWorkStatus, mixed, 'Repeated project ID counts once');
assert.deepEqual(buildDashboardOverviewFromRows(sourceRows([...samples, samples[0]]), head).phaseWorkStatus,
  buildDashboardOverviewFromRows(sourceRows(samples), head).phaseWorkStatus);
for (const status of ['', 'UNKNOWN', 'ON_HOLD']) {
  const overview = buildDashboardOverviewFromRows(sourceRows([project('unknown', status)]), head);
  assert.equal(overview.allWorkStatus, null); assert.equal(overview.phaseWorkStatus, null);
}
for (const status of ['COMPLETED', 'WON', 'LOST', 'CANCELLED']) {
  const overview = buildDashboardOverviewFromRows(sourceRows([{ ...project('terminal', status), is_postponed: true }]), head);
  assert.equal(overview.allWorkStatus!.postponed, 0, 'Terminal status wins over a leftover postponed flag');
}
for (const [status, category] of Object.entries({ DRAFT: 'planning', ACTIVE: 'active', POSTPONED: 'postponed',
  COMPLETED: 'completed', WON: 'won', LOST: 'lost', WAITING_RESULT: 'waitingResult', CANCELLED: 'cancelled' })) {
  const overview = buildDashboardOverviewFromRows(sourceRows([project('one', status)]), head);
  assert.equal(overview.allWorkStatus![category as keyof NonNullable<typeof overview.allWorkStatus>], 1);
  assert.equal(overview.allWorkStatus!.total, 1);
}
for (const status of ['DRAFT', 'ACTIVE', 'WAITING_RESULT']) {
  assert.equal(buildDashboardOverviewFromRows(sourceRows([{ ...project('paused', status), is_postponed: true }]), head).allWorkStatus!.postponed, 1);
  assert.equal(buildDashboardOverviewFromRows(sourceRows([{ ...project('missing-pause', status), is_postponed: undefined }]), head).allWorkStatus, null);
}
const empty = buildDashboardOverviewFromRows(sourceRows([]), head).allWorkStatus!;
assert.equal(empty.total, 0); assert(Object.values(empty).every(count => count === 0));
const conflictingDuplicate = buildDashboardOverviewFromRows(sourceRows([project('same', 'ACTIVE'), project('same', 'WON')]), head);
assert.equal(conflictingDuplicate.allWorkStatus, null, 'Conflicting copies cannot publish a guessed distribution');
const brokenLegacy = { ...project('legacy-no-phase', 'ACTIVE'), active_phase_id: null, active_phase: null,
  phase_migration_state: 'LEGACY_REVIEW', current_scenario_id: 'tender' };
assert.equal(buildDashboardOverviewFromRows(sourceRows([brokenLegacy]), head).phaseWorkStatus, null);
assert.equal(buildDashboardOverviewFromRows(sourceRows([brokenLegacy]), head).allWorkStatus!.total, 1);
const wrongKey = { ...project('wrong-key', 'ACTIVE'), active_phase: { ...project('wrong-key', 'ACTIVE').active_phase!, phase_key: 'ON_SUBMISSION_TENDER' } };
assert.equal(buildDashboardOverviewFromRows(sourceRows([wrongKey]), head).phaseWorkStatus, null);
const foreignBroken = { ...invalidSources[0], sales_id: 'other', pic_id: 'other' };
assert.equal(buildDashboardOverviewFromRows(sourceRows([project('mine', 'ACTIVE'), foreignBroken]),
  { role: 'SALES', userId: 'sales' }).phaseWorkStatus!.PRA_TENDER.active, 1, 'Out-of-scope invalid records cannot affect visible counts');
const transitionedActive = project('actual-case', 'ACTIVE', 'ON_SUBMISSION_TENDER');
assert.deepEqual(buildDashboardOverviewFromRows(sourceRows([transitionedActive]), head).phaseWorkStatus,
  { PRA_TENDER: { active: 0, postponed: 0 }, ON_SUBMISSION_TENDER: { won: 0, lost: 0 } },
  'An initial Pra-Tender project now active in tender is legitimately absent from both phase-specific distributions');
assert.equal(buildDashboardOverviewFromRows(sourceRows([transitionedActive]), head).allWorkStatus!.active, 1);
assert.deepEqual(buildDashboardOverviewFromRows(sourceRows(samples), head).phaseWorkStatus,
  { PRA_TENDER: { active: 3, postponed: 3 }, ON_SUBMISSION_TENDER: { won: 2, lost: 1 } });
const closed = buildDashboardOverviewFromRows(sourceRows([project('closed', 'COMPLETED')]), head);
assert.deepEqual(closed.phaseWorkStatus, { PRA_TENDER: { active: 0, postponed: 0 }, ON_SUBMISSION_TENDER: { won: 0, lost: 0 } });
assert.equal(buildDashboardOverviewFromRows(sourceRows([
  { ...project('direct-tender', 'WON', 'ON_SUBMISSION_TENDER'), scenario_id: 'tender' },
]), head).phaseWorkStatus!.ON_SUBMISSION_TENDER.won, 1, 'Direct tender projects retain their phase classification');
for (const [role, userId, visible] of [['SALES', 'sales', 3], ['SA', 'sa', 3], ['SALES', 'other', 1], ['SA', 'other', 1], ['HEAD_SA', 'head', 4], ['SUPER_ADMIN', 'admin', 4]] as const) {
  const rows = sourceRows([project('mine', 'ACTIVE'), project('pending-decision', 'ACTIVE'), project('more', 'ACTIVE'),
    { ...project('other', 'ACTIVE'), sales_id: 'other', pic_id: 'other' }]);
  const overview = buildDashboardOverviewFromRows(rows, { role, userId });
  assert.equal(overview.phaseWorkStatus!.PRA_TENDER.active, visible);
  assert.equal(overview.allWorkStatus!.total, visible);
}

async function main() {
  const originalFrom = supabaseAdmin.from;
  // More than both frontend 100 and the database default 1000. Foreign records
  // must be filtered at every page, before the database applies the range.
  let data = [...Array.from({ length: 1001 }, (_, i) => project(`pra-${i}`, 'ACTIVE')),
    project('last-won', 'WON', 'ON_SUBMISSION_TENDER'),
    { ...project('foreign', 'ACTIVE'), sales_id: 'foreign', pic_id: 'foreign' }];
  let failOffset: number | undefined;
  let missingRows = false;
  let pages: Array<[number, number]> = [];
  let ordered: Array<[string, boolean]> = [];
  let filters: Array<[string, unknown]> = [];
  (supabaseAdmin as any).from = (table: string) => {
    let range: [number, number] = [0, 0];
    const pageFilters: Array<[string, unknown]> = [];
    const query = {
      select: (projection: string) => {
        if (table === 'projects') {
          assert(projection.includes('active_phase:project_phases!projects_active_phase_id_fkey(id,project_id,scenario_id,phase_key)'));
          assert(projection.includes('current_scenario_id') && !projection.includes('*'));
        }
        return query;
      },
      order: (column: string, options: { ascending: boolean }) => { if (table === 'projects') ordered.push([column, options.ascending]); return query; },
      eq: (column: string, value: unknown) => { if (table === 'projects') { filters.push([column, value]); pageFilters.push([column, value]); } return query; },
      in: () => query, neq: () => query, limit: () => query,
      range: (start: number, end: number) => { range = [start, end]; if (table === 'projects') pages.push(range); return query; },
      then: (resolve: (result: unknown) => unknown, reject: (error: unknown) => unknown) => {
        const scoped = data.filter(row => pageFilters.every(([column, value]) => row[column as keyof DashboardProjectRow] === value));
        const result = table === 'projects'
          ? range[0] === failOffset ? { data: null, error: { code: 'MOCK_PAGE_FAILURE' } } : { data: missingRows ? null : scoped.slice(range[0], range[1] + 1), error: null }
          : { data: table === 'scenarios' ? scenarios : [], error: null };
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return query;
  };
  try {
    for (const role of ['SALES', 'SA', 'HEAD_SA', 'SUPER_ADMIN']) {
      pages = []; filters = []; ordered = [];
      const userId = role === 'SALES' ? 'sales' : role === 'SA' ? 'sa' : 'head';
      const overview = await DashboardService.getOverview({ role, userId });
      assert.equal(overview.allWorkStatus!.total, ['SALES', 'SA'].includes(role) ? 1002 : 1003);
      assert.equal(overview.allWorkStatus!.won, 1);
      assert.equal(overview.phaseWorkStatus!.PRA_TENDER.active, ['SALES', 'SA'].includes(role) ? 1001 : 1002);
      assert.equal(overview.phaseWorkStatus!.ON_SUBMISSION_TENDER.won, 1, 'Last page transition counts as tender, not original Pra-Tender');
      assert.deepEqual(pages, [[0, 249], [250, 499], [500, 749], [750, 999], [1000, 1249]]);
      assert.deepEqual(ordered, Array.from({ length: 5 }, () => [['updated_at', false], ['id', true]]).flat());
      if (role === 'SALES' || role === 'SA') assert.deepEqual(filters, Array.from({ length: 5 }, () => [role === 'SALES' ? 'sales_id' : 'pic_id', userId]));
      else assert.equal(filters.length, 0);
    }
    failOffset = 1000;
    await assert.rejects(DashboardService.getOverview(head), /Failed to load dashboard data/, 'A later page failure must not publish partial counts');
    failOffset = undefined; missingRows = true;
    await assert.rejects(DashboardService.getOverview(head), /Failed to load dashboard data/, 'Null query rows are not a successfully loaded empty scope');
    missingRows = false; data = [];
    assert.deepEqual((await DashboardService.getOverview(head)).phaseWorkStatus, closed.phaseWorkStatus);
    console.log('Dashboard phase status: current relation, legacy fallback, exclusive categories, terminal exclusion, all role scopes and full pagination passed.');
  } finally { (supabaseAdmin as any).from = originalFrom; }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
