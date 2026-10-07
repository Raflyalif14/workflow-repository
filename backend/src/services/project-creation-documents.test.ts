import { ProjectCreationRequestError } from './project-creation.service';
import { getScenarioDocuments } from '../constants/scenarios';
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
  intakeInsertFailsAt?: number;
  storageCleanupFails?: boolean;
  isActive?: boolean;
  workflowModel?: string;
  workflowVersion?: number;
};

type State = {
  scenario: Scenario;
  project: Record<string, any> | null;
  intakeAttachments: Array<Record<string, any>>;
  milestones: Array<Record<string, any>>;
  outputDocuments: Array<Record<string, any>>;
  uploadedPaths: string[];
  cleanedPaths: string[];
  tablesTouched: string[];
  uploadCount: number;
  intakeInsertCount: number;
  milestoneInitializeCalls: number;
};

const sales = { userId: 'sales-1', role: 'SALES', fullName: 'Sales Test' };
const superAdmin = { userId: 'admin-1', role: 'SUPER_ADMIN', fullName: 'Admin Test' };
const input = {
  name: 'Enterprise Discovery',
  customer: 'Customer Test',
  scenario_id: '00000000-0000-4000-8000-000000000001',
  estimated_revenue: 1500000000,
};

const makeFile = (name: string, mimetype = 'application/pdf', fieldname = 'documents'): Express.Multer.File =>
  ({
    fieldname,
    originalname: name,
    encoding: '7bit',
    mimetype,
    size: 100,
    buffer: Buffer.from('file content'),
  } as Express.Multer.File);

const makeMom = (name = 'mom.pdf', mimetype = 'application/pdf') => makeFile(name, mimetype, 'mom');
const makePhoto = (name = 'project-photo.jpg', mimetype = 'image/jpeg') => makeFile(name, mimetype, 'photos');

const files = (
  mom: Express.Multer.File[] = [makeMom()],
  photos: Express.Multer.File[] = [makePhoto()],
  documents: Express.Multer.File[] = []
): ProjectCreationFiles => ({
  mom,
  photos,
  documents,
});

const makeState = (scenario: Scenario = {}): State => ({
  scenario,
  project: null,
  intakeAttachments: [],
  milestones: [],
  outputDocuments: [],
  uploadedPaths: [],
  cleanedPaths: [],
  tablesTouched: [],
  uploadCount: 0,
  intakeInsertCount: 0,
  milestoneInitializeCalls: 0,
});

class QueryMock {
  private operation: 'select' | 'insert' | 'upsert' | 'delete' = 'select';
  private payload: any;
  private readonly filters: Array<{ column: string; value: unknown }> = [];
  private readonly inFilters: Array<{ column: string; values: unknown[] }> = [];

  constructor(private readonly state: State, private readonly table: string) {
    state.tablesTouched.push(table);
  }

  select(): this { return this; }
  insert(payload: any): this { this.operation = 'insert'; this.payload = payload; return this; }
  upsert(payload: any): this { this.operation = 'upsert'; this.payload = payload; return this; }
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
    if (this.table === 'project_intake_attachments') return this.intakeAttachments();
    if (this.table === 'project_milestones') return this.milestones();
    if (this.table === 'project_output_documents') return this.outputDocuments();
    if (this.table === 'activity_logs') return { data: null, error: null };
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

  private intakeAttachments(): { data: any; error: any } {
    if (this.operation === 'insert') {
      this.state.intakeInsertCount += 1;
      if (this.state.scenario.intakeInsertFailsAt === this.state.intakeInsertCount) {
        return { data: null, error: { code: 'XX001' } };
      }
      this.state.intakeAttachments.push({ ...this.payload });
      return { data: { id: this.payload.id }, error: null };
    }
    if (this.operation === 'delete') {
      const ids = this.inValues('id') || [];
      this.state.intakeAttachments = this.state.intakeAttachments.filter((attachment) => !ids.includes(attachment.id));
      return { data: null, error: null };
    }
    return { data: null, error: null };
  }

  private milestones(): { data: any; error: any } {
    if (this.operation === 'delete') {
      this.state.milestones = [];
    }
    return { data: this.state.milestones, error: null };
  }

  private outputDocuments(): { data: any; error: any } {
    if (this.operation === 'upsert') {
      this.state.outputDocuments = (this.payload || []).map((row: Record<string, any>, index: number) => ({
        id: `output-${index + 1}`,
        ...row,
      }));
    }
    if (this.operation === 'delete') this.state.outputDocuments = [];
    return { data: this.state.outputDocuments, error: null };
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
      state.milestones = [...new Set(getScenarioDocuments('PRA_TENDER').map(doc => doc.stageKey))].map((stageKey, index) => ({ id: `milestone-${index}`, project_id: projectId, status: 'CREATED', workflow_stage: { stage_key: stageKey } }));
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
  // Full create/replay/partial-failure orchestration now lives in project-creation-receipts.test.ts.
  // The old compensation-delete expectation is intentionally retired: uncertain commit must not delete.
  await withScenario({}, async (state) => {
    await expectCreateError(
      () => ProjectManagementService.create(input, sales, files([], [makePhoto()]), '11111111-1111-4111-8111-111111111111'),
      'Exactly one MoM file is required to create a project.',
      400
    );
    assert(state.project === null && !state.tablesTouched.includes('projects'), 'Test 3: missing MoM must reject before project creation');
    console.log('Test 3 - Missing MoM is rejected before project creation: passed');
  });

  await withScenario({}, async (state) => {
    await expectCreateError(
      () => ProjectManagementService.create(input, sales, files([makeMom()], []), '11111111-1111-4111-8111-111111111111'),
      'At least one project photo is required to create a project.',
      400
    );
    assert(state.project === null && !state.tablesTouched.includes('projects'), 'Test 4: missing photos must reject before project creation');
    await expectCreateError(
      () => ProjectManagementService.create(input, sales, files([makeMom(), makeMom('second-mom.pdf')], [makePhoto()]), '11111111-1111-4111-8111-111111111111'),
      'Exactly one MoM file is required to create a project.',
      400
    );
    await expectCreateError(
      () => ProjectManagementService.create(input, sales, files([makeMom('mom.pdf', 'image/jpeg')], [makePhoto()]), '11111111-1111-4111-8111-111111111111'),
      'The MoM file must be a PDF.',
      400
    );
    await expectCreateError(
      () => ProjectManagementService.create(input, sales, files([makeMom('mom.docx')], [makePhoto()]), '11111111-1111-4111-8111-111111111111'),
      'The MoM file must be a PDF.',
      400
    );
    await expectCreateError(
      () => ProjectManagementService.create(input, sales, files([makeMom()], [makePhoto('not-an-image.pdf', 'application/pdf')]), '11111111-1111-4111-8111-111111111111'),
      'Project photos must be JPG, JPEG, or PNG images.',
      400
    );
    await expectCreateError(
      () => ProjectManagementService.create(input, sales, files([makeMom()], [makePhoto('renamed.jpg', 'application/pdf')]), '11111111-1111-4111-8111-111111111111'),
      'Project photos must be JPG, JPEG, or PNG images.',
      400
    );
    await expectCreateError(
      () => ProjectManagementService.create(input, sales, files([makeMom()], [makePhoto()], [makeFile('optional.exe')]), '11111111-1111-4111-8111-111111111111'),
      'File format not supported. Allowed formats: PDF, DOCX, XLSX, PPTX, Images, ZIP.',
      400
    );
    await expectCreateError(
      () => ProjectManagementService.create(input, sales, files([{ ...makeMom('large-mom.pdf'), size: MAX_DOCUMENT_FILE_SIZE_BYTES + 1 }], [makePhoto()]), '11111111-1111-4111-8111-111111111111'),
      'Each file must be 50 MB or smaller.',
      400
    );
    await expectCreateError(
      () => ProjectManagementService.create(input, sales, files([makeMom()], Array.from({ length: 11 }, (_, index) => makePhoto(`photo-${index}.jpg`))), '11111111-1111-4111-8111-111111111111'),
      'A maximum of 10 project photos may be uploaded.',
      400
    );
    await expectCreateError(
      () => ProjectManagementService.create(input, sales, files([makeMom()], [makePhoto()], Array.from({ length: 11 }, () => makeFile('optional.pdf'))), '11111111-1111-4111-8111-111111111111'),
      'A maximum of 10 optional documents may be uploaded.',
      400
    );
    assert(state.project === null, 'Test 4: invalid required attachments, size, and file counts must reject before project creation');
    console.log('Test 4 - Required MoM/photo validation and optional-document behavior are enforced before project creation: passed');
  });

  let failure:unknown;
  try { await ProjectManagementService.create(input,superAdmin,files(),'11111111-1111-4111-8111-111111111111'); } catch(error){failure=error;}
  assert(failure instanceof ProjectCreationRequestError && failure.code==='CREATE_ACCESS_INVALID','Only active Sales may create');
  try { await ProjectManagementService.create(input,sales,files()); } catch(error){failure=error;}
  assert(failure instanceof ProjectCreationRequestError && failure.code==='CREATE_REQUEST_REQUIRED','Old clients must upgrade; never generate a server-only retry ID');
  console.log('Existing intake validation and Sales/request-ID boundaries passed; no database/Storage accessed.');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
