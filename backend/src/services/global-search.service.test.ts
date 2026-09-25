import { strict as assert } from 'assert';
import { supabaseAdmin } from '../config/supabase';
import { GlobalSearchError, GlobalSearchService } from './global-search.service';
import { globalSearchQuerySchema } from '../validators/search.validator';

type Row = Record<string, any>;
type SearchState = {
  projects: Row[];
  documents: Row[];
  milestones: Row[];
  outputs: Row[];
  versions: Row[];
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
  outputs: [
    { project_id: 'project-1', document_key: 'proposal_teknis', title: 'Alpha Internal Output', is_required: true, is_selected: true, status: 'IN_REVIEW', file_name: 'internal.pdf', storage_path: 'private/internal-output', current_version_id: 'version-1' },
    { project_id: 'project-1', document_key: 'timeline_proyek', title: 'Alpha Approved Output', is_required: true, is_selected: true, status: 'APPROVED', file_name: 'approved.pdf', storage_path: 'private/approved-output', current_version_id: 'version-2' },
    { project_id: 'project-1', document_key: 'metodologi_implementasi', title: 'Alpha Unselected Output', is_required: false, is_selected: false, status: 'DRAFT', file_name: 'unselected.pdf', storage_path: 'private/unselected', current_version_id: 'version-3' },
    { project_id: 'project-6', document_key: 'proposal_teknis', title: 'Restricted Internal Output', is_required: true, is_selected: true, status: 'REVISION_REQUIRED', file_name: 'restricted-internal.pdf', storage_path: 'private/restricted-internal', current_version_id: 'version-4' },
    { project_id: 'project-6', document_key: 'timeline_proyek', title: 'Restricted Approved Output', is_required: true, is_selected: true, status: 'APPROVED', file_name: 'restricted-approved.pdf', storage_path: 'private/restricted-approved', current_version_id: 'version-5' },
    { project_id: 'project-6', document_key: 'identitas_barang_produk', title: 'Restricted Missing File', is_required: true, is_selected: true, status: 'DRAFT', file_name: null, storage_path: null, current_version_id: null },
  ],
  versions: [1, 2, 3, 4, 5].map((number) => ({ id: `version-${number}`, version_number: number })),
});

class QueryMock {
  private selection = '';
  private filters: Array<[string, unknown]> = [];
  private inFilters: Array<[string, unknown[]]> = [];
  private orCondition = '';
  private ilikeValue = '';
  private max = Number.POSITIVE_INFINITY;
  private start = 0;
  private end = Number.POSITIVE_INFINITY;
  private notNullColumns: string[] = [];

  constructor(private readonly state: SearchState, private readonly table: string) {}
  select(value: string) { this.selection = value; return this; }
  eq(key: string, value: unknown) { this.filters.push([key, value]); return this; }
  in(key: string, value: unknown[]) { this.inFilters.push([key, value]); return this; }
  or(value: string) { this.orCondition = value; return this; }
  ilike(_key: string, value: string) { this.ilikeValue = value; return this; }
  order() { return this; }
  limit(value: number) { this.max = value; return this; }
  range(start: number, end: number) { this.start = start; this.end = end; return this; }
  not(column: string) { this.notNullColumns.push(column); return this; }
  then(resolve: (value: { data: any; error: any }) => unknown, reject?: (reason: unknown) => unknown) {
    return Promise.resolve().then(() => this.execute()).then(resolve, reject);
  }

  private execute() {
    if (this.state.errorTable === this.table) return { data: null, error: { message: 'provider error must not leak' } };
    const source = this.table === 'projects' ? this.state.projects
      : this.table === 'documents' ? this.state.documents
      : this.table === 'project_milestones' ? this.state.milestones
      : this.table === 'project_output_documents' ? this.state.outputs
      : this.state.versions;
    const rows = source.filter((row) => {
      if (!this.filters.every(([key, value]) => row[key] === value)) return false;
      if (!this.inFilters.every(([key, values]) => values.includes(row[key]))) return false;
      if (!this.notNullColumns.every((column) => row[column] !== null && row[column] !== undefined)) return false;
      if (this.table === 'project_output_documents' && !(row.is_required || row.is_selected)) return false;
      const term = this.searchTerm();
      if (!term) return true;
      if (this.table === 'projects') return [row.name, row.customer].some((value) => value.toLowerCase().includes(term));
      if (this.table === 'project_output_documents' || this.table === 'project_output_document_versions') return true;
      return (this.table === 'documents' ? row.title : row.name).toLowerCase().includes(term);
    }).slice(this.start, Math.min(this.end + 1, this.max)).map((row) => ({ ...row }));
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
    assert.deepEqual(result.outputDocuments.map((item) => item.title), ['Alpha Approved Output', 'Restricted Approved Output'], 'Test 1: SUPER_ADMIN sees approved outputs only');
    assert(!JSON.stringify(result).includes('storage_path') && !JSON.stringify(result).includes('private/'), 'Test 1: storage paths must never be returned');
    console.log('Test 1 - SUPER_ADMIN receives globally scoped, bounded, safe results');
  });

  await withSearchState(makeState(), async () => {
    const result = await GlobalSearchService.search({ q: 'Alpha' }, headSa);
    assert.equal(result.documents.length, 3, 'Test 2: HEAD_SA sees approved and non-final global document results');
    assert.equal(result.milestones.length, 2, 'Test 2: HEAD_SA sees global milestone results');
    assert.deepEqual(result.outputDocuments.map((item) => item.title), ['Alpha Internal Output', 'Alpha Approved Output', 'Restricted Internal Output', 'Restricted Approved Output']);
    console.log('Test 2 - HEAD_SA receives global results');
  });

  await withSearchState(makeState(), async () => {
    const result = await GlobalSearchService.search({ q: 'Alpha' }, salesOne);
    assert(result.projects.every((item) => item.projectId !== 'project-6'), 'Test 3: SALES cannot discover another sales project');
    assert.deepEqual(result.documents.map((item) => item.id), ['document-1'], 'Test 3: SALES sees only owned documents');
    assert(!result.documents.some((item) => item.title === 'Alpha Internal Submission'), 'Test 3: SALES cannot discover non-final document titles');
    assert.deepEqual(result.milestones.map((item) => item.id), ['milestone-1'], 'Test 3: SALES sees only owned milestones');
    assert.deepEqual(result.outputDocuments.map((item) => item.title), ['Alpha Approved Output']);
    console.log('Test 3 - SALES scope prevents unrelated and non-final document discovery');
  });

  await withSearchState(makeState(), async () => {
    const result = await GlobalSearchService.search({ q: 'Alpha' }, saOne);
    assert(result.projects.every((item) => item.projectId !== 'project-6'), 'Test 4: SA cannot discover a non-PIC project');
    assert.deepEqual(result.documents.map((item) => item.id), ['document-1', 'document-3'], 'Test 4: SA sees approved and non-final PIC documents');
    assert.deepEqual(result.milestones.map((item) => item.id), ['milestone-1'], 'Test 4: SA sees only PIC milestones');
    assert.deepEqual(result.outputDocuments.map((item) => item.title), ['Alpha Internal Output', 'Alpha Approved Output']);
    console.log('Test 4 - SA scope prevents unrelated project, document, and milestone discovery');
  });

  await withSearchState(makeState(), async () => {
    const salesResult = await GlobalSearchService.search({ q: 'Restricted' }, salesOne);
    const saResult = await GlobalSearchService.search({ q: 'Restricted' }, saOne);
    assert.deepEqual(salesResult, { projects: [], documents: [], milestones: [], outputDocuments: [] }, 'Test 5: unrelated SALES finds no restricted data');
    assert.deepEqual(saResult, { projects: [], documents: [], milestones: [], outputDocuments: [] }, 'Test 5: unrelated SA finds no restricted data');
    assert.equal((await GlobalSearchService.search({ q: 'Restricted' }, salesTwo)).documents.length, 1, 'Test 5: owning SALES retains access');
    assert.equal((await GlobalSearchService.search({ q: 'Restricted' }, saTwo)).milestones.length, 1, 'Test 5: assigned SA retains access');
    assert.deepEqual((await GlobalSearchService.search({ q: 'Restricted' }, salesTwo)).outputDocuments.map((item) => item.title), ['Restricted Approved Output']);
    assert.deepEqual((await GlobalSearchService.search({ q: 'Restricted' }, saTwo)).outputDocuments.map((item) => item.title), ['Restricted Internal Output', 'Restricted Approved Output']);
    console.log('Test 5 - Unrelated roles cannot infer protected matches');
  });

  await withSearchState(makeState(), async () => {
    assert.equal((await GlobalSearchService.search({ q: 'Platform' }, admin)).projects[0].title, 'Alpha Platform', 'Test 6: project names are searchable');
    assert.equal((await GlobalSearchService.search({ q: 'Acme' }, admin)).projects[0].subtitle, 'Acme Customer', 'Test 6: customers are searchable');
    assert.equal((await GlobalSearchService.search({ q: 'Evidence' }, admin)).documents[0].title, 'Alpha Evidence', 'Test 6: document titles are searchable');
    assert.equal((await GlobalSearchService.search({ q: 'Assessment' }, admin)).milestones[0].title, 'Alpha Assessment', 'Test 6: milestone names are searchable');
    const byProject = await GlobalSearchService.search({ q: 'Platform' }, salesOne);
    assert.deepEqual(byProject.outputDocuments.map((item) => item.title), ['Alpha Approved Output'], 'Test 6: output project name is searchable without leaking non-final data');
    assert.equal(byProject.outputDocuments[0].subtitle, 'Alpha Platform | On Submission Tender');
    assert.equal(byProject.outputDocuments[0].status, 'APPROVED');
    assert(!JSON.stringify(byProject).includes('storage_path') && !JSON.stringify(byProject).includes('private/'));
    console.log('Test 6 - Project name/customer, document title, and milestone name search work');
  });

  const limitedState = makeState();
  for (let index = 1; index <= 5; index++) {
    limitedState.outputs.push({
      ...limitedState.outputs[1],
      project_id: `project-${index}`,
      document_key: 'proposal_teknis',
      title: `Alpha Additional Output ${index}`,
    });
  }
  await withSearchState(limitedState, async () => {
    const result = await GlobalSearchService.search({ q: 'Alpha' }, admin);
    assert.equal(result.outputDocuments.length, 5, 'Output results must have their own five-result limit');
    assert.equal(result.projects.length, 5, 'The existing project limit remains unchanged');
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
  await withSearchState({ ...makeState(), errorTable: 'project_output_documents' }, async () => {
    await assert.rejects(
      () => GlobalSearchService.search({ q: 'Alpha' }, admin),
      (error: unknown) => error instanceof GlobalSearchError && error.message === 'Failed to search output documents.'
    );
  });
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
