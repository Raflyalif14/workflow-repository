import { strict as assert } from 'assert';
import { supabaseAdmin } from '../config/supabase';
import { getScenarioDocuments } from '../constants/scenarios';
import { OutputDocumentError, OutputDocumentService } from './output-document.service';
import { DocumentStorageService } from '../utils/storage.util';

const projectId = 'project-output-access';
const nonFinalKey = 'proposal_teknis';
const approvedKey = 'timeline_proyek';

const actors = {
  headSa: { userId: 'head-sa-1', role: 'HEAD_SA', fullName: 'Head SA' },
  assignedSa: { userId: 'assigned-sa-1', role: 'SA', fullName: 'Assigned SA' },
  otherSa: { userId: 'other-sa-1', role: 'SA', fullName: 'Other SA' },
  salesOwner: { userId: 'sales-owner-1', role: 'SALES', fullName: 'Sales Owner' },
  otherSales: { userId: 'other-sales-1', role: 'SALES', fullName: 'Other Sales' },
  superAdmin: { userId: 'super-admin-1', role: 'SUPER_ADMIN', fullName: 'Super Admin' },
};

type OutputRow = Record<string, unknown>;

type State = {
  project: Record<string, unknown>;
  outputs: OutputRow[];
  versions: OutputRow[];
  signedPaths: string[];
};

const makeState = (): State => {
  const outputs = getScenarioDocuments('On Submission Tender').map((definition, index) => {
    const isNonFinal = definition.key === nonFinalKey;
    const isApproved = definition.key === approvedKey;
    return {
      id: `output-${index + 1}`,
      project_id: projectId,
      document_key: definition.key,
      title: definition.name,
      is_required: definition.isRequired,
      is_selected: definition.isRequired,
      status: isNonFinal ? 'IN_REVIEW' : isApproved ? 'APPROVED' : 'NOT_REQUIRED',
      file_name: isNonFinal ? 'internal-draft.pdf' : isApproved ? 'approved-timeline.pdf' : null,
      storage_path: isNonFinal ? 'output-documents/project/internal-draft.pdf' : isApproved ? 'output-documents/project/approved-timeline.pdf' : null,
      file_size: isNonFinal || isApproved ? 256 : null,
      mime_type: isNonFinal || isApproved ? 'application/pdf' : null,
      uploaded_at: isNonFinal || isApproved ? '2026-09-23T08:00:00.000Z' : null,
      review_feedback: isNonFinal ? 'Please check the internal pricing.' : null,
      reviewed_at: null,
      current_version_id: isNonFinal ? 'version-internal' : isApproved ? 'version-approved' : null,
      uploaded_by_user: { id: actors.assignedSa.userId, full_name: actors.assignedSa.fullName, role: 'SA' },
      reviewed_by_user: null,
    };
  });
  const internalOutput = outputs.find((row) => row.document_key === nonFinalKey)!;
  const approvedOutput = outputs.find((row) => row.document_key === approvedKey)!;

  return {
    project: {
      id: projectId,
      name: 'Output Access Project',
      customer: 'Customer',
      scenario_id: 'scenario-on-submission',
      sales_id: actors.salesOwner.userId,
      pic_id: actors.assignedSa.userId,
      status: 'ACTIVE',
      is_postponed: false,
      selected_document_keys: [],
      scenario: { id: 'scenario-on-submission', name: 'On Submission Tender', workflow_model: 'OPERATIONAL_V2', workflow_version: 2 },
    },
    outputs,
    versions: [
      {
        id: 'version-internal',
        output_document_id: internalOutput.id,
        project_id: projectId,
        file_name: internalOutput.file_name,
        storage_path: internalOutput.storage_path,
        output_document: { project_id: projectId, document_key: nonFinalKey },
      },
      {
        id: 'version-approved',
        output_document_id: approvedOutput.id,
        project_id: projectId,
        file_name: approvedOutput.file_name,
        storage_path: approvedOutput.storage_path,
        output_document: { project_id: projectId, document_key: approvedKey },
      },
    ],
    signedPaths: [],
  };
};

class QueryMock {
  private readonly filters: Array<{ kind: 'eq' | 'in'; column: string; value: unknown }> = [];

  constructor(private readonly state: State, private readonly table: string) {}

  select(): this { return this; }
  eq(column: string, value: unknown): this { this.filters.push({ kind: 'eq', column, value }); return this; }
  in(column: string, value: unknown[]): this { this.filters.push({ kind: 'in', column, value }); return this; }
  order(): this { return this; }
  maybeSingle(): Promise<{ data: unknown; error: null }> { return Promise.resolve(this.execute(true)); }
  single(): Promise<{ data: unknown; error: null }> { return Promise.resolve(this.execute(true)); }
  then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.execute(false)).then(onfulfilled, onrejected);
  }

  private matches(row: OutputRow): boolean {
    return this.filters.every((filter) => filter.kind === 'eq'
      ? row[filter.column] === filter.value
      : Array.isArray(filter.value) && filter.value.includes(row[filter.column]));
  }

  private execute(single: boolean): { data: unknown; error: null } {
    if (this.table === 'projects') {
      const rows = this.matches(this.state.project) ? [{ ...this.state.project }] : [];
      return { data: single ? (rows[0] || null) : rows, error: null };
    }
    if (this.table === 'project_plan_approvals') return { data: single ? { id: 'plan-approved', status: 'APPROVED' } : [], error: null };
    if (this.table === 'project_milestones') return { data: [], error: null };
    if (this.table === 'project_output_documents') {
      const rows = this.state.outputs.filter((row) => this.matches(row)).map((row) => ({ ...row }));
      return { data: single ? (rows[0] || null) : rows, error: null };
    }
    if (this.table === 'project_output_document_versions') {
      const rows = this.state.versions.filter((row) => this.matches(row)).map((row) => ({ ...row }));
      return { data: single ? (rows[0] || null) : rows, error: null };
    }
    return { data: single ? null : [], error: null };
  }
}

async function withState<T>(action: (state: State) => Promise<T>): Promise<T> {
  const state = makeState();
  const originalFrom = supabaseAdmin.from;
  const originalSignedUrl = DocumentStorageService.createSignedDownloadUrl;
  try {
    (supabaseAdmin as any).from = (table: string) => new QueryMock(state, table);
    (DocumentStorageService as any).createSignedDownloadUrl = async (path: string, expiresInSeconds: number) => {
      assert.equal(expiresInSeconds, 300, 'Output document signed URLs must use the configured five-minute lifetime');
      state.signedPaths.push(path);
      return `https://signed.example.test/${encodeURIComponent(path)}`;
    };
    return await action(state);
  } finally {
    (supabaseAdmin as any).from = originalFrom;
    (DocumentStorageService as any).createSignedDownloadUrl = originalSignedUrl;
  }
}

async function expectOutputError(action: () => Promise<unknown>, statusCode: number, label: string): Promise<void> {
  try {
    await action();
  } catch (error) {
    assert(error instanceof OutputDocumentError, `${label}: must throw OutputDocumentError`);
    assert.equal(error.statusCode, statusCode, `${label}: unexpected status code`);
    return;
  }
  throw new Error(`${label}: expected request to fail`);
}

async function main(): Promise<void> {
  await withState(async () => {
    for (const actor of [actors.headSa, actors.assignedSa]) {
      const response = await OutputDocumentService.list(projectId, actor);
      const internal = response.documents.find((item) => item.key === nonFinalKey);
      assert(internal?.fileName === 'internal-draft.pdf', 'Test 1: Head SA and assigned PIC retain non-final metadata');
      assert(internal?.currentVersionId === 'version-internal', 'Test 1: Head SA and assigned PIC retain the version token required for CAS');
      assert(response.missingMandatoryNames.length > 0, 'Test 1: authorized reviewers retain missing output names');
    }
    console.log('Test 1 - Head SA and assigned PIC can view current non-final output evidence: passed');
  });

  await withState(async () => {
    for (const actor of [actors.salesOwner, actors.superAdmin]) {
      const response = await OutputDocumentService.list(projectId, actor);
      assert(response.documents.every((item) => item.status === 'APPROVED'), 'Test 2: non-final output rows must not be returned to Sales or SUPER_ADMIN');
      assert(response.documents.length === 1 && response.documents[0].key === approvedKey, 'Test 2: approved output remains available through project access');
      assert.deepEqual(response.missingMandatoryNames, [], 'Test 2: non-final output names must not leak through readiness metadata');
      assert.equal(response.unapprovedCount, 3, 'Test 2: only aggregate readiness is visible');
    }
    console.log('Test 2 - Sales owner and SUPER_ADMIN receive approved outputs only: passed');
  });

  await withState(async (state) => {
    await OutputDocumentService.getDownloadUrl(projectId, nonFinalKey, actors.assignedSa);
    await OutputDocumentService.getDownloadUrl(projectId, nonFinalKey, actors.headSa);
    await OutputDocumentService.getVersionDownloadUrl(projectId, nonFinalKey, 'version-internal', actors.assignedSa);
    assert.equal(state.signedPaths.length, 3, 'Test 3: permitted readers use exact persisted storage paths');
    await expectOutputError(() => OutputDocumentService.getDownloadUrl(projectId, nonFinalKey, actors.salesOwner), 404, 'Test 3: Sales cannot download non-final output');
    await expectOutputError(() => OutputDocumentService.getDownloadUrl(projectId, nonFinalKey, actors.superAdmin), 404, 'Test 3: SUPER_ADMIN cannot download non-final output');
    await expectOutputError(() => OutputDocumentService.getVersionDownloadUrl(projectId, nonFinalKey, 'version-internal', actors.salesOwner), 404, 'Test 3: Sales cannot obtain non-final historical download URL');
    console.log('Test 3 - Signed downloads require database-backed role and project access: passed');
  });

  await withState(async (state) => {
    await OutputDocumentService.getDownloadUrl(projectId, approvedKey, actors.salesOwner);
    await OutputDocumentService.getDownloadUrl(projectId, approvedKey, actors.superAdmin);
    assert.equal(state.signedPaths.length, 2, 'Test 4: approved output remains downloadable by project-authorized Sales and SUPER_ADMIN');
    await expectOutputError(() => OutputDocumentService.list(projectId, actors.otherSales), 403, 'Test 4: unrelated Sales cannot list outputs');
    await expectOutputError(() => OutputDocumentService.list(projectId, actors.otherSa), 403, 'Test 4: non-PIC SA cannot list outputs');
    console.log('Test 4 - Approved access follows the canonical project access policy and unrelated users are denied: passed');
  });
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Output document access test failed.');
  process.exitCode = 1;
});
