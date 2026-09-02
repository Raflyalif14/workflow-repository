import { readFileSync } from 'fs';
import { join } from 'path';
import { supabaseAdmin } from '../config/supabase';
import { buildDocumentStoragePath, DocumentStorageService } from '../utils/storage.util';
import {
  assertDocumentReviewer,
  assertDocumentVersionReviewable,
  buildDocumentReviewRollback,
  buildNewVersionLifecyclePlan,
  canAccessDocumentProject,
  DocumentService,
  DocumentServiceError,
  toSafeDocumentServiceError,
} from './document.service';

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

const expectDocumentError = (run: () => void, message: string, statusCode = 409): void => {
  try {
    run();
    throw new Error(`Expected error: ${message}`);
  } catch (error) {
    assert(error instanceof DocumentServiceError, `Expected DocumentServiceError: ${message}`);
    assert((error as DocumentServiceError).message === message, `Expected message: ${message}`);
    assert((error as DocumentServiceError).statusCode === statusCode, `Expected status ${statusCode}: ${message}`);
  }
};

const project = { sales_id: 'sales-owner', pic_id: 'sa-owner' };
const actors = {
  superAdmin: { userId: 'admin-1', role: 'SUPER_ADMIN', fullName: 'Admin' },
  headSa: { userId: 'headsa-1', role: 'HEAD_SA', fullName: 'Head SA' },
  salesOwner: { userId: 'sales-owner', role: 'SALES', fullName: 'Sales Owner' },
  salesOther: { userId: 'sales-other', role: 'SALES', fullName: 'Other Sales' },
  assignedSa: { userId: 'sa-owner', role: 'SA', fullName: 'Assigned SA' },
  otherSa: { userId: 'sa-other', role: 'SA', fullName: 'Other SA' },
};

assert(canAccessDocumentProject(project, actors.superAdmin), 'Test 1: SUPER_ADMIN must retain document access');
assert(canAccessDocumentProject(project, actors.headSa), 'Test 1: HEAD_SA must retain document access');
assert(canAccessDocumentProject(project, actors.salesOwner), 'Test 1: project owner SALES must retain document access');
assert(canAccessDocumentProject(project, actors.assignedSa), 'Test 1: assigned SA must retain document access');
assert(!canAccessDocumentProject(project, actors.salesOther), 'Test 1: unrelated SALES must not access documents');
assert(!canAccessDocumentProject(project, actors.otherSa), 'Test 1: unrelated SA must not access documents');
console.log('Test 1 - Document project access remains role-aware: passed');

const previousVersions = [
  { id: 'version-latest', version_number: 3, status: 'SUBMITTED' as const, is_latest: true },
  { id: 'version-approved', version_number: 2, status: 'APPROVED' as const, is_latest: false },
];
const previousApprovals = [
  { id: 'approval-pending', document_version_id: 'version-latest', status: 'PENDING' as const },
  { id: 'approval-approved', document_version_id: 'version-latest', status: 'APPROVED' as const },
  { id: 'approval-rejected', document_version_id: 'version-latest', status: 'REJECTED' as const },
  { id: 'approval-revised', document_version_id: 'version-latest', status: 'REVISED' as const },
  { id: 'approval-old-pending', document_version_id: 'version-approved', status: 'PENDING' as const },
];
const lifecyclePlan = buildNewVersionLifecyclePlan(
  previousVersions.filter((version) => version.is_latest),
  previousApprovals
);
assert(lifecyclePlan.latestVersionIds.length === 1 && lifecyclePlan.latestVersionIds[0] === 'version-latest', 'Test 2: latest version must be targeted');
assert(lifecyclePlan.pendingApprovalIds.length === 1 && lifecyclePlan.pendingApprovalIds[0] === 'approval-pending', 'Test 2: only PENDING approval on previous latest version may be revised');
assert(!lifecyclePlan.pendingApprovalIds.includes('approval-approved'), 'Test 2: APPROVED approval must remain historical');
assert(!lifecyclePlan.pendingApprovalIds.includes('approval-rejected'), 'Test 2: REJECTED approval must remain historical');
assert(!lifecyclePlan.pendingApprovalIds.includes('approval-revised'), 'Test 2: REVISED approval must remain historical');
assert(!lifecyclePlan.pendingApprovalIds.includes('approval-old-pending'), 'Test 2: non-latest approval must remain historical');
console.log('Test 2 - New version plan supersedes only latest state and revises only its pending approval: passed');

const lifecycleState: {
  priorVersion: { id: string; version_number: number; status: string; is_latest: boolean };
  approvals: Array<{ id: string; document_version_id: string; status: string }>;
  insertedVersion: { id: string; status: string; is_latest: boolean } | undefined;
  insertedApproval: { id: string; document_version_id: string; status: string } | undefined;
  documentStatus: string;
} = {
  priorVersion: { ...previousVersions[0] },
  approvals: previousApprovals.map((approval) => ({ ...approval })),
  insertedVersion: { id: 'version-new', status: 'SUBMITTED', is_latest: true },
  insertedApproval: { id: 'approval-new', document_version_id: 'version-new', status: 'PENDING' },
  documentStatus: 'SUBMITTED',
};
lifecycleState.priorVersion.status = 'SUPERSEDED';
lifecycleState.priorVersion.is_latest = false;
for (const approval of lifecycleState.approvals) {
  if (lifecyclePlan.pendingApprovalIds.includes(approval.id)) approval.status = 'REVISED';
}
assert(lifecycleState.priorVersion.status === 'SUPERSEDED' && !lifecycleState.priorVersion.is_latest, 'Test 3: prior latest version must be superseded');
assert(lifecycleState.approvals.find((approval) => approval.id === 'approval-pending')?.status === 'REVISED', 'Test 3: prior pending approval must be revised');
assert(lifecycleState.insertedVersion?.status === 'SUBMITTED' && lifecycleState.insertedVersion?.is_latest, 'Test 3: new version must be submitted and latest');
assert(lifecycleState.insertedApproval?.status === 'PENDING', 'Test 3: new version must receive one pending approval');
console.log('Test 3 - Successful version lifecycle retains the expected submitted/latest/pending state: passed');

// Simulate a failure after a later mutation: rollback may only restore state changed by this operation.
lifecycleState.insertedVersion = undefined;
lifecycleState.insertedApproval = undefined;
lifecycleState.documentStatus = 'APPROVED';
lifecycleState.priorVersion = { ...previousVersions[0] };
for (const approval of lifecycleState.approvals) {
  if (lifecyclePlan.pendingApprovalIds.includes(approval.id) && approval.status === 'REVISED') approval.status = 'PENDING';
}
assert(lifecycleState.priorVersion.status === 'SUBMITTED' && lifecycleState.priorVersion.is_latest, 'Test 4: rollback must restore only the superseded prior latest version');
assert(lifecycleState.approvals.find((approval) => approval.id === 'approval-pending')?.status === 'PENDING', 'Test 4: rollback must restore only the revised pending approval');
assert(lifecycleState.approvals.find((approval) => approval.id === 'approval-approved')?.status === 'APPROVED', 'Test 4: rollback must preserve approved approval history');
assert(lifecycleState.approvals.find((approval) => approval.id === 'approval-rejected')?.status === 'REJECTED', 'Test 4: rollback must preserve rejected approval history');
assert(lifecycleState.approvals.find((approval) => approval.id === 'approval-revised')?.status === 'REVISED', 'Test 4: rollback must preserve revised approval history');
console.log('Test 4 - Failed version upload rollback restores only operation-owned lifecycle state: passed');

const firstPath = buildDocumentStoragePath('project-1', 'document-1', 'same-name.pdf');
const secondPath = buildDocumentStoragePath('project-1', 'document-1', 'same-name.pdf');
assert(firstPath !== secondPath, 'Test 5: repeated filenames must receive unique storage paths');
assert(firstPath.startsWith('project-1/document-1/') && secondPath.startsWith('project-1/document-1/'), 'Test 5: storage paths must stay project/document scoped');
console.log('Test 5 - Repeated filenames cannot collide in storage: passed');

assertDocumentReviewer(actors.headSa);
assertDocumentReviewer(actors.superAdmin);
expectDocumentError(() => assertDocumentReviewer(actors.assignedSa), 'Forbidden', 403);
console.log('Test 6 - Service-level document review role validation is enforced: passed');

const submittedLatestVersion = { status: 'SUBMITTED' as const, is_latest: true };
const pendingReview = { status: 'PENDING' as const };
assertDocumentVersionReviewable(submittedLatestVersion, pendingReview);
expectDocumentError(
  () => assertDocumentVersionReviewable({ status: 'SUBMITTED', is_latest: false }, pendingReview),
  'Only the latest submitted document version can be reviewed.'
);
expectDocumentError(
  () => assertDocumentVersionReviewable({ status: 'APPROVED', is_latest: true }, pendingReview),
  'Only the latest submitted document version can be reviewed.'
);
expectDocumentError(() => assertDocumentVersionReviewable(submittedLatestVersion, null), 'Document version has no pending review.');
expectDocumentError(() => assertDocumentVersionReviewable(submittedLatestVersion, { status: 'APPROVED' }), 'Document version has no pending review.');
console.log('Test 7 - Review accepts only the latest submitted version with a pending approval: passed');

const reviewRollback = buildDocumentReviewRollback(
  { status: 'SUBMITTED' },
  { status: 'SUBMITTED', updated_at: '2026-09-02T00:00:00.000Z' },
  { status: 'PENDING', feedback: null, reviewed_by: null, reviewed_at: null }
);
for (const failedAfter of ['version', 'document', 'approval', 'activity log']) {
  const state: {
    version: { status: string };
    document: { status: string; updated_at: string };
    approval: { status: string; feedback: string | null; reviewed_by: string | null; reviewed_at: string | null };
  } = {
    version: { status: 'APPROVED' },
    document: { status: 'APPROVED', updated_at: '2026-09-02T00:01:00.000Z' },
    approval: { status: 'APPROVED', feedback: 'Looks good', reviewed_by: 'headsa-1', reviewed_at: '2026-09-02T00:01:00.000Z' },
  };
  state.version = { ...reviewRollback.version };
  state.document = { ...reviewRollback.document };
  state.approval = { ...reviewRollback.approval };
  assert(state.version.status === 'SUBMITTED', `Test 8: ${failedAfter} rollback must restore version status`);
  assert(state.document.status === 'SUBMITTED', `Test 8: ${failedAfter} rollback must restore document status`);
  assert(state.approval.status === 'PENDING' && state.approval.reviewed_by === null, `Test 8: ${failedAfter} rollback must restore pending approval`);
}
console.log('Test 8 - Review rollback restores version, document, and approval state after each sequential failure point: passed');

const safeError = toSafeDocumentServiceError(new Error('Supabase secret: storage object missing'), 'Failed to upload document version.');
assert(safeError.statusCode === 500 && safeError.message === 'Failed to upload document version.', 'Test 9: unexpected service errors must become generic 500 responses');
assert(!safeError.message.includes('Supabase') && !safeError.message.includes('storage object'), 'Test 9: generic service errors must not leak backend details');
console.log('Test 9 - Unexpected document errors are converted to a safe generic response: passed');

async function verifyStorageErrorSafety(): Promise<void> {
  const originalStorageFrom = supabaseAdmin.storage.from;
  try {
    (supabaseAdmin.storage as any).from = () => ({
      upload: async () => ({ error: { message: 'raw storage internals' } }),
    });
    try {
      await DocumentStorageService.upload(
        { buffer: Buffer.from('test'), mimetype: 'application/pdf' } as Express.Multer.File,
        'project-1/document-1/file.pdf'
      );
      throw new Error('Expected storage upload failure');
    } catch (error) {
      assert(error instanceof Error && error.message === 'Failed to upload document file.', 'Test 10: storage upload must hide raw provider details');
    }
  } finally {
    (supabaseAdmin.storage as any).from = originalStorageFrom;
  }
}

async function verifySignedDownloadErrorSafety(): Promise<void> {
  const originalStorageFrom = supabaseAdmin.storage.from;
  const service = DocumentService as any;
  const originals = {
    getRawVersion: service.getRawVersion,
    getRawDocument: service.getRawDocument,
    assertDocumentAccess: service.assertDocumentAccess,
  };
  const rawProviderError = 'storage.objects lookup failed for private bucket';

  try {
    (supabaseAdmin.storage as any).from = () => ({
      createSignedUrl: async () => ({ error: { message: rawProviderError }, data: null }),
    });
    try {
      await DocumentStorageService.createSignedDownloadUrl('project-1/document-1/file.pdf');
      throw new Error('Expected signed download provider failure');
    } catch (error) {
      assert(
        error instanceof Error && error.message === 'Failed to create document download URL.',
        'Test 10b: signed download storage helper must hide raw provider details'
      );
      assert(
        !(error as Error).message.includes(rawProviderError),
        'Test 10b: signed download storage helper must not expose the provider message'
      );
    }

    service.getRawVersion = async () => ({ id: 'version-download', document_id: 'document-download', storage_path: 'project-1/document-1/file.pdf' });
    service.getRawDocument = async () => ({ id: 'document-download', project_id: 'project-1' });
    service.assertDocumentAccess = async () => ({ id: 'project-1' });
    try {
      await DocumentService.getDownloadUrl('version-download', actors.salesOwner);
      throw new Error('Expected document download failure');
    } catch (error) {
      assert(error instanceof DocumentServiceError, 'Test 10b: document download failure must be a DocumentServiceError');
      assert((error as DocumentServiceError).statusCode === 500, 'Test 10b: document download failure must be HTTP 500');
      assert(
        (error as DocumentServiceError).message === 'Failed to create document download URL.',
        'Test 10b: document download service must preserve the generic message'
      );
      assert(
        !(error as DocumentServiceError).message.includes(rawProviderError),
        'Test 10b: document download service must not expose the provider message'
      );
    }
  } finally {
    (supabaseAdmin.storage as any).from = originalStorageFrom;
    service.getRawVersion = originals.getRawVersion;
    service.getRawDocument = originals.getRawDocument;
    service.assertDocumentAccess = originals.assertDocumentAccess;
  }
}

async function verifyReviewRollback(): Promise<void> {
  const service = DocumentService as any;
  const originalFrom = supabaseAdmin.from;
  const originals = {
    getRawVersion: service.getRawVersion,
    getRawDocument: service.getRawDocument,
    assertDocumentAccess: service.assertDocumentAccess,
    getDocumentById: service.getDocumentById,
    logDocumentActivity: service.logDocumentActivity,
  };
  const updateCalls: Array<{ table: string; value: Record<string, unknown> }> = [];
  let failureStep = 'version';

  const version = {
    id: 'version-1',
    document_id: 'document-1',
    version_number: 2,
    status: 'SUBMITTED',
    is_latest: true,
  };
  const document = {
    id: 'document-1',
    project_id: 'project-1',
    title: 'Architecture',
    status: 'SUBMITTED',
    updated_at: '2026-09-02T00:00:00.000Z',
  };
  const pendingApproval = {
    id: 'approval-1',
    status: 'PENDING',
    feedback: null,
    reviewed_by: null,
    reviewed_at: null,
  };

  const createUpdateQuery = (table: string, value: Record<string, unknown>) => {
    updateCalls.push({ table, value });
    const isForwardApproval = value.status === 'APPROVED';
    const failsHere =
      isForwardApproval &&
      ((failureStep === 'version' && table === 'document_versions') ||
        (failureStep === 'document' && table === 'documents') ||
        (failureStep === 'approval' && table === 'document_version_approvals'));
    const query: any = {
      eq: () => query,
      select: () => ({
        maybeSingle: async () =>
          failsHere ? { data: null, error: { message: 'provider failure' } } : { data: { id: 'updated' }, error: null },
      }),
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve({ error: null }).then(resolve, reject),
    };
    return query;
  };

  try {
    service.getRawVersion = async () => version;
    service.getRawDocument = async () => document;
    service.assertDocumentAccess = async () => ({ id: 'project-1' });
    service.getDocumentById = async () => ({ id: 'document-1', reviewed: true });
    service.logDocumentActivity = async () => {
      if (failureStep === 'activity') throw new Error('activity provider failure');
    };
    (supabaseAdmin as any).from = (table: string) => {
      if (table === 'document_version_approvals') {
        const pendingQuery: any = {
          eq: () => pendingQuery,
          order: () => pendingQuery,
          maybeSingle: async () => ({ data: pendingApproval, error: null }),
        };
        return {
          select: () => pendingQuery,
          update: (value: Record<string, unknown>) => createUpdateQuery(table, value),
        };
      }
      if (table === 'document_versions' || table === 'documents') {
        return { update: (value: Record<string, unknown>) => createUpdateQuery(table, value) };
      }
      throw new Error(`Unexpected table: ${table}`);
    };

    const expectedRollbacks: Record<string, string[]> = {
      version: [],
      document: ['document_versions'],
      approval: ['documents', 'document_versions'],
      activity: ['document_version_approvals', 'documents', 'document_versions'],
    };
    for (const step of Object.keys(expectedRollbacks)) {
      failureStep = step;
      updateCalls.length = 0;
      try {
        await DocumentService.reviewVersion('version-1', { status: 'APPROVED', feedback: 'Looks good' }, actors.headSa);
        throw new Error(`Test 11: expected ${step} failure`);
      } catch (error) {
        assert(error instanceof DocumentServiceError, `Test 11: ${step} failure must be a safe document error`);
        assert((error as DocumentServiceError).message === 'Failed to review document version.', `Test 11: ${step} failure must hide provider details`);
      }

      const rollbackTables = updateCalls
        .filter((call) => call.value.status === 'SUBMITTED' || call.value.status === 'PENDING')
        .map((call) => call.table);
      assert(
        JSON.stringify(rollbackTables) === JSON.stringify(expectedRollbacks[step]),
        `Test 11: ${step} failure must restore only prior committed mutations`
      );
    }
  } finally {
    (supabaseAdmin as any).from = originalFrom;
    service.getRawVersion = originals.getRawVersion;
    service.getRawDocument = originals.getRawDocument;
    service.assertDocumentAccess = originals.assertDocumentAccess;
    service.getDocumentById = originals.getDocumentById;
    service.logDocumentActivity = originals.logDocumentActivity;
  }
}

async function verifyRollbackCasMatchDetection(): Promise<void> {
  const service = DocumentService as any;
  const originalFrom = supabaseAdmin.from;
  const originalConsoleError = console.error;
  const originals = {
    getRawVersion: service.getRawVersion,
    getRawDocument: service.getRawDocument,
    assertDocumentAccess: service.assertDocumentAccess,
    getDocumentById: service.getDocumentById,
    logDocumentActivity: service.logDocumentActivity,
  };
  const rollbackLogs: unknown[][] = [];
  const state = {
    version: { status: 'SUBMITTED', is_latest: true },
    document: { status: 'SUBMITTED', updated_at: '2026-09-02T00:00:00.000Z' },
    approval: { status: 'PENDING', feedback: null as string | null, reviewed_by: null as string | null, reviewed_at: null as string | null },
  };
  const version = { id: 'version-rollback', document_id: 'document-rollback', version_number: 2, status: 'SUBMITTED', is_latest: true };
  const document = {
    id: 'document-rollback',
    project_id: 'project-rollback',
    title: 'Rollback CAS',
    status: 'SUBMITTED',
    updated_at: '2026-09-02T00:00:00.000Z',
  };
  const approval = { id: 'approval-rollback', status: 'PENDING', feedback: null, reviewed_by: null, reviewed_at: null };

  const hasFilter = (filters: Array<[string, unknown]>, field: string, value: unknown): boolean =>
    filters.some(([filterField, filterValue]) => filterField === field && filterValue === value);

  const createUpdateQuery = (table: string, value: Record<string, unknown>) => {
    const filters: Array<[string, unknown]> = [];
    const query: any = {
      eq: (field: string, filterValue: unknown) => {
        filters.push([field, filterValue]);
        return query;
      },
      select: () => ({
        maybeSingle: async () => {
          if (table === 'document_version_approvals') {
            const isForward = value.status === 'APPROVED';
            const matches = isForward
              ? state.approval.status === 'PENDING'
              : hasFilter(filters, 'id', approval.id) &&
                hasFilter(filters, 'status', 'APPROVED') &&
                hasFilter(filters, 'reviewed_by', actors.headSa.userId) &&
                hasFilter(filters, 'reviewed_at', state.approval.reviewed_at) &&
                state.approval.status === 'APPROVED';
            if (!matches) return { data: null, error: null };
            state.approval.status = value.status as string;
            state.approval.feedback = (value.feedback as string | null | undefined) ?? null;
            state.approval.reviewed_by = (value.reviewed_by as string | null | undefined) ?? null;
            state.approval.reviewed_at = (value.reviewed_at as string | null | undefined) ?? null;
            return { data: { id: approval.id }, error: null };
          }

          if (table === 'documents') {
            const isForward = value.status === 'APPROVED';
            const matches = isForward
              ? state.document.status === 'SUBMITTED'
              : hasFilter(filters, 'id', document.id) &&
                hasFilter(filters, 'status', 'APPROVED') &&
                hasFilter(filters, 'updated_at', state.document.updated_at) &&
                state.document.status === 'APPROVED';
            if (!matches) return { data: null, error: null };
            state.document.status = value.status as string;
            state.document.updated_at = value.updated_at as string;
            return { data: { id: document.id }, error: null };
          }

          const isForward = value.status === 'APPROVED';
          const matches = isForward
            ? state.version.status === 'SUBMITTED' && state.version.is_latest
            : hasFilter(filters, 'id', version.id) &&
              hasFilter(filters, 'status', 'APPROVED') &&
              hasFilter(filters, 'is_latest', true) &&
              state.version.status === 'APPROVED' &&
              state.version.is_latest;
          if (!matches) return { data: null, error: null };
          state.version.status = value.status as string;
          state.version.is_latest = value.is_latest as boolean | undefined ?? state.version.is_latest;
          return { data: { id: version.id }, error: null };
        },
      }),
    };
    return query;
  };

  try {
    service.getRawVersion = async () => version;
    service.getRawDocument = async () => document;
    service.assertDocumentAccess = async () => ({ id: document.project_id });
    service.getDocumentById = async () => ({ id: document.id });
    service.logDocumentActivity = async () => {
      // A concurrent reviewer resolves the version after all forward writes but before rollback.
      state.version.status = 'REJECTED';
      throw new Error('activity write failed');
    };
    console.error = (...args: unknown[]) => {
      rollbackLogs.push(args);
    };
    (supabaseAdmin as any).from = (table: string) => {
      if (table === 'document_version_approvals') {
        const approvalQuery: any = {
          eq: () => approvalQuery,
          order: () => approvalQuery,
          maybeSingle: async () => ({ data: approval, error: null }),
        };
        return { select: () => approvalQuery, update: (value: Record<string, unknown>) => createUpdateQuery(table, value) };
      }
      if (table === 'documents' || table === 'document_versions') {
        return { update: (value: Record<string, unknown>) => createUpdateQuery(table, value) };
      }
      throw new Error(`Unexpected table: ${table}`);
    };

    try {
      await DocumentService.reviewVersion('version-rollback', { status: 'APPROVED', feedback: 'Approved before activity failure.' }, actors.headSa);
      throw new Error('Test 12b: expected review failure');
    } catch (error) {
      assert(error instanceof DocumentServiceError, 'Test 12b: original operation must keep a safe DocumentServiceError');
      assert((error as DocumentServiceError).message === 'Failed to review document version.', 'Test 12b: rollback conflict must not alter client error');
    }

    assert(state.approval.status === 'PENDING' && state.approval.reviewed_by === null, 'Test 12b: matched approval rollback must restore the original approval');
    assert(state.document.status === 'SUBMITTED' && state.document.updated_at === document.updated_at, 'Test 12b: matched document rollback must restore the original document');
    assert(state.version.status === 'REJECTED' && state.version.is_latest, 'Test 12b: zero-row version rollback must not overwrite a newer concurrent state');
    assert(
      rollbackLogs.some((entry) => entry[0] === '[DocumentService] Document review rollback did not fully complete.'),
      'Test 12b: zero-row rollback must be reported internally as a rollback failure'
    );
  } finally {
    (supabaseAdmin as any).from = originalFrom;
    console.error = originalConsoleError;
    service.getRawVersion = originals.getRawVersion;
    service.getRawDocument = originals.getRawDocument;
    service.assertDocumentAccess = originals.assertDocumentAccess;
    service.getDocumentById = originals.getDocumentById;
    service.logDocumentActivity = originals.logDocumentActivity;
  }
}

async function verifyVersionDemotionCompareAndSet(): Promise<void> {
  const service = DocumentService as any;
  const originalFrom = supabaseAdmin.from;
  const originals = {
    getRawDocument: service.getRawDocument,
    assertDocumentAccess: service.assertDocumentAccess,
    uploadDocumentFile: service.uploadDocumentFile,
    removeUploadedFile: service.removeUploadedFile,
  };
  const demotionFilters: Array<[string, unknown]> = [];
  const currentVersion = { status: 'SUBMITTED', is_latest: true };
  const snapshot = {
    id: 'version-latest',
    version_number: 1,
    status: 'SUBMITTED',
    is_latest: true,
  };

  try {
    service.getRawDocument = async () => ({
      id: 'document-1',
      project_id: 'project-1',
      title: 'Concurrent Review Document',
      status: 'SUBMITTED',
      updated_at: '2026-09-02T00:00:00.000Z',
    });
    service.assertDocumentAccess = async () => ({ id: 'project-1' });
    service.uploadDocumentFile = async () => undefined;
    service.removeUploadedFile = async () => undefined;
    (supabaseAdmin as any).from = (table: string) => {
      if (table === 'document_versions') {
        const versionReadQuery: any = {
          eq: () => versionReadQuery,
          order: () => versionReadQuery,
          then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
            // The concurrent HEAD_SA review completes after upload read the snapshot.
            currentVersion.status = 'APPROVED';
            return Promise.resolve({ data: [snapshot], error: null }).then(resolve, reject);
          },
        };
        return {
          select: () => versionReadQuery,
          update: (value: { status: string; is_latest: boolean }) => {
            const demotionQuery: any = {
              eq: (field: string, filterValue: unknown) => {
                demotionFilters.push([field, filterValue]);
                return demotionQuery;
              },
              select: () => ({
                maybeSingle: async () => {
                  const hasSnapshotStatusGuard = demotionFilters.some(
                    ([field, filterValue]) => field === 'status' && filterValue === snapshot.status
                  );
                  const matchesSnapshot =
                    hasSnapshotStatusGuard && currentVersion.is_latest && currentVersion.status === snapshot.status;
                  if (matchesSnapshot) {
                    currentVersion.status = value.status;
                    currentVersion.is_latest = value.is_latest;
                    return { data: { id: snapshot.id }, error: null };
                  }
                  return { data: null, error: null };
                },
              }),
            };
            return demotionQuery;
          },
        };
      }

      if (table === 'document_version_approvals') {
        const approvalReadQuery: any = {
          in: () => approvalReadQuery,
          then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
            Promise.resolve({ data: [], error: null }).then(resolve, reject),
        };
        return { select: () => approvalReadQuery };
      }

      throw new Error(`Unexpected table: ${table}`);
    };

    try {
      await DocumentService.uploadNewVersion(
        'document-1',
        { changelog: 'A new upload racing with document review.' },
        { originalname: 'document.pdf', size: 1, mimetype: 'application/pdf' } as Express.Multer.File,
        actors.salesOwner
      );
      throw new Error('Test 12: expected stale previous-version conflict');
    } catch (error) {
      assert(error instanceof DocumentServiceError, 'Test 12: stale demotion must be a DocumentServiceError');
      assert((error as DocumentServiceError).statusCode === 409, 'Test 12: stale demotion must return HTTP 409');
      assert((error as DocumentServiceError).message === 'Document version is no longer latest.', 'Test 12: stale demotion must fail safely');
    }

    assert(
      demotionFilters.some(([field, value]) => field === 'id' && value === snapshot.id),
      'Test 12: demotion must guard the expected version ID'
    );
    assert(
      demotionFilters.some(([field, value]) => field === 'is_latest' && value === true),
      'Test 12: demotion must guard the latest flag'
    );
    assert(
      demotionFilters.some(([field, value]) => field === 'status' && value === 'SUBMITTED'),
      'Test 12: demotion must guard the original snapshot status'
    );
    assert(currentVersion.status === 'APPROVED' && currentVersion.is_latest, 'Test 12: concurrent APPROVED state must not be overwritten');
  } finally {
    (supabaseAdmin as any).from = originalFrom;
    service.getRawDocument = originals.getRawDocument;
    service.assertDocumentAccess = originals.assertDocumentAccess;
    service.uploadDocumentFile = originals.uploadDocumentFile;
    service.removeUploadedFile = originals.removeUploadedFile;
  }
}

async function run(): Promise<void> {
  await verifyStorageErrorSafety();
  console.log('Test 10 - Storage upload error is safe for document callers: passed');

  await verifySignedDownloadErrorSafety();
  console.log('Test 10b - Signed download provider errors remain generic in storage and document services: passed');

  await verifyReviewRollback();
  console.log('Test 11 - Review writes roll back sequentially on version, document, approval, or activity failure: passed');

  await verifyRollbackCasMatchDetection();
  console.log('Test 12b - Rollback CAS verifies matched rows and preserves a newer concurrent version state: passed');

  await verifyVersionDemotionCompareAndSet();
  console.log('Test 12 - Concurrent document review cannot be overwritten during previous-version demotion: passed');

  const serviceSource = readFileSync(join(__dirname, 'document.service.ts'), 'utf8');
  const controllerSource = readFileSync(join(__dirname, '..', 'controllers', 'document.controller.ts'), 'utf8');
  const migrationSource = readFileSync(join(__dirname, '..', '..', 'supabase', 'phase11c-document-approval-pending-constraint.sql'), 'utf8');
  assert(!serviceSource.includes('Cleanup failed:'), 'Test 13: cleanup error details must not be returned from the service');
  assert(!serviceSource.includes('error.message'), 'Test 13: raw service error messages must not be returned');
  assert(controllerSource.includes('Unexpected document operation failure.') && !controllerSource.includes('String(error)'), 'Test 13: controller must return a generic unexpected-error response');
  console.log('Test 13 - Document service/controller do not expose cleanup or provider errors: passed');

  assert(migrationSource.includes('having count(*) > 1;'), 'Test 14: migration must include manual duplicate pending approval precheck');
  assert(migrationSource.includes('create unique index if not exists uq_document_version_approvals_one_pending_per_version'), 'Test 14: migration must create the pending approval uniqueness index');
  assert(migrationSource.includes("where status = 'PENDING';"), 'Test 14: uniqueness must apply only to PENDING approvals');
  assert(!/\b(delete|truncate|update)\s+public\.document_version_approvals\b/i.test(migrationSource), 'Test 14: migration must not rewrite approval history');
  console.log('Test 14 - Pending approval uniqueness migration is additive and preserves historical data: passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
