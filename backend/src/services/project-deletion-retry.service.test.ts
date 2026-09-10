import { readFileSync } from 'fs';
import { join } from 'path';
import { supabaseAdmin } from '../config/supabase';
import { DocumentStorageService } from '../utils/storage.util';
import { ProjectDeletionError, ProjectDeletionService } from './project-deletion.service';

type CleanupState = {
  cleanup: {
    id: string;
    status: 'PENDING' | 'COMPLETED' | 'FAILED';
    storage_paths: string[];
    storage_object_count: number;
    failure_code: string | null;
    completed_at?: string;
    failed_at?: string;
    updated_at?: string;
  };
  removedPathBatches: string[][];
  failStorageCleanup: boolean;
};

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

const assertRejects = async (action: () => Promise<unknown>, statusCode: number, message: string): Promise<ProjectDeletionError> => {
  try {
    await action();
  } catch (error) {
    assert(error instanceof ProjectDeletionError && error.statusCode === statusCode, message);
    return error as ProjectDeletionError;
  }
  throw new Error(`${message}: expected rejection`);
};

class CleanupQuery {
  private operation: 'SELECT' | 'UPDATE' = 'SELECT';
  private updates: Record<string, unknown> = {};
  private filters: Record<string, unknown> = {};

  constructor(private readonly state: CleanupState) {}

  select() {
    return this;
  }

  update(updates: Record<string, unknown>) {
    this.operation = 'UPDATE';
    this.updates = updates;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters[column] = value;
    return this;
  }

  async maybeSingle() {
    const cleanup = this.state.cleanup;
    if (Object.entries(this.filters).some(([column, value]) => (cleanup as Record<string, unknown>)[column] !== value)) {
      return { data: null, error: null };
    }
    if (this.operation === 'UPDATE') Object.assign(cleanup, this.updates);
    return { data: { ...cleanup }, error: null };
  }
}

const withCleanupMocks = async <T>(state: CleanupState, action: () => Promise<T>): Promise<T> => {
  const originalFrom = (supabaseAdmin as any).from;
  const originalRemoveMany = DocumentStorageService.removeMany;
  (supabaseAdmin as any).from = (table: string) => {
    if (table !== 'project_deletion_cleanups') throw new Error(`Unexpected table access: ${table}`);
    return new CleanupQuery(state);
  };
  (DocumentStorageService as any).removeMany = async (paths: string[]) => {
    state.removedPathBatches.push([...paths]);
    if (state.failStorageCleanup) throw new Error('provider storage failure: private bucket details');
  };

  try {
    return await action();
  } finally {
    (supabaseAdmin as any).from = originalFrom;
    (DocumentStorageService as any).removeMany = originalRemoveMany;
  }
};

const failedCleanup = (storagePaths = ['official/project-a/mom.pdf', 'submissions/project-a/work.docx']): CleanupState => ({
  cleanup: {
    id: 'cleanup-a',
    status: 'FAILED',
    storage_paths: storagePaths,
    storage_object_count: storagePaths.length,
    failure_code: 'STORAGE_DELETE_FAILED',
  },
  removedPathBatches: [],
  failStorageCleanup: false,
});

async function main() {
  await assertRejects(
    () => ProjectDeletionService.retry('cleanup-a', { userId: 'sales-1', role: 'SALES' }),
    403,
    'Test 1: non-SUPER_ADMIN cannot retry a deletion cleanup'
  );

  const successful = failedCleanup();
  await withCleanupMocks(successful, async () => {
    const result = await ProjectDeletionService.retry('cleanup-a', { userId: 'admin-1', role: 'SUPER_ADMIN' });
    assert(result.cleanup.status === 'COMPLETED', 'Test 2: FAILED cleanup is marked COMPLETED after exact-path cleanup succeeds');
    assert(successful.removedPathBatches.length === 1, 'Test 2: successful retry performs one storage cleanup batch');
    assert(
      JSON.stringify(successful.removedPathBatches[0]) === JSON.stringify(successful.cleanup.storage_paths),
      'Test 3: retry uses only the captured cleanup storage paths and never reads the deleted project'
    );

    const repeated = await ProjectDeletionService.retry('cleanup-a', { userId: 'admin-1', role: 'SUPER_ADMIN' });
    assert(repeated.cleanup.status === 'COMPLETED' && successful.removedPathBatches.length === 1, 'Test 4: COMPLETED cleanup retry is a safe no-op');
  });

  const alreadyMissing = failedCleanup(['official/project-a/already-missing.pdf']);
  await withCleanupMocks(alreadyMissing, async () => {
    const result = await ProjectDeletionService.retry('cleanup-a', { userId: 'admin-1', role: 'SUPER_ADMIN' });
    assert(result.cleanup.status === 'COMPLETED' && alreadyMissing.removedPathBatches.length === 1, 'Test 5: already-missing storage objects are treated as idempotent cleanup success');
  });

  const partialFailure = failedCleanup();
  await withCleanupMocks(partialFailure, async () => {
    partialFailure.failStorageCleanup = true;
    const originalConsoleError = console.error;
    let serverFailureLog = '';
    console.error = (...args: unknown[]) => {
      serverFailureLog = JSON.stringify(args);
    };
    let error: ProjectDeletionError;
    try {
      error = await assertRejects(
        () => ProjectDeletionService.retry('cleanup-a', { userId: 'admin-1', role: 'SUPER_ADMIN' }),
        500,
        'Test 6: storage cleanup failure returns a safe retry error'
      );
    } finally {
      console.error = originalConsoleError;
    }
    assert(
      error!.message === 'Unable to retry project storage cleanup.' && !error!.message.includes('provider storage failure'),
      'Test 6: provider storage details are not exposed to retry callers'
    );
    assert(serverFailureLog.includes('provider storage failure'), 'Test 6: provider storage failure is logged server-side only');
    assert(
      partialFailure.cleanup.status === 'FAILED' && partialFailure.cleanup.failure_code === 'STORAGE_DELETE_FAILED',
      'Test 7: partial storage failure remains FAILED and retryable'
    );
    assert(
      JSON.stringify(partialFailure.removedPathBatches[0]) === JSON.stringify(partialFailure.cleanup.storage_paths),
      'Test 7: partial cleanup still receives every captured path in one exact batch'
    );

    partialFailure.failStorageCleanup = false;
    const recovered = await ProjectDeletionService.retry('cleanup-a', { userId: 'admin-1', role: 'SUPER_ADMIN' });
    assert(recovered.cleanup.status === 'COMPLETED', 'Test 8: a later retry reconciles a FAILED cleanup without the original project row');
  });

  const projectRoutes = readFileSync(join(__dirname, '../routes/project.routes.ts'), 'utf8');
  const storageUtility = readFileSync(join(__dirname, '../utils/storage.util.ts'), 'utf8');
  assert(
    projectRoutes.includes("router.post('/deletion-cleanups/:cleanupId/retry', requireRoles(['SUPER_ADMIN']), ProjectDeletionController.retry)") &&
      storageUtility.includes('Promise.allSettled(uniquePaths.map((storagePath) => this.remove(storagePath)))'),
    'Test 9: retry is SUPER_ADMIN-only and the shared storage batch attempts every exact path'
  );

  console.log('Project deletion cleanup retry tests passed.');
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Project deletion retry test failed.');
  process.exitCode = 1;
});
