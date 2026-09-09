import { strict as assert } from 'assert';
import { supabaseAdmin } from '../config/supabase';
import { GlobalSearchError, GlobalSearchService } from './global-search.service';
import { globalSearchQuerySchema } from '../validators/search.validator';

type Row = Record<string, any>;
type SearchState = {
  projects: Row[];
  documents: Row[];
  milestones: Row[];
  errorTable?: string;
};

const admin = { userId: 'admin-1', role: 'SUPER_ADMIN', fullName: 'Admin' };
const headSa = { userId: 'headsa-1', role: 'HEAD_SA', fullName: 'Head SA' };
const salesOne = { userId: 'sales-1', role: 'SALES', fullName: 'Sales One' };
const salesTwo = { userId: 'sales-2', role: 'SALES', fullName: 'Sales Two' };
const saOne = { userId: 'sa-1', role: 'SA', fullName: 'SA One' };
const saTwo = { userId: 'sa-2', role: 'SA', fullName: 'SA Two' };

const makeState = (): SearchState => ({
  projects: Array.from({ length: 6 }, (_, index) => ({
    id: `project-${index + 1}`,
    name: index === 0 ? 'Alpha Platform' : `Alpha Project ${index + 1}`,
    customer: index === 0 ? 'Acme Customer' : `Customer ${index + 1}`,
    sales_id: index < 5 ? 'sales-1' : 'sales-2',
    pic_id: index < 5 ? 'sa-1' : 'sa-2',
    status: 'ACTIVE',
  })),
  documents: [
    { id: 'document-1', project_id: 'project-1', title: 'Alpha Evidence', category: 'OTHER', status: 'APPROVED', storage_path: 'private/should-not-leak.pdf' },
    { id: 'document-2', project_id: 'project-6', title: 'Alpha Restricted Evidence', category: 'MOM', status: 'APPROVED', storage_path: 'private/restricted.pdf' },
    { id: 'document-3', project_id: 'project-1', title: 'Alpha Internal Submission', category: 'OTHER', status: 'SUBMITTED', storage_path: 'private/internal.pdf' },
  ],
  milestones: [
    { id: 'milestone-1', project_id: 'project-1', name: 'Alpha Assessment', step_order: 1, status: 'IN_PROGRESS' },
    { id: 'milestone-2', project_id: 'project-6', name: 'Alpha Restricted Milestone', step_order: 2, status: 'CREATED' },
  ],
});

class QueryMock {
  private selection = '';
  private filters: Array<[string, unknown]> = [];
  private inFilters: Array<[string, unknown[]]> = [];
  private orCondition = '';
  private ilikeValue = '';
  private max = Number.POSITIVE_INFINITY;

  constructor(private readonly state: SearchState, private readonly table: string) {}
  select(value: string) { this.selection = value; return this; }
  eq(key: string, value: unknown) { this.filters.push([key, value]); return this; }
  in(key: string, value: unknown[]) { this.inFilters.push([key, value]); return this; }
  or(value: string) { this.orCondition = value; return this; }
  ilike(_key: string, value: string) { this.ilikeValue = value; return this; }
  order() { return this; }
  limit(value: number) { this.max = value; return this; }
  then(resolve: (value: { data: any; error: any }) => unknown, reject?: (reason: unknown) => unknown) {
    return Promise.resolve().then(() => this.execute()).then(resolve, reject);
  }

  private execute() {
    if (this.state.errorTable === this.table) return { data: null, error: { message: 'provider error must not leak' } };
    const source = this.table === 'projects' ? this.state.projects : this.table === 'documents' ? this.state.documents : this.state.milestones;
    const rows = source.filter((row) => {
      if (!this.filters.every(([key, value]) => row[key] === value)) return false;
      if (!this.inFilters.every(([key, values]) => values.includes(row[key]))) return false;
      const term = this.searchTerm();
      if (!term) return true;
      if (this.table === 'projects') return [row.name, row.customer].some((value) => value.toLowerCase().includes(term));
      return (this.table === 'documents' ? row.title : row.name).toLowerCase().includes(term);
    }).slice(0, this.max).map((row) => ({ ...row }));
    return { data: rows, error: null };
  }

  private searchTerm(): string {
    const raw = this.orCondition || this.ilikeValue;
    const match = raw.match(/(?:ilike\.)?%([^%]+)%/i);
    return (match?.[1] || '').replace(/\\([\\,().%_])/g, '$1').toLowerCase();
  }
}

async function withSearchState<T>(state: SearchState, action: () => Promise<T>): Promise<T> {
  const originalFrom = supabaseAdmin.from;
  try {
    (supabaseAdmin as any).from = (table: string) => new QueryMock(state, table);
    return await action();
  } finally {
    supabaseAdmin.from = originalFrom;
  }
}

async function run() {
  await withSearchState(makeState(), async () => {
    const result = await GlobalSearchService.search({ q: 'Alpha' }, admin);
    assert.equal(result.projects.length, 5, 'Test 1: projects must be capped at five results');
    assert.equal(result.documents.length, 3, 'Test 1: SUPER_ADMIN sees approved and non-final global documents');
    assert.equal(result.milestones.length, 2, 'Test 1: SUPER_ADMIN sees global milestones');
    assert(!JSON.stringify(result).includes('storage_path') && !JSON.stringify(result).includes('private/'), 'Test 1: storage paths must never be returned');
    console.log('Test 1 - SUPER_ADMIN receives globally scoped, bounded, safe results');
  });

  await withSearchState(makeState(), async () => {
    const result = await GlobalSearchService.search({ q: 'Alpha' }, headSa);
    assert.equal(result.documents.length, 3, 'Test 2: HEAD_SA sees approved and non-final global document results');
    assert.equal(result.milestones.length, 2, 'Test 2: HEAD_SA sees global milestone results');
    console.log('Test 2 - HEAD_SA receives global results');
  });

  await withSearchState(makeState(), async () => {
    const result = await GlobalSearchService.search({ q: 'Alpha' }, salesOne);
    assert(result.projects.every((item) => item.projectId !== 'project-6'), 'Test 3: SALES cannot discover another sales project');
    assert.deepEqual(result.documents.map((item) => item.id), ['document-1'], 'Test 3: SALES sees only owned documents');
    assert(!result.documents.some((item) => item.title === 'Alpha Internal Submission'), 'Test 3: SALES cannot discover non-final document titles');
    assert.deepEqual(result.milestones.map((item) => item.id), ['milestone-1'], 'Test 3: SALES sees only owned milestones');
    console.log('Test 3 - SALES scope prevents unrelated and non-final document discovery');
  });

  await withSearchState(makeState(), async () => {
    const result = await GlobalSearchService.search({ q: 'Alpha' }, saOne);
    assert(result.projects.every((item) => item.projectId !== 'project-6'), 'Test 4: SA cannot discover a non-PIC project');
    assert.deepEqual(result.documents.map((item) => item.id), ['document-1', 'document-3'], 'Test 4: SA sees approved and non-final PIC documents');
    assert.deepEqual(result.milestones.map((item) => item.id), ['milestone-1'], 'Test 4: SA sees only PIC milestones');
    console.log('Test 4 - SA scope prevents unrelated project, document, and milestone discovery');
  });

  await withSearchState(makeState(), async () => {
    const salesResult = await GlobalSearchService.search({ q: 'Restricted' }, salesOne);
    const saResult = await GlobalSearchService.search({ q: 'Restricted' }, saOne);
    assert.deepEqual(salesResult, { projects: [], documents: [], milestones: [] }, 'Test 5: unrelated SALES finds no restricted data');
    assert.deepEqual(saResult, { projects: [], documents: [], milestones: [] }, 'Test 5: unrelated SA finds no restricted data');
    assert.equal((await GlobalSearchService.search({ q: 'Restricted' }, salesTwo)).documents.length, 1, 'Test 5: owning SALES retains access');
    assert.equal((await GlobalSearchService.search({ q: 'Restricted' }, saTwo)).milestones.length, 1, 'Test 5: assigned SA retains access');
    console.log('Test 5 - Unrelated roles cannot infer protected matches');
  });

  await withSearchState(makeState(), async () => {
    assert.equal((await GlobalSearchService.search({ q: 'Platform' }, admin)).projects[0].title, 'Alpha Platform', 'Test 6: project names are searchable');
    assert.equal((await GlobalSearchService.search({ q: 'Acme' }, admin)).projects[0].subtitle, 'Acme Customer', 'Test 6: customers are searchable');
    assert.equal((await GlobalSearchService.search({ q: 'Evidence' }, admin)).documents[0].title, 'Alpha Evidence', 'Test 6: document titles are searchable');
    assert.equal((await GlobalSearchService.search({ q: 'Assessment' }, admin)).milestones[0].title, 'Alpha Assessment', 'Test 6: milestone names are searchable');
    console.log('Test 6 - Project name/customer, document title, and milestone name search work');
  });

  const valid = globalSearchQuerySchema.parse({ q: '  Alpha  ' });
  assert.equal(valid.q, 'Alpha', 'Test 7: query must be trimmed');
  assert.throws(() => globalSearchQuerySchema.parse({ q: 'a' }), 'Test 7: one-character query must be rejected');
  assert.throws(() => globalSearchQuerySchema.parse({ q: 'x'.repeat(101) }), 'Test 7: oversized query must be rejected');
  console.log('Test 7 - Query validation trims and bounds global search input');

  await withSearchState({ ...makeState(), errorTable: 'documents' }, async () => {
    await assert.rejects(
      () => GlobalSearchService.search({ q: 'Alpha' }, admin),
      (error: unknown) => error instanceof GlobalSearchError && error.message === 'Failed to search documents.' && !error.message.includes('provider')
    );
    console.log('Test 8 - Supabase failures are converted to safe search errors');
  });
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
