import { supabaseAdmin } from '../config/supabase';
import { MilestoneService } from './milestone.service';
import {
  ProjectCreationError,
  ProjectCreationFiles,
  ProjectManagementService,
} from './project-management.service';
import { DocumentStorageService, MAX_DOCUMENT_FILE_SIZE_BYTES } from '../utils/storage.util';

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

type Scenario = {
  uploadFailsAt?: number;
  documentInsertFailsAt?: number;
  versionInsertFailsAt?: number;
  storageCleanupFails?: boolean;
  isActive?: boolean;
  workflowModel?: string;
  workflowVersion?: number;
};

type State = {
  scenario: Scenario;
  project: Record<string, any> | null;
  documents: Array<Record<string, any>>;
  versions: Array<Record<string, any>>;
  milestones: Array<Record<string, any>>;
  uploadedPaths: string[];
  cleanedPaths: string[];
  tablesTouched: string[];
  uploadCount: number;
  documentInsertCount: number;
  versionInsertCount: number;
  milestoneInitializeCalls: number;
};

const sales = { userId: 'sales-1', role: 'SALES', fullName: 'Sales Test' };
const superAdmin = { userId: 'admin-1', role: 'SUPER_ADMIN', fullName: 'Admin Test' };
const input = {
  name: 'Enterprise Discovery',
  customer: 'Customer Test',
  scenario_id: '00000000-0000-4000-8000-000000000001',
};

const makeFile = (name: string): Express.Multer.File =>
  ({
    fieldname: name === 'mom.pdf' ? 'mom' : 'documents',
    originalname: name,
    encoding: '7bit',
    mimetype: 'application/pdf',
    size: 100,
    buffer: Buffer.from('file content'),
  } as Express.Multer.File);

const files = (mom: Express.Multer.File[] = [makeFile('mom.pdf')], documents: Express.Multer.File[] = []): ProjectCreationFiles => ({
  mom,
  documents,
});

const makeState = (scenario: Scenario = {}): State => ({
  scenario,
  project: null,
  documents: [],
  versions: [],
  milestones: [],
  uploadedPaths: [],
  cleanedPaths: [],
  tablesTouched: [],
  uploadCount: 0,
  documentInsertCount: 0,
  versionInsertCount: 0,
  milestoneInitializeCalls: 0,
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
  maybeSingle(): Promise<{ data: any; error: any }> { return Promise.resolve(this.execute()); }
  single(): Promise<{ data: any; error: any }> { return Promise.resolve(this.execute()); }
  then<TResult1 = { data: any; error: any }, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> { return Promise.resolve(this.execute()).then(onfulfilled, onrejected); }

  private value(column: string): unknown {
    return this.filters.find((filter) => filter.column === column)?.value;
  }

  private inValues(column: string): unknown[] | undefined {
    return this.inFilters.find((filter) => filter.column === column)?.values;
  }

  private execute(): { data: any; error: any } {
    if (this.table === 'scenarios') {
      if (this.state.scenario.isActive === false) return { data: null, error: null };
      return {
        data: {
          id: input.scenario_id,
          name: 'Assessment',
          is_active: true,
          workflow_model: this.state.scenario.workflowModel || 'LEGACY',
          workflow_version: this.state.scenario.workflowVersion || 1,
        },
        error: null,
      };
    }
    if (this.table === 'projects') return this.projects();
    if (this.table === 'documents') return this.documents();
    if (this.table === 'document_versions') return this.versions();
    if (this.table === 'project_milestones') return this.milestones();
    if (this.table === 'activity_logs') return { data: null, error: null };
    if (this.table === 'document_version_approvals') return { data: null, error: null };
    return { data: null, error: null };
  }

  private projects(): { data: any; error: any } {
    if (this.operation === 'insert') {
      this.state.project = {
        id: 'project-1',
        ...this.payload,
        scenario: { id: input.scenario_id, name: 'Assessment' },
        sales: { id: sales.userId, full_name: sales.fullName, email: 'sales@example.com' },
        pic: null,
        created_at: '2026-09-04T00:00:00.000Z',
        updated_at: '2026-09-04T00:00:00.000Z',
      };
      return { data: { ...this.state.project }, error: null };
    }
    if (this.operation === 'delete') {
      if (!this.state.project || this.value('id') !== this.state.project.id) return { data: null, error: null };
      const deleted = this.state.project;
      this.state.project = null;
      return { data: { id: deleted.id }, error: null };
    }
    return { data: this.state.project ? { ...this.state.project } : null, error: null };
  }

  private documents(): { data: any; error: any } {
    if (this.operation === 'insert') {
      this.state.documentInsertCount += 1;
      if (this.state.scenario.documentInsertFailsAt === this.state.documentInsertCount) {
        return { data: null, error: { code: 'XX001' } };
      }
      this.state.documents.push({ ...this.payload });
      return { data: { id: this.payload.id }, error: null };
    }
    if (this.operation === 'delete') {
      const ids = this.inValues('id') || [];
      this.state.documents = this.state.documents.filter((document) => !ids.includes(document.id));
      this.state.versions = this.state.versions.filter((version) => !ids.includes(version.document_id));
      return { data: null, error: null };
    }
    return { data: null, error: null };
  }

  private versions(): { data: any; error: any } {
    if (this.operation !== 'insert') return { data: null, error: null };
    this.state.versionInsertCount += 1;
    if (this.state.scenario.versionInsertFailsAt === this.state.versionInsertCount) {
      return { data: null, error: { code: 'XX001' } };
    }
    this.state.versions.push({ ...this.payload });
    return { data: null, error: null };
  }

  private milestones(): { data: any; error: any } {
    if (this.operation === 'delete') {
      this.state.milestones = [];
    }
    return { data: null, error: null };
  }
}

async function withScenario<T>(scenario: Scenario, action: (state: State) => Promise<T>): Promise<T> {
  const state = makeState(scenario);
  const originalFrom = supabaseAdmin.from;
  const originalUpload = DocumentStorageService.upload;
  const originalRemoveMany = DocumentStorageService.removeMany;
  const originalInitialize = MilestoneService.initialize;
  const originalList = MilestoneService.list;

  try {
    (supabaseAdmin as any).from = (table: string) => new QueryMock(state, table);
    (DocumentStorageService as any).upload = async (_file: Express.Multer.File, storagePath: string) => {
      state.uploadCount += 1;
      state.uploadedPaths.push(storagePath);
      if (state.scenario.uploadFailsAt === state.uploadCount) throw new Error('simulated storage upload failure');
    };
    (DocumentStorageService as any).removeMany = async (storagePaths: string[]) => {
      state.cleanedPaths.push(...storagePaths);
      if (state.scenario.storageCleanupFails) throw new Error('simulated storage cleanup failure');
    };
    (MilestoneService as any).initialize = async (projectId: string) => {
      state.milestoneInitializeCalls += 1;
      state.milestones = [{ id: 'milestone-create', project_id: projectId, status: 'COMPLETED' }, { id: 'milestone-deadline', project_id: projectId, status: 'IN_PROGRESS' }];
      return state.milestones;
    };
    (MilestoneService as any).list = async () => state.milestones;
    return await action(state);
  } finally {
    (supabaseAdmin as any).from = originalFrom;
    (DocumentStorageService as any).upload = originalUpload;
    (DocumentStorageService as any).removeMany = originalRemoveMany;
    (MilestoneService as any).initialize = originalInitialize;
    (MilestoneService as any).list = originalList;
  }
}

async function expectCreateError(action: () => Promise<unknown>, message: string, statusCode: number): Promise<void> {
  try {
    await action();
    throw new Error(`Expected project creation failure: ${message}`);
  } catch (error) {
    assert(error instanceof ProjectCreationError, `Expected ProjectCreationError: ${message}`);
    assert((error as ProjectCreationError).message === message, `Expected message: ${message}`);
    assert((error as ProjectCreationError).statusCode === statusCode, `Expected HTTP ${statusCode}: ${message}`);
  }
}

async function run(): Promise<void> {
  await withScenario({}, async (state) => {
    const result = await ProjectManagementService.create(input, sales, files());
    assert(result.documents.length === 1 && result.documents[0].category === 'MOM', 'Test 1: required MoM must be returned as a safe official document summary');
    assert(state.project?.id === 'project-1' && state.milestoneInitializeCalls === 1, 'Test 1: project and existing milestone initialization must succeed once');
    assert(state.documents.length === 1 && state.documents[0].project_id === 'project-1', 'Test 1: MoM must belong to the new project');
    assert(state.documents[0].milestone_id === null && state.documents[0].status === 'APPROVED', 'Test 1: MoM must be project-level and approved immediately');
    assert(state.versions.length === 1 && state.versions[0].status === 'APPROVED' && state.versions[0].version_number === 1, 'Test 1: MoM must receive approved version one');
    assert(!state.tablesTouched.includes('document_version_approvals'), 'Test 1: project creation must not create document version approvals');
    console.log('Test 1 - Valid project creation with one required MoM creates an approved official document: passed');
  });

  await withScenario({}, async (state) => {
    const result = await ProjectManagementService.create(input, sales, files([makeFile('mom.pdf')], [makeFile('scope.pdf'), makeFile('reference.pdf')]));
    assert(result.documents.length === 3 && state.documents.length === 3, 'Test 2: MoM plus multiple optional documents must be created');
    assert(state.documents[0].category === 'MOM' && state.documents.slice(1).every((document) => document.category === 'OTHER'), 'Test 2: MoM and optional categories must be correct');
    assert(state.documents.every((document) => document.project_id === 'project-1' && document.milestone_id === null), 'Test 2: all project documents must be project-scoped with no milestone');
    console.log('Test 2 - Valid project creation with optional documents keeps immediate official document metadata: passed');
  });

  await withScenario({}, async (state) => {
    await expectCreateError(
      () => ProjectManagementService.create(input, sales, files([], [])),
      'Exactly one MoM file is required to create a project.',
      400
    );
    assert(state.project === null && !state.tablesTouched.includes('projects'), 'Test 3: missing MoM must reject before project creation');
    console.log('Test 3 - Missing MoM is rejected before project creation: passed');
  });

  await withScenario({}, async (state) => {
    await expectCreateError(
      () => ProjectManagementService.create(input, sales, files([makeFile('mom.exe')], [])),
      'File format not supported. Allowed formats: PDF, DOCX, XLSX, PPTX, Images, ZIP.',
      400
    );
    assert(state.project === null, 'Test 4: invalid MoM must reject before project creation');
    await expectCreateError(
      () => ProjectManagementService.create(input, sales, files([makeFile('mom.pdf')], [makeFile('optional.exe')])),
      'File format not supported. Allowed formats: PDF, DOCX, XLSX, PPTX, Images, ZIP.',
      400
    );
    assert(state.project === null, 'Test 4: invalid optional document must reject before project creation');
    await expectCreateError(
      () => ProjectManagementService.create(input, sales, files([{ ...makeFile('large-mom.pdf'), size: MAX_DOCUMENT_FILE_SIZE_BYTES + 1 }], [])),
      'Each file must be 50 MB or smaller.',
      400
    );
    await expectCreateError(
      () => ProjectManagementService.create(input, sales, files([makeFile('mom.pdf')], Array.from({ length: 11 }, () => makeFile('optional.pdf')))),
      'A maximum of 10 optional documents may be uploaded.',
      400
    );
    assert(state.project === null, 'Test 4: invalid size or document count must reject before project creation');
    console.log('Test 4 - Invalid type, size, and optional-file count are rejected before project creation: passed');
  });

  await withScenario({ uploadFailsAt: 2 }, async (state) => {
    await expectCreateError(
      () => ProjectManagementService.create(input, sales, files([makeFile('mom.pdf')], [makeFile('optional.pdf')])),
      'Failed to create project.',
      500
    );
    assert(state.cleanedPaths.length === 2, 'Test 5: storage failure must attempt cleanup for every request-owned path');
    assert(state.project === null && state.documents.length === 0 && state.versions.length === 0 && state.milestones.length === 0, 'Test 5: storage failure must remove project, documents, versions, and milestones');
    console.log('Test 5 - Storage failure compensates the project, workflow rows, documents, and files: passed');
  });

  await withScenario({ documentInsertFailsAt: 2 }, async (state) => {
    await expectCreateError(
      () => ProjectManagementService.create(input, sales, files([makeFile('mom.pdf')], [makeFile('optional.pdf')])),
      'Failed to create project documents.',
      500
    );
    assert(state.cleanedPaths.length === 2 && state.project === null && state.documents.length === 0 && state.versions.length === 0, 'Test 6: document metadata failure must clean earlier official artifacts and project');
    console.log('Test 6 - Document metadata failure compensates earlier files and project state: passed');
  });

  await withScenario({ versionInsertFailsAt: 3 }, async (state) => {
    await expectCreateError(
      () => ProjectManagementService.create(input, sales, files([makeFile('mom.pdf')], [makeFile('first.pdf'), makeFile('second.pdf')])),
      'Failed to create project documents.',
      500
    );
    assert(state.cleanedPaths.length === 3 && state.project === null && state.documents.length === 0 && state.versions.length === 0, 'Test 7: partial multi-file metadata failure must clean all earlier files and documents');
    console.log('Test 7 - Partial multi-file failure cleans all request-owned project artifacts: passed');
  });

  await withScenario({}, async (state) => {
    let error: unknown;
    try {
      await ProjectManagementService.create(input, superAdmin, files());
    } catch (caught) {
      error = caught;
    }
    assert(error instanceof Error && error.message === 'Forbidden', 'Test 8: existing SALES-only project creation authorization must remain intact');
    assert(state.project === null && !state.tablesTouched.includes('projects'), 'Test 8: existing SALES-only project creation authorization must remain intact');
    console.log('Test 8 - Existing SALES-only project creation authorization remains unchanged: passed');
  });

  await withScenario({ isActive: false }, async (state) => {
    await expectCreateError(
      () => ProjectManagementService.create(input, sales, files()),
      'Scenario is not active or does not exist',
      400
    );
    assert(state.project === null && !state.tablesTouched.includes('projects'), 'Test 9: inactive scenarios must be rejected before durable project creation');
    console.log('Test 9 - Inactive scenario cannot be used for a new project: passed');
  });

  await withScenario({ workflowModel: 'OPERATIONAL_V2', workflowVersion: 2 }, async (state) => {
    await ProjectManagementService.create(input, sales, files());
    assert(state.project?.scenario_id === input.scenario_id && state.milestoneInitializeCalls === 1, 'Test 10: active OPERATIONAL_V2 scenario must pass new-project scenario validation');
    console.log('Test 10 - Active OPERATIONAL_V2 scenario passes new-project validation: passed');
  });

  await withScenario({ workflowModel: 'OPERATIONAL_V2', workflowVersion: 1 }, async (state) => {
    await expectCreateError(
      () => ProjectManagementService.create(input, sales, files()),
      'Scenario workflow model/version is not supported.',
      400
    );
    assert(state.project === null && !state.tablesTouched.includes('projects'), 'Test 11: unsupported scenario model/version must fail before durable project creation');
    console.log('Test 11 - Unsupported scenario model/version is rejected before project creation: passed');
  });
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
