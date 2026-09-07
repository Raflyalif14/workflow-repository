import { supabaseAdmin } from '../config/supabase';
import { ScenarioService } from './scenario.service';

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

const scenarios = [
  { id: 'legacy-assessment', name: 'Assessment', description: null, is_active: false, created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-01T00:00:00.000Z', workflow_stages: [{ count: 13 }] },
  { id: 'operational-v2', name: 'Assessment Operational V2', description: null, is_active: true, created_at: '2026-09-02T00:00:00.000Z', updated_at: '2026-09-02T00:00:00.000Z', workflow_stages: [{ count: 8 }] },
  { id: 'legacy-existing-tor', name: 'Existing TOR', description: null, is_active: false, created_at: '2026-09-03T00:00:00.000Z', updated_at: '2026-09-03T00:00:00.000Z', workflow_stages: [{ count: 11 }] },
  { id: 'existing-tor-operational-v2', name: 'Existing TOR Operational V2', description: null, is_active: true, created_at: '2026-09-04T00:00:00.000Z', updated_at: '2026-09-04T00:00:00.000Z', workflow_stages: [{ count: 6 }] },
];

class ScenarioQueryMock {
  private activeFilter: boolean | undefined;
  private idFilter: string | undefined;

  select(): this { return this; }
  order(): this { return this; }
  eq(column: string, value: unknown): this {
    if (column === 'is_active') this.activeFilter = value === true;
    if (column === 'id') this.idFilter = String(value);
    return this;
  }
  single(): Promise<{ data: any; error: any }> {
    const scenario = scenarios.find((item) => item.id === this.idFilter) || null;
    return Promise.resolve({ data: scenario, error: scenario ? null : { message: 'not found' } });
  }
  then<TResult1 = { data: any; error: any }, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    const data = this.activeFilter === undefined
      ? scenarios
      : scenarios.filter((scenario) => scenario.is_active === this.activeFilter);
    return Promise.resolve({ data, error: null }).then(onfulfilled, onrejected);
  }
}

async function run(): Promise<void> {
  const originalFrom = supabaseAdmin.from;
  try {
    (supabaseAdmin as any).from = (table: string) => {
      assert(table === 'scenarios', 'Scenario rollout selection must query scenarios only');
      return new ScenarioQueryMock();
    };

    const active = await ScenarioService.list({ is_active: 'true' });
    assert(active.map((scenario: { id: string }) => scenario.id).join(',') === 'operational-v2,existing-tor-operational-v2', 'Test 1: active scenario selection must contain only the Assessment and Existing TOR Operational V2 templates');
    console.log('Test 1 - Active scenario selection includes both Operational V2 templates and excludes both legacy templates: passed');

    const legacyAssessment = await ScenarioService.get('legacy-assessment');
    const legacyExistingTor = await ScenarioService.get('legacy-existing-tor');
    assert(
      legacyAssessment.id === 'legacy-assessment' && legacyAssessment.is_active === false &&
        legacyExistingTor.id === 'legacy-existing-tor' && legacyExistingTor.is_active === false,
      'Test 2: inactive legacy scenarios must remain readable by persisted ID for existing-project compatibility'
    );
    console.log('Test 2 - Both inactive legacy scenarios remain readable by persisted ID: passed');
  } finally {
    (supabaseAdmin as any).from = originalFrom;
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
