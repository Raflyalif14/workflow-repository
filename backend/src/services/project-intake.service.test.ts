import { readFileSync } from 'fs';
import { join } from 'path';
import { supabaseAdmin } from '../config/supabase';
import { DocumentStorageService } from '../utils/storage.util';
import { ProjectIntakeError, ProjectIntakeService } from './project-intake.service';

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

type State = {
  project: { id: string; sales_id: string; pic_id: string };
  attachments: Array<Record<string, unknown>>;
  signedPaths: string[];
  signedUrlFails: boolean;
};

const projectId = 'project-1';
const attachmentId = 'intake-1';
const actors = {
  admin: { userId: 'admin-1', role: 'SUPER_ADMIN' },
  headSa: { userId: 'head-sa-1', role: 'HEAD_SA' },
  sales: { userId: 'sales-1', role: 'SALES' },
  assignedSa: { userId: 'sa-1', role: 'SA' },
  unrelatedSales: { userId: 'sales-2', role: 'SALES' },
  unrelatedSa: { userId: 'sa-2', role: 'SA' },
};

const makeState = (): State => ({
  project: { id: projectId, sales_id: actors.sales.userId, pic_id: actors.assignedSa.userId },
  attachments: [
    {
      id: attachmentId,
      project_id: projectId,
      kind: 'MOM',
      original_filename: 'intake-mom.pdf',
      mime_type: 'application/pdf',
      size_bytes: 512,
      storage_path: 'project-intake/project-1/intake-1/uuid-intake-mom.pdf',
      created_at: '2026-09-10T00:00:00.000Z',
    },
  ],
  signedPaths: [],
  signedUrlFails: false,
});

class QueryMock {
  private readonly filters: Array<{ column: string; value: unknown }> = [];

  constructor(private readonly state: State, private readonly table: string) {}

  select(): this { return this; }
  eq(column: string, value: unknown): this { this.filters.push({ column, value }); return this; }
  order(): this { return this; }
  maybeSingle(): Promise<{ data: unknown; error: null }> { return Promise.resolve(this.execute(true)); }
  then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.execute(false)).then(onfulfilled, onrejected);
  }

  private value(column: string): unknown {
    return this.filters.find((filter) => filter.column === column)?.value;
  }

  private execute(single: boolean): { data: unknown; error: null } {
    if (this.table === 'projects') {
      return { data: this.value('id') === this.state.project.id ? { ...this.state.project } : null, error: null };
    }
    if (this.table === 'project_intake_attachments') {
      const rows = this.state.attachments.filter((attachment) =>
        (!this.value('id') || attachment.id === this.value('id'))
        && (!this.value('project_id') || attachment.project_id === this.value('project_id'))
      );
      return { data: single ? (rows[0] || null) : rows.map((attachment) => ({ ...attachment })), error: null };
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
    (DocumentStorageService as any).createSignedDownloadUrl = async (storagePath: string, expiresInSeconds: number) => {
      assert(expiresInSeconds === 300, 'Signed intake URLs must retain the 300-second lifetime');
      state.signedPaths.push(storagePath);
      if (state.signedUrlFails) throw new Error('raw provider storage failure');
      return 'https://signed.example.test/intake';
    };
    return await action(state);
  } finally {
    (supabaseAdmin as any).from = originalFrom;
    (DocumentStorageService as any).createSignedDownloadUrl = originalSignedUrl;
  }
}

async function expectNotFound(action: () => Promise<unknown>, message: string): Promise<void> {
  try {
    await action();
  } catch (error) {
    assert(error instanceof ProjectIntakeError && error.statusCode === 404, message);
    return;
  }
  throw new Error(`${message}: expected rejection`);
}

async function main(): Promise<void> {
  await withState(async (state) => {
    for (const actor of [actors.admin, actors.headSa, actors.sales, actors.assignedSa]) {
      const attachments = await ProjectIntakeService.list(projectId, actor);
      assert(attachments.length === 1 && attachments[0].file_name === 'intake-mom.pdf', 'Test 1: authorized project readers can list intake evidence');
      assert(!JSON.stringify(attachments).includes('storage_path'), 'Test 1: list responses must never expose intake storage paths');
      await ProjectIntakeService.getDownloadUrl(projectId, attachmentId, actor);
    }
    assert(state.signedPaths.length === 4 && state.signedPaths.every((path) => path.startsWith('project-intake/')), 'Test 1: authorized readers receive signed URLs for exact intake paths');
    console.log('Test 1 - SUPER_ADMIN, HEAD_SA, owning SALES, and assigned SA can read/download project intake evidence: passed');
  });

  await withState(async () => {
    await expectNotFound(() => ProjectIntakeService.list(projectId, actors.unrelatedSales), 'Test 2: unrelated SALES cannot list intake evidence');
    await expectNotFound(() => ProjectIntakeService.getDownloadUrl(projectId, attachmentId, actors.unrelatedSales), 'Test 2: unrelated SALES cannot download intake evidence');
    await expectNotFound(() => ProjectIntakeService.list(projectId, actors.unrelatedSa), 'Test 2: unrelated SA cannot list intake evidence');
    await expectNotFound(() => ProjectIntakeService.getDownloadUrl(projectId, attachmentId, actors.unrelatedSa), 'Test 2: unrelated SA cannot download intake evidence');
    console.log('Test 2 - Unrelated SALES and SA users receive non-disclosing denials: passed');
  });

  await withState(async (state) => {
    state.signedUrlFails = true;
    try {
      await ProjectIntakeService.getDownloadUrl(projectId, attachmentId, actors.sales);
      throw new Error('Expected signed URL failure');
    } catch (error) {
      assert(error instanceof ProjectIntakeError && error.statusCode === 500, 'Test 3: storage failures must use a safe service error');
      assert((error as Error).message === 'Failed to create project intake download URL.' && !(error as Error).message.includes('provider'), 'Test 3: storage details must not leak through the download error');
    }
    console.log('Test 3 - Intake signed URL failures remain client-safe: passed');
  });

  const documentService = readFileSync(join(__dirname, 'document.service.ts'), 'utf8');
  const globalSearchService = readFileSync(join(__dirname, 'global-search.service.ts'), 'utf8');
  const intakeMigration = readFileSync(join(__dirname, '../../supabase/phase11p-project-intake-evidence.sql'), 'utf8');
  assert(!documentService.includes('project_intake_attachments'), 'Test 4: document listing service does not read intake evidence');
  assert(!globalSearchService.includes('project_intake_attachments'), 'Test 4: global search does not include intake evidence');
  console.log('Test 4 - Intake evidence stays outside official Documents and global search: passed');
  assert(
    intakeMigration.includes('create unique index if not exists project_intake_attachments_one_mom_per_project_idx')
      && intakeMigration.includes('on public.project_intake_attachments(project_id)')
      && intakeMigration.includes("where kind = 'MOM';"),
    'Test 5: intake migration enforces at most one MoM attachment per project'
  );
  console.log('Test 5 - Intake migration enforces one MoM attachment per project: passed');
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Project intake test failed.');
  process.exitCode = 1;
});
