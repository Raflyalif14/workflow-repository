import { supabaseAdmin } from '../config/supabase';
import { DocumentService } from './document.service';
import {
  SalesMilestoneDocumentError,
  SalesMilestoneDocumentService,
} from './sales-milestone-document.service';
import { DocumentStorageService, MAX_DOCUMENT_FILE_SIZE_BYTES } from '../utils/storage.util';

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

type Scenario = {
  stageRole?: string;
  projectStatus?: string;
  projectPostponed?: boolean;
  documentInsertFailsAt?: number;
  versionInsertFailsAt?: number;
  uploadFailsAt?: number;
};

type State = {
  scenario: Scenario;
  project: Record<string, any>;
  milestone: Record<string, any>;
  documents: Array<Record<string, any>>;
  versions: Array<Record<string, any>>;
  uploadedPaths: string[];
  cleanupPaths: string[];
  tablesTouched: string[];
  documentInsertCount: number;
  versionInsertCount: number;
  uploadCount: number;
};

const salesOwner = { userId: 'sales-owner', role: 'SALES', fullName: 'Sales Owner' };
const unrelatedSales = { userId: 'sales-other', role: 'SALES', fullName: 'Other Sales' };
const solutionArchitect = { userId: 'sa-1', role: 'SA', fullName: 'Solution Architect' };
const headSa = { userId: 'headsa-1', role: 'HEAD_SA', fullName: 'Head SA' };
const superAdmin = { userId: 'admin-1', role: 'SUPER_ADMIN', fullName: 'Admin' };

const makeFile = (name: string): Express.Multer.File =>
  ({
    fieldname: 'files',
    originalname: name,
    encoding: '7bit',
    mimetype: 'application/pdf',
    size: 128,
    buffer: Buffer.from('document'),
  } as Express.Multer.File);

const makeState = (scenario: Scenario = {}): State => ({
  scenario,
  project: {
    id: 'project-1',
    name: 'Enterprise Assessment',
    customer: 'Customer Test',
    sales_id: salesOwner.userId,
    pic_id: 'sa-1',
    status: scenario.projectStatus || 'ACTIVE',
    is_postponed: scenario.projectPostponed || false,
  },
  milestone: {
    id: 'milestone-1',
    project_id: 'project-1',
    name: 'Sales Discovery',
    status: 'IN_PROGRESS',
    workflow_stage: { default_role: scenario.stageRole || 'SALES' },
  },
  documents: [],
  versions: [],
  uploadedPaths: [],
  cleanupPaths: [],
  tablesTouched: [],
  documentInsertCount: 0,
  versionInsertCount: 0,
  uploadCount: 0,
});

class QueryMock {
  private operation: 'select' | 'insert' | 'delete' = 'select';
  private payload: any;
  private readonly filters: Array<{ column: string; value: unknown }> = [];
  private readonly inFilters: Array<{ column: string; values: unknown[] }> = [];

  constructor(private readonly state: State, private readonly table: string) {
    state.tablesTouched.push(table);
  }

  select(): this { return this; }
  insert(payload: any): this { this.operation = 'insert'; this.payload = payload; return this; }
  delete(): this { this.operation = 'delete'; return this; }
  eq(column: string, value: unknown): this { this.filters.push({ column, value }); return this; }
  in(column: string, values: unknown[]): this { this.inFilters.push({ column, values }); return this; }
  order(): this { return this; }
  maybeSingle(): Promise<{ data: any; error: any }> { return Promise.resolve(this.execute(true)); }
  single(): Promise<{ data: any; error: any }> { return Promise.resolve(this.execute(true)); }
  then<TResult1 = { data: any; error: any }, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> { return Promise.resolve(this.execute(false)).then(onfulfilled, onrejected); }

  private value(column: string): unknown {
    return this.filters.find((filter) => filter.column === column)?.value;
  }

  private inValues(column: string): unknown[] | undefined {
    return this.inFilters.find((filter) => filter.column === column)?.values;
  }

  private execute(single: boolean): { data: any; error: any } {
    if (this.table === 'project_milestones') return this.milestones(single);
    if (this.table === 'projects') return this.projects(single);
    if (this.table === 'documents') return this.documents(single);
    if (this.table === 'document_versions') return this.versions();
    if (this.table === 'document_comments' || this.table === 'document_version_approvals') return { data: [], error: null };
    if (this.table === 'users') return { data: [{ id: salesOwner.userId, full_name: salesOwner.fullName, role: 'SALES' }], error: null };
    throw new Error(`Unexpected table: ${this.table}`);
  }

  private milestones(single: boolean): { data: any; error: any } {
    if (single) {
      return { data: { ...this.state.milestone, project: { ...this.state.project } }, error: null };
    }
    return { data: [{ id: this.state.milestone.id, project_id: this.state.milestone.project_id, name: this.state.milestone.name, step_order: 1 }], error: null };
  }

  private projects(single: boolean): { data: any; error: any } {
    return { data: single ? { ...this.state.project } : [{ ...this.state.project }], error: null };
  }

  private documents(single: boolean): { data: any; error: any } {
    if (this.operation === 'insert') {
      this.state.documentInsertCount += 1;
      if (this.state.scenario.documentInsertFailsAt === this.state.documentInsertCount) {
        return { data: null, error: { code: 'XX001' } };
      }
      const document = {
        ...this.payload,
        created_at: '2026-09-04T00:00:00.000Z',
        updated_at: '2026-09-04T00:00:00.000Z',
      };
      this.state.documents.push(document);
      return { data: { id: document.id }, error: null };
    }
    if (this.operation === 'delete') {
      const ids = this.inValues('id') || [];
      this.state.documents = this.state.documents.filter((document) => !ids.includes(document.id));
      this.state.versions = this.state.versions.filter((version) => !ids.includes(version.document_id));
      return { data: null, error: null };
    }

    const projectId = this.value('project_id');
    const documents = projectId
      ? this.state.documents.filter((document) => document.project_id === projectId)
      : this.state.documents;
    return { data: single ? documents[0] || null : documents, error: null };
  }

  private versions(): { data: any; error: any } {
    if (this.operation === 'insert') {
      this.state.versionInsertCount += 1;
      if (this.state.scenario.versionInsertFailsAt === this.state.versionInsertCount) {
        return { data: null, error: { code: 'XX001' } };
      }
      this.state.versions.push({
        ...this.payload,
        created_at: '2026-09-04T00:00:00.000Z',
      });
      return { data: null, error: null };
    }

    const documentIds = this.inValues('document_id') || [];
    return { data: this.state.versions.filter((version) => documentIds.includes(version.document_id)), error: null };
  }
}

async function withScenario<T>(scenario: Scenario, action: (state: State) => Promise<T>): Promise<T> {
  const state = makeState(scenario);
  const originalFrom = supabaseAdmin.from;
  const originalUpload = DocumentStorageService.upload;
  const originalRemoveMany = DocumentStorageService.removeMany;

  try {
    (supabaseAdmin as any).from = (table: string) => new QueryMock(state, table);
    (DocumentStorageService as any).upload = async (_file: Express.Multer.File, storagePath: string) => {
      state.uploadCount += 1;
      state.uploadedPaths.push(storagePath);
      if (state.scenario.uploadFailsAt === state.uploadCount) throw new Error('simulated storage failure');
    };
    (DocumentStorageService as any).removeMany = async (paths: string[]) => {
      state.cleanupPaths.push(...paths);
    };
    return await action(state);
  } finally {
    (supabaseAdmin as any).from = originalFrom;
    (DocumentStorageService as any).upload = originalUpload;
    (DocumentStorageService as any).removeMany = originalRemoveMany;
  }
}

async function expectError(action: () => Promise<unknown>, message: string, statusCode: number): Promise<void> {
  try {
    await action();
    throw new Error(`Expected failure: ${message}`);
  } catch (error) {
    assert(error instanceof SalesMilestoneDocumentError, `Expected SalesMilestoneDocumentError: ${message}`);
    assert((error as SalesMilestoneDocumentError).message === message, `Expected message: ${message}`);
    assert((error as SalesMilestoneDocumentError).statusCode === statusCode, `Expected HTTP ${statusCode}: ${message}`);
  }
}

async function run(): Promise<void> {
  await withScenario({}, async (state) => {
    const statusBefore = state.milestone.status;
    const result = await SalesMilestoneDocumentService.upload('milestone-1', salesOwner, [makeFile('brief.pdf')]);
    assert(result.documents.length === 1 && result.documents[0].category === 'OTHER', 'Test 1: owner SALES must receive one official OTHER document');
    assert(state.documents.length === 1 && state.documents[0].project_id === 'project-1' && state.documents[0].milestone_id === 'milestone-1', 'Test 1: document must use trusted project and milestone IDs');
    assert(state.documents[0].status === 'APPROVED' && state.versions[0].status === 'APPROVED' && state.versions[0].version_number === 1, 'Test 1: document and version one must be approved immediately');
    assert(state.milestone.status === statusBefore, 'Test 1: upload must not alter milestone status');
    assert(!state.tablesTouched.includes('document_version_approvals') && !state.tablesTouched.includes('milestone_submission_packages') && !state.tablesTouched.includes('milestone_submission_attachments'), 'Test 1: upload must not create review or submission package rows');
    assert(state.uploadedPaths[0].startsWith('project-1/') && !state.uploadedPaths[0].startsWith('milestone-submissions/'), 'Test 1: storage must use the official document namespace');
    console.log('Test 1 - Owning SALES uploads one approved official milestone document without workflow mutation: passed');
  });

  await withScenario({}, async (state) => {
    const result = await SalesMilestoneDocumentService.upload('milestone-1', salesOwner, [makeFile('brief.pdf'), makeFile('notes.pdf')]);
    assert(result.documents.length === 2 && state.documents.length === 2 && state.versions.length === 2, 'Test 2: owning SALES can upload multiple official documents');
    assert(state.documents.every((document) => document.category === 'OTHER' && document.project_id === 'project-1' && document.milestone_id === 'milestone-1'), 'Test 2: every document must retain the milestone/project scope');
    console.log('Test 2 - Owning SALES uploads multiple approved official milestone documents: passed');
  });

  await withScenario({}, async (state) => {
    await expectError(() => SalesMilestoneDocumentService.upload('milestone-1', unrelatedSales, [makeFile('brief.pdf')]), 'Forbidden', 403);
    assert(state.documents.length === 0 && state.uploadedPaths.length === 0, 'Test 3: unrelated SALES must be rejected before upload');
    console.log('Test 3 - Unrelated SALES is rejected: passed');
  });

  await withScenario({}, async (state) => {
    await expectError(() => SalesMilestoneDocumentService.upload('milestone-1', solutionArchitect, [makeFile('brief.pdf')]), 'Forbidden', 403);
    await expectError(() => SalesMilestoneDocumentService.upload('milestone-1', headSa, [makeFile('brief.pdf')]), 'Forbidden', 403);
    assert(state.documents.length === 0 && state.uploadedPaths.length === 0, 'Test 4: SA and HEAD_SA must be rejected before upload');
    console.log('Test 4 - SA and HEAD_SA are rejected: passed');
  });

  await withScenario({ stageRole: 'SA' }, async (state) => {
    await expectError(() => SalesMilestoneDocumentService.upload('milestone-1', salesOwner, [makeFile('brief.pdf')]), 'Documents can only be uploaded to SALES milestones.', 409);
    assert(state.documents.length === 0 && state.uploadedPaths.length === 0, 'Test 5: non-SALES milestone must be rejected before upload');
    console.log('Test 5 - Non-SALES milestone is rejected: passed');
  });

  await withScenario({}, async (state) => {
    await expectError(() => SalesMilestoneDocumentService.upload('milestone-1', salesOwner, []), 'At least one file is required for milestone document upload.', 400);
    await expectError(() => SalesMilestoneDocumentService.upload('milestone-1', salesOwner, [makeFile('invalid.exe')]), 'File format not supported. Allowed formats: PDF, DOCX, XLSX, PPTX, Images, ZIP.', 400);
    await expectError(() => SalesMilestoneDocumentService.upload('milestone-1', salesOwner, [{ ...makeFile('large.pdf'), size: MAX_DOCUMENT_FILE_SIZE_BYTES + 1 }]), 'Each file must be 50 MB or smaller.', 400);
    await expectError(() => SalesMilestoneDocumentService.upload('milestone-1', salesOwner, Array.from({ length: 11 }, () => makeFile('too-many.pdf'))), 'A maximum of 10 files may be uploaded at once.', 400);
    assert(state.documents.length === 0 && state.uploadedPaths.length === 0, 'Test 6: invalid file requests must be rejected before upload');
    console.log('Test 6 - Missing, invalid, oversized, and excessive files are rejected: passed');
  });

  await withScenario({ versionInsertFailsAt: 2 }, async (state) => {
    const statusBefore = state.milestone.status;
    await expectError(() => SalesMilestoneDocumentService.upload('milestone-1', salesOwner, [makeFile('first.pdf'), makeFile('second.pdf')]), 'Failed to upload milestone documents.', 500);
    assert(state.cleanupPaths.length === 2 && state.documents.length === 0 && state.versions.length === 0, 'Test 7: partial metadata failure must remove request-owned storage and documents');
    assert(state.milestone.status === statusBefore, 'Test 7: rollback must not mutate milestone status');
    console.log('Test 7 - Partial failure compensates storage and official document rows: passed');
  });

  await withScenario({}, async (state) => {
    await SalesMilestoneDocumentService.upload('milestone-1', superAdmin, [makeFile('admin-upload.pdf')]);
    const beforeListingTables = [...state.tablesTouched];
    assert(!beforeListingTables.includes('document_version_approvals') && !beforeListingTables.includes('milestone_submission_packages'), 'Test 8: SUPER_ADMIN upload must not create review/package records');
    const listed = await DocumentService.listDocuments({ projectId: 'project-1' }, salesOwner);
    assert(listed.length === 1 && listed[0].id === state.documents[0].id && listed[0].milestoneId === 'milestone-1', 'Test 8: existing project-scoped document listing exposes the created official document');
    console.log('Test 8 - SUPER_ADMIN uses existing global project access and project-scoped documents list the upload: passed');
  });
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
