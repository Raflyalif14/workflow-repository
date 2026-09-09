import { supabaseAdmin } from '../config/supabase';
import { ScenarioService } from './scenario.service';

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

const scenarios = [
  { id: 'operational-v2', name: 'Assessment', description: null, is_active: true, workflow_model: 'OPERATIONAL_V2', workflow_version: 2, created_at: '2026-09-02T00:00:00.000Z', updated_at: '2026-09-02T00:00:00.000Z', workflow_stages: [{ count: 8 }] },
  { id: 'existing-tor-operational-v2', name: 'Existing TOR', description: null, is_active: true, workflow_model: 'OPERATIONAL_V2', workflow_version: 2, created_at: '2026-09-04T00:00:00.000Z', updated_at: '2026-09-04T00:00:00.000Z', workflow_stages: [{ count: 6 }] },
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
    assert(active.map((scenario: { id: string }) => scenario.id).join(',') === 'operational-v2,existing-tor-operational-v2', 'Test 1: active scenario selection must contain only the Operational V2 scenario UUIDs');
    assert(active.map((scenario: { name: string }) => scenario.name).join(',') === 'Assessment,Existing TOR', 'Test 1: active scenario labels must be canonical and must not expose Operational V2');
    assert(
      scenarios.filter((scenario) => scenario.is_active).every((scenario) => scenario.workflow_model === 'OPERATIONAL_V2' && scenario.workflow_version === 2),
      'Test 1: canonical labels must remain attached to active OPERATIONAL_V2 v2 scenario rows'
    );
    assert(scenarios.length === 2, 'Test 2: legacy scenario rows must not remain in the final scenario selection state');
    console.log('Test 1-2 - Active selection retains the two Operational V2 UUIDs with canonical labels and no legacy rows: passed');
  } finally {
    (supabaseAdmin as any).from = originalFrom;
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
