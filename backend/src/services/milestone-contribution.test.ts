import { supabaseAdmin } from '../config/supabase';
import { DocumentStorageService, MAX_DOCUMENT_FILE_SIZE_BYTES } from '../utils/storage.util';
import {
  MilestoneContributionError,
  MilestoneContributionService,
  canReadMilestoneContributions,
  isOperationalV2FirstMilestone,
} from './milestone-contribution.service';

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

type ScenarioOptions = {
  workflowModel?: string;
  workflowVersion?: number;
  stepOrder?: number;
  milestoneStatus?: string;
  projectStatus?: string;
  projectPostponed?: boolean;
  uploadFailsAt?: number;
  cleanupFails?: boolean;
  copyFails?: boolean;
  documentInsertFails?: boolean;
  versionInsertFails?: boolean;
  activityLogFails?: boolean;
  picId?: string | null;
};

type TestState = {
  options: ScenarioOptions;
  milestone: Record<string, any>;
  project: Record<string, any>;
  scenario: Record<string, any>;
  contributions: Array<Record<string, any>>;
  attachments: Array<Record<string, any>>;
  documents: Array<Record<string, any>>;
  versions: Array<Record<string, any>>;
  activityLogs: Array<Record<string, any>>;
  users: Array<Record<string, any>>;
  tablesTouched: string[];
  uploadedPaths: string[];
  removedPaths: string[];
  copiedPaths: Array<{ source: string; destination: string }>;
  signedPath: string | null;
  uploadCount: number;
};

const salesOwner = { userId: 'sales-owner', role: 'SALES', fullName: 'Sales Owner' };
const otherSales = { userId: 'sales-other', role: 'SALES', fullName: 'Other Sales' };
const saPic = { userId: 'sa-pic', role: 'SA', fullName: 'SA PIC' };
const otherSa = { userId: 'sa-other', role: 'SA', fullName: 'Other SA' };
const headSa = { userId: 'head-sa', role: 'HEAD_SA', fullName: 'Head SA' };
const superAdmin = { userId: 'admin', role: 'SUPER_ADMIN', fullName: 'Admin' };

const makeFile = (name: string, size = 128): Express.Multer.File =>
  ({
    fieldname: 'files',
    originalname: name,
    encoding: '7bit',
    mimetype: 'application/pdf',
    size,
    buffer: Buffer.from('supporting input'),
  } as Express.Multer.File);

const makeState = (options: ScenarioOptions = {}): TestState => ({
  options,
  milestone: {
    id: 'milestone-1',
    project_id: 'project-1',
    step_order: options.stepOrder ?? 1,
    status: options.milestoneStatus || 'IN_PROGRESS',
    pic_id: options.picId === undefined ? saPic.userId : options.picId,
  },
  project: {
    id: 'project-1',
    sales_id: salesOwner.userId,
    status: options.projectStatus || 'ACTIVE',
    is_postponed: options.projectPostponed || false,
    scenario_id: 'scenario-1',
  },
  scenario: {
    id: 'scenario-1',
    workflow_model: options.workflowModel || 'OPERATIONAL_V2',
    workflow_version: options.workflowVersion ?? 2,
  },
  contributions: [],
  attachments: [],
  documents: [],
  versions: [],
  activityLogs: [],
  users: [
    { id: salesOwner.userId, full_name: salesOwner.fullName, email: 'sales@example.com' },
    { id: saPic.userId, full_name: saPic.fullName, email: 'sa@example.com' },
  ],
  tablesTouched: [],
  uploadedPaths: [],
  removedPaths: [],
  copiedPaths: [],
  signedPath: null,
  uploadCount: 0,
});

class QueryMock {
  private operation: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private payload: any;
  private readonly filters: Array<{ column: string; value: unknown }> = [];
  private readonly inFilters: Array<{ column: string; values: unknown[] }> = [];
  private ascending = true;

  constructor(private readonly state: TestState, private readonly table: string) {
    state.tablesTouched.push(table);
  }

  select(): this { return this; }
  insert(payload: any): this { this.operation = 'insert'; this.payload = payload; return this; }
  update(payload: any): this { this.operation = 'update'; this.payload = payload; return this; }
  delete(): this { this.operation = 'delete'; return this; }
  eq(column: string, value: unknown): this { this.filters.push({ column, value }); return this; }
  in(column: string, values: unknown[]): this { this.inFilters.push({ column, values }); return this; }
  order(_column: string, options?: { ascending?: boolean }): this { this.ascending = options?.ascending ?? true; return this; }
  maybeSingle(): Promise<{ data: any; error: any }> { return Promise.resolve(this.execute(true)); }
  then<TResult1 = { data: any; error: any }, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.execute(false)).then(onfulfilled, onrejected);
  }

  private matches(row: Record<string, any>): boolean {
    return this.filters.every((filter) => row[filter.column] === filter.value) &&
      this.inFilters.every((filter) => filter.values.includes(row[filter.column]));
  }

  private execute(single: boolean): { data: any; error: any } {
    if (this.table === 'project_milestones') {
      return { data: this.matches(this.state.milestone) ? { ...this.state.milestone } : null, error: null };
    }
    if (this.table === 'projects') {
      return { data: this.matches(this.state.project) ? { ...this.state.project } : null, error: null };
    }
    if (this.table === 'scenarios') {
      return { data: { ...this.state.scenario }, error: null };
    }
    if (this.table === 'milestone_contributions') return this.contributionRows(single);
    if (this.table === 'milestone_contribution_attachments') return this.attachmentRows(single);
    if (this.table === 'documents') return this.documentRows(single);
    if (this.table === 'document_versions') return this.versionRows(single);
    if (this.table === 'activity_logs') return this.activityLogRows(single);
    if (this.table === 'users') {
      const rows = this.state.users.filter((row) => this.matches(row));
      return { data: single ? rows[0] || null : rows.map((row) => ({ ...row })), error: null };
    }
    throw new Error(`Unexpected table accessed: ${this.table}`);
  }

  private contributionRows(single: boolean): { data: any; error: any } {
    if (this.operation === 'insert') {
      this.state.contributions.push({
        ...this.payload,
        created_at: '2026-09-07T08:00:00.000Z',
        updated_at: '2026-09-07T08:00:00.000Z',
      });
      return { data: null, error: null };
    }

    const matched = this.state.contributions.filter((row) => this.matches(row));
    if (this.operation === 'update') {
      matched.forEach((row) => Object.assign(row, this.payload));
      const result = matched.map((row) => ({ ...row }));
      return { data: single ? result[0] || null : result, error: null };
    }
    if (this.operation === 'delete') {
      const ids = new Set(matched.map((row) => row.id));
      this.state.contributions = this.state.contributions.filter((row) => !ids.has(row.id));
      this.state.attachments = this.state.attachments.filter((row) => !ids.has(row.contribution_id));
      const result = matched.map((row) => ({ id: row.id }));
      return { data: single ? result[0] || null : result, error: null };
    }

    const sorted = [...matched].sort((a, b) =>
      this.ascending ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at)
    );
    return { data: single ? sorted[0] || null : sorted.map((row) => ({ ...row })), error: null };
  }

  private attachmentRows(single: boolean): { data: any; error: any } {
    if (this.operation === 'insert') {
      const payload = Array.isArray(this.payload) ? this.payload : [this.payload];
      this.state.attachments.push(
        ...payload.map((row) => ({
          ...row,
          promotion_status: row.promotion_status || 'NOT_PROMOTED',
          promoted_document_id: row.promoted_document_id || null,
          created_at: '2026-09-07T08:00:00.000Z',
        }))
      );
      return { data: null, error: null };
    }
    const matched = this.state.attachments.filter((row) => this.matches(row));
    if (this.operation === 'update') {
      matched.forEach((row) => Object.assign(row, this.payload));
      const result = matched.map((row) => ({ ...row }));
      return { data: single ? result[0] || null : result, error: null };
    }
    return { data: single ? matched[0] || null : matched.map((row) => ({ ...row })), error: null };
  }

  private documentRows(single: boolean): { data: any; error: any } {
    if (this.operation === 'insert') {
      if (this.state.options.documentInsertFails) return { data: null, error: { message: 'simulated document failure' } };
      this.state.documents.push({ ...this.payload });
      return { data: single ? { id: this.payload.id } : [{ id: this.payload.id }], error: null };
    }

    const matched = this.state.documents.filter((row) => this.matches(row));
    if (this.operation === 'delete') {
      const ids = new Set(matched.map((row) => row.id));
      this.state.documents = this.state.documents.filter((row) => !ids.has(row.id));
      this.state.versions = this.state.versions.filter((row) => !ids.has(row.document_id));
      const result = matched.map((row) => ({ id: row.id }));
      return { data: single ? result[0] || null : result, error: null };
    }
    return { data: single ? matched[0] || null : matched.map((row) => ({ ...row })), error: null };
  }

  private versionRows(single: boolean): { data: any; error: any } {
    if (this.operation === 'insert') {
      if (this.state.options.versionInsertFails) return { data: null, error: { message: 'simulated version failure' } };
      this.state.versions.push({ ...this.payload });
      return { data: single ? { id: this.payload.id } : [{ id: this.payload.id }], error: null };
    }
    return { data: single ? null : [], error: null };
  }

  private activityLogRows(single: boolean): { data: any; error: any } {
    if (this.operation === 'insert') {
      if (this.state.options.activityLogFails) return { data: null, error: { message: 'simulated activity failure' } };
      this.state.activityLogs.push({ ...this.payload });
    }
    return { data: single ? null : [], error: null };
  }
}

async function withState<T>(options: ScenarioOptions, action: (state: TestState) => Promise<T>): Promise<T> {
  const state = makeState(options);
  const originalFrom = supabaseAdmin.from;
  const originalUpload = DocumentStorageService.upload;
  const originalCopy = DocumentStorageService.copy;
  const originalRemove = DocumentStorageService.remove;
  const originalRemoveMany = DocumentStorageService.removeMany;
  const originalSignedUrl = DocumentStorageService.createSignedDownloadUrl;

  try {
    (supabaseAdmin as any).from = (table: string) => new QueryMock(state, table);
    (DocumentStorageService as any).upload = async (_file: Express.Multer.File, storagePath: string) => {
      state.uploadCount += 1;
      state.uploadedPaths.push(storagePath);
      if (state.options.uploadFailsAt === state.uploadCount) throw new Error('simulated storage error');
    };
    (DocumentStorageService as any).copy = async (sourcePath: string, destinationPath: string) => {
      if (state.options.copyFails) throw new Error('simulated copy error');
      state.copiedPaths.push({ source: sourcePath, destination: destinationPath });
    };
    (DocumentStorageService as any).remove = async (storagePath: string) => {
      state.removedPaths.push(storagePath);
    };
    (DocumentStorageService as any).removeMany = async (paths: string[]) => {
      state.removedPaths.push(...paths);
      if (state.options.cleanupFails) throw new Error('simulated cleanup error');
    };
    (DocumentStorageService as any).createSignedDownloadUrl = async (path: string, expires: number) => {
      state.signedPath = path;
      assert(expires === 300, 'Signed contribution URLs must expire after 300 seconds');
      return 'https://signed.example.test/file';
    };
    return await action(state);
  } finally {
    (supabaseAdmin as any).from = originalFrom;
    (DocumentStorageService as any).upload = originalUpload;
    (DocumentStorageService as any).copy = originalCopy;
    (DocumentStorageService as any).remove = originalRemove;
    (DocumentStorageService as any).removeMany = originalRemoveMany;
    (DocumentStorageService as any).createSignedDownloadUrl = originalSignedUrl;
  }
}

async function expectError(
  action: () => Promise<unknown>,
  message: string,
  statusCode: number
): Promise<void> {
  try {
    await action();
    throw new Error(`Expected error: ${message}`);
  } catch (error) {
    assert(error instanceof MilestoneContributionError, `Expected MilestoneContributionError: ${message}`);
    assert((error as MilestoneContributionError).message === message, `Expected message: ${message}`);
    assert((error as MilestoneContributionError).statusCode === statusCode, `Expected HTTP ${statusCode}: ${message}`);
  }
}

async function run(): Promise<void> {
  assert(isOperationalV2FirstMilestone('OPERATIONAL_V2', 2, 1), 'Test 1: Operational V2 step one must be recognized');
  assert(!isOperationalV2FirstMilestone('LEGACY', 1, 1) && !isOperationalV2FirstMilestone('OPERATIONAL_V2', 2, 2), 'Test 1: legacy and later stages must not be recognized');
  console.log('Test 1 - Collaboration scope is model/version/step based: passed');

  await withState({}, async (state) => {
    const originalStatus = state.milestone.status;
    const originalPic = state.milestone.pic_id;
    const result = await MilestoneContributionService.create('milestone-1', salesOwner, [], 'Customer discovery context');
    assert(result.note === 'Customer discovery context' && result.attachments.length === 0, 'Test 2: note-only input must be accepted');
    assert(state.contributions[0].status === 'READY' && state.uploadedPaths.length === 0, 'Test 2: note-only input becomes READY without storage');
    assert(state.milestone.status === originalStatus && state.milestone.pic_id === originalPic, 'Test 2: contribution must not change milestone or PIC');
    console.log('Test 2 - Owner SALES creates note-only input without workflow mutation: passed');
  });

  await withState({}, async (state) => {
    const result = await MilestoneContributionService.create(
      'milestone-1',
      salesOwner,
      [makeFile('discovery.pdf'), makeFile('diagram.png')]
    );
    assert(result.attachments.length === 2 && state.attachments.length === 2, 'Test 3: multiple files must be retained');
    assert(state.contributions[0].contributed_by === salesOwner.userId, 'Test 3: the authenticated SALES contributor must be persisted');
    assert(state.uploadedPaths.every((path) => path.startsWith('milestone-contributions/project-1/milestone-1/')), 'Test 3: exact contribution namespace must be used');
    assert(!state.tablesTouched.includes('documents') && !state.tablesTouched.includes('milestone_submission_packages'), 'Test 3: contribution files must not become official documents or submission packages');
    console.log('Test 3 - Multiple files use private contribution metadata and storage only: passed');
  });

  await withState({}, async (state) => {
    await expectError(() => MilestoneContributionService.create('milestone-1', otherSales, [], 'Not mine'), 'Milestone not found', 404);
    await expectError(() => MilestoneContributionService.create('milestone-1', salesOwner, [], '  '), 'Add a note or at least one file.', 400);
    await expectError(() => MilestoneContributionService.create('milestone-1', salesOwner, [makeFile('unsafe.exe')]), 'File format not supported. Allowed formats: PDF, DOCX, XLSX, PPTX, Images, ZIP.', 400);
    await expectError(() => MilestoneContributionService.create('milestone-1', salesOwner, [makeFile('large.pdf', MAX_DOCUMENT_FILE_SIZE_BYTES + 1)]), 'Each file must be 50 MB or smaller.', 400);
    await expectError(() => MilestoneContributionService.create('milestone-1', salesOwner, Array.from({ length: 11 }, () => makeFile('many.pdf'))), 'A maximum of 10 files may be added at once.', 400);
    assert(state.contributions.length === 0, 'Test 4: rejected input must not create metadata');
    console.log('Test 4 - Ownership, non-empty input, file type, size, and count are enforced: passed');
  });

  await withState({ workflowModel: 'LEGACY', workflowVersion: 1 }, async (state) => {
    await expectError(() => MilestoneContributionService.create('milestone-1', salesOwner, [], 'Legacy'), 'Supporting input is only available for the first Operational V2 milestone.', 409);
    assert(state.contributions.length === 0, 'Test 5: legacy input must be rejected before mutation');
  });
  await withState({ stepOrder: 2 }, async (state) => {
    await expectError(() => MilestoneContributionService.create('milestone-1', salesOwner, [], 'Later'), 'Supporting input is only available for the first Operational V2 milestone.', 409);
    assert(state.contributions.length === 0, 'Test 5: later-stage input must be rejected before mutation');
    console.log('Test 5 - Legacy and Operational V2 later milestones are rejected: passed');
  });

  await withState({ milestoneStatus: 'COMPLETED' }, async (state) => {
    await expectError(() => MilestoneContributionService.create('milestone-1', salesOwner, [], 'Late'), 'Supporting input can only be added while the milestone is IN_PROGRESS.', 409);
    assert(state.contributions.length === 0, 'Test 6: completed milestone must not receive new input');
  });
  await withState({ projectPostponed: true }, async (state) => {
    await expectError(() => MilestoneContributionService.create('milestone-1', salesOwner, [], 'Paused'), 'Project is postponed.', 409);
    assert(state.contributions.length === 0, 'Test 6: postponed project must not receive new input');
    console.log('Test 6 - Milestone/project state gates are enforced: passed');
  });
  await withState({ picId: null }, async (state) => {
    await expectError(
      () => MilestoneContributionService.create('milestone-1', salesOwner, [], 'No recipient'),
      'Milestone must have an assigned PIC before supporting input can be added.',
      409
    );
    assert(state.contributions.length === 0, 'Test 6b: an unassigned milestone must not receive supporting input');
    console.log('Test 6b - An assigned PIC is required before contribution: passed');
  });

  await withState({ uploadFailsAt: 2 }, async (state) => {
    await expectError(
      () => MilestoneContributionService.create('milestone-1', salesOwner, [makeFile('one.pdf'), makeFile('two.pdf')]),
      'Unable to save milestone supporting input.',
      500
    );
    assert(state.removedPaths.length === 2, 'Test 7: all attempted exact paths must be compensated');
    assert(state.contributions.length === 0 && state.attachments.length === 0, 'Test 7: successful cleanup must remove staged metadata');
    console.log('Test 7 - Partial storage failure compensates exact paths and metadata: passed');
  });

  await withState({ uploadFailsAt: 1, cleanupFails: true }, async (state) => {
    await expectError(
      () => MilestoneContributionService.create('milestone-1', salesOwner, [makeFile('one.pdf')]),
      'Unable to save milestone supporting input.',
      500
    );
    assert(state.contributions[0]?.status === 'CLEANUP_FAILED', 'Test 8: failed storage cleanup must retain retryable metadata');
    console.log('Test 8 - Cleanup failure is retained safely without returning success: passed');
  });

  await withState({}, async (state) => {
    const created = await MilestoneContributionService.create('milestone-1', salesOwner, [makeFile('evidence.pdf')], 'Context');
    for (const actor of [salesOwner, saPic, headSa, superAdmin]) {
      const listed = await MilestoneContributionService.list('milestone-1', actor);
      assert(listed.length === 1 && listed[0].id === created.id, `Test 9: ${actor.role} expected read access`);
    }
    await expectError(() => MilestoneContributionService.list('milestone-1', otherSales), 'Milestone not found', 404);
    await expectError(() => MilestoneContributionService.list('milestone-1', otherSa), 'Milestone not found', 404);
    assert(canReadMilestoneContributions(headSa, salesOwner.userId, saPic.userId), 'Test 9: HEAD_SA helper access expected');
    console.log('Test 9 - Trusted owner/PIC/reviewer/admin read access and non-disclosure are enforced: passed');

    const attachment = created.attachments[0];
    const download = await MilestoneContributionService.getAttachmentDownloadUrl(
      'milestone-1',
      created.id,
      attachment.id,
      saPic
    );
    assert(download.url === 'https://signed.example.test/file' && download.expires_in_seconds === 300, 'Test 10: signed download response must be safe and short-lived');
    assert(state.signedPath === state.attachments[0].storage_path, 'Test 10: signed URL must use the server-owned exact storage path');
    assert(!JSON.stringify(await MilestoneContributionService.list('milestone-1', salesOwner)).includes('storage_path'), 'Test 10: read metadata must not expose storage paths');
    console.log('Test 10 - Signed download uses exact server metadata without exposing storage paths: passed');
  });

  await withState({}, async (state) => {
    const created = await MilestoneContributionService.create('milestone-1', salesOwner, [makeFile('support.pdf')]);
    const attachment = created.attachments[0];
    await expectError(
      () => MilestoneContributionService.promoteAttachment('milestone-1', created.id, attachment.id, salesOwner),
      'Forbidden',
      403
    );
    await expectError(
      () => MilestoneContributionService.promoteAttachment('milestone-1', created.id, attachment.id, saPic),
      'Forbidden',
      403
    );
    await expectError(
      () => MilestoneContributionService.promoteAttachment('milestone-1', created.id, 'other-attachment', headSa),
      'Supporting attachment not found',
      404
    );

    const promoted = await MilestoneContributionService.promoteAttachment('milestone-1', created.id, attachment.id, headSa);
    assert(promoted.promotion_status === 'PROMOTED' && !promoted.idempotent, 'Test 11: HEAD_SA must promote a supporting attachment');
    assert(state.documents.length === 1 && state.versions.length === 1, 'Test 11: promotion must create one official document and version');
    assert(state.documents[0].project_id === 'project-1' && state.documents[0].milestone_id === 'milestone-1', 'Test 11: official document must retain trusted project and milestone context');
    assert(state.documents[0].category === 'OTHER' && state.documents[0].status === 'APPROVED', 'Test 11: promoted document must be approved OTHER metadata');
    assert(state.versions[0].status === 'APPROVED' && state.versions[0].version_number === 1 && state.versions[0].is_latest, 'Test 11: promoted version must be approved version one');
    assert(!state.tablesTouched.includes('document_version_approvals'), 'Test 11: promotion must not create document version approvals');
    assert(state.attachments[0].promotion_status === 'PROMOTED' && state.attachments[0].promoted_document_id === promoted.promoted_document_id, 'Test 11: attachment must link its promoted official document');
    assert(state.copiedPaths.length === 1 && state.copiedPaths[0].source === state.attachments[0].storage_path, 'Test 11: promotion must copy from the server-owned contribution path');
    assert(state.copiedPaths[0].destination !== state.copiedPaths[0].source && state.copiedPaths[0].destination.startsWith('project-1/'), 'Test 11: official document must have a distinct official storage path');
    assert(!state.removedPaths.includes(state.attachments[0].storage_path), 'Test 11: original supporting input must remain intact');
    assert(state.activityLogs.length === 1 && state.activityLogs[0].action === 'SUPPORTING_DOCUMENT_PROMOTED', 'Test 11: activity logging must run after durable promotion');

    const idempotent = await MilestoneContributionService.promoteAttachment('milestone-1', created.id, attachment.id, superAdmin);
    assert(idempotent.idempotent && state.documents.length === 1, 'Test 11: SUPER_ADMIN repeat promotion must be idempotent without duplicate documents');
    console.log('Test 11 - Reviewer/admin promotion creates a distinct official copy, preserves source, and is idempotent: passed');
  });

  await withState({ copyFails: true }, async (state) => {
    const created = await MilestoneContributionService.create('milestone-1', salesOwner, [makeFile('copy-fails.pdf')]);
    await expectError(
      () => MilestoneContributionService.promoteAttachment('milestone-1', created.id, created.attachments[0].id, headSa),
      'Unable to promote supporting attachment.',
      500
    );
    assert(state.attachments[0].promotion_status === 'NOT_PROMOTED' && !state.attachments[0].promoted_document_id, 'Test 12: storage copy failure must release the promotion claim');
    assert(state.documents.length === 0 && state.versions.length === 0, 'Test 12: storage copy failure must not create official metadata');
    console.log('Test 12 - Storage copy failure restores the promotion state without documents: passed');
  });

  await withState({}, async (state) => {
    const created = await MilestoneContributionService.create('milestone-1', salesOwner, [makeFile('admin-promotes.pdf')]);
    const promoted = await MilestoneContributionService.promoteAttachment('milestone-1', created.id, created.attachments[0].id, superAdmin);
    assert(promoted.promotion_status === 'PROMOTED' && !promoted.idempotent && state.documents.length === 1, 'Test 13: SUPER_ADMIN must be able to promote a supporting attachment');
    console.log('Test 13 - SUPER_ADMIN promotes a supporting attachment: passed');
  });

  await withState({ versionInsertFails: true }, async (state) => {
    const created = await MilestoneContributionService.create('milestone-1', salesOwner, [makeFile('metadata-fails.pdf')]);
    await expectError(
      () => MilestoneContributionService.promoteAttachment('milestone-1', created.id, created.attachments[0].id, superAdmin),
      'Unable to promote supporting attachment.',
      500
    );
    assert(state.documents.length === 0 && state.versions.length === 0, 'Test 14: metadata failure must remove operation-owned official metadata');
    assert(state.removedPaths.some((path) => path.startsWith('project-1/')), 'Test 14: metadata failure must remove the copied official object');
    assert(state.attachments[0].promotion_status === 'NOT_PROMOTED', 'Test 14: metadata failure must restore the attachment state');
    console.log('Test 14 - Metadata failure compensates the copied object and official metadata: passed');
  });

  await withState({ activityLogFails: true }, async (state) => {
    const created = await MilestoneContributionService.create('milestone-1', salesOwner, [makeFile('activity-fails.pdf')]);
    const promoted = await MilestoneContributionService.promoteAttachment('milestone-1', created.id, created.attachments[0].id, headSa);
    assert(promoted.promotion_status === 'PROMOTED' && state.documents.length === 1, 'Test 15: activity logging failure must not fail durable promotion');
    console.log('Test 15 - Activity log failure is best-effort after durable promotion: passed');
  });

  await withState({}, async (state) => {
    const created = await MilestoneContributionService.create('milestone-1', salesOwner, [makeFile('claimed.pdf')]);
    state.attachments[0].promotion_status = 'PROMOTING';
    await expectError(
      () => MilestoneContributionService.promoteAttachment('milestone-1', created.id, created.attachments[0].id, headSa),
      'Supporting attachment promotion is already in progress.',
      409
    );
    assert(state.documents.length === 0, 'Test 16: a concurrent promotion claim must not create duplicate official documents');
    console.log('Test 16 - Concurrent promotion claim is rejected safely: passed');
  });
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
