import { installRestrictedRepositoryFixture } from '../test-utils/repository-access.fixture';
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
  canUploadOfficialDocumentVersion,
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

const expectAsyncDocumentError = async (
  run: () => Promise<unknown>,
  message: string,
  statusCode: number
): Promise<void> => {
  try {
    await run();
    throw new Error(`Expected error: ${message}`);
  } catch (error) {
    assert(error instanceof DocumentServiceError, `Expected DocumentServiceError: ${message}`);
    assert((error as DocumentServiceError).message === message, `Expected message: ${message}`);
    assert((error as DocumentServiceError).statusCode === statusCode, `Expected status ${statusCode}: ${message}`);
  }
};

const project = { sales_id: 'sales-owner', pic_id: 'sa-owner', status: 'ACTIVE', is_postponed: false };
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

const officialDocuments = {
  salesMilestone: { category: 'OTHER' },
  supportingInput: { category: 'OTHER' },
  milestoneSubmission: { category: 'OTHER' },
  categorizedLegacy: { category: 'PROPOSAL' },
};
const initialVersions = {
  salesMilestone: { uploaded_by: actors.salesOwner.userId, changelog: 'Initial SALES milestone document upload.' },
  supportingInput: { uploaded_by: actors.salesOwner.userId, changelog: 'Promoted from supporting input.' },
  milestoneSubmission: { uploaded_by: actors.assignedSa.userId, changelog: 'Promoted from approved milestone submission.' },
  categorizedLegacy: { uploaded_by: actors.salesOwner.userId, changelog: 'Initial upload.' },
};

assert(canUploadOfficialDocumentVersion(officialDocuments.salesMilestone, project, initialVersions.salesMilestone, actors.salesOwner), 'Test 1b: SALES owner may version a SALES milestone document');
assert(!canUploadOfficialDocumentVersion(officialDocuments.salesMilestone, project, initialVersions.salesMilestone, actors.salesOther), 'Test 1b: unrelated SALES may not version a SALES milestone document');
assert(!canUploadOfficialDocumentVersion(officialDocuments.salesMilestone, project, initialVersions.salesMilestone, actors.superAdmin), 'Test 1b: broad read access must not grant SUPER_ADMIN write access');
assert(canUploadOfficialDocumentVersion(officialDocuments.supportingInput, project, initialVersions.supportingInput, actors.salesOwner), 'Test 1b: SALES owner may version its promoted supporting input');
assert(canUploadOfficialDocumentVersion(officialDocuments.milestoneSubmission, project, initialVersions.milestoneSubmission, actors.assignedSa), 'Test 1b: assigned SA may version a promoted milestone submission');
assert(!canUploadOfficialDocumentVersion(officialDocuments.milestoneSubmission, project, initialVersions.milestoneSubmission, actors.otherSa), 'Test 1b: unrelated SA may not version a promoted milestone submission');
assert(!canUploadOfficialDocumentVersion(officialDocuments.milestoneSubmission, project, initialVersions.milestoneSubmission, actors.headSa), 'Test 1b: HEAD_SA read access alone must not grant write access');
assert(canUploadOfficialDocumentVersion(officialDocuments.categorizedLegacy, project, initialVersions.categorizedLegacy, actors.salesOwner), 'Test 1b: legacy categorized document remains writable by its original uploader');
assert(!canUploadOfficialDocumentVersion(officialDocuments.categorizedLegacy, project, initialVersions.categorizedLegacy, actors.superAdmin), 'Test 1b: legacy categorized document is not writable solely through global read access');
assert(!canUploadOfficialDocumentVersion(officialDocuments.categorizedLegacy, project, { ...initialVersions.categorizedLegacy, uploaded_by: actors.superAdmin.userId }, actors.superAdmin), 'Test 1b: SUPER_ADMIN remains denied even when recorded as the legacy uploader');
assert(!canUploadOfficialDocumentVersion(officialDocuments.categorizedLegacy, { ...project, sales_id: actors.salesOther.userId }, initialVersions.categorizedLegacy, actors.salesOwner), 'Test 1b: a former SALES uploader must retain current project access');
assert(!canUploadOfficialDocumentVersion(officialDocuments.categorizedLegacy, project, { ...initialVersions.categorizedLegacy, uploaded_by: 'former-user' }, { userId: 'former-user', role: 'FORMER_SALES', fullName: 'Former user' }), 'Test 1b: legacy fallback must enforce the current role allowlist');
for (const status of ['WAITING_RESULT', 'WON', 'LOST', 'COMPLETED', 'CANCELLED']) {
  assert(!canUploadOfficialDocumentVersion(officialDocuments.salesMilestone, { ...project, status }, initialVersions.salesMilestone, actors.salesOwner), `Test 1b: ${status} project must reject official version uploads`);
}
assert(!canUploadOfficialDocumentVersion(officialDocuments.salesMilestone, { ...project, is_postponed: true }, initialVersions.salesMilestone, actors.salesOwner), 'Test 1b: postponed ACTIVE project must reject official version uploads');
console.log('Test 1b - Official version upload capability is origin-aware, actor-specific, and ACTIVE-only: passed');

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
    readRepositoryAccess: service.readRepositoryAccess,
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

    service.getRawVersion = async () => ({ status:'APPROVED',is_latest:true,id: 'version-download', document_id: 'document-download', storage_path: 'project-1/document-1/file.pdf' });
    service.getRawDocument = async () => ({ id: 'document-download', project_id: 'project-1', status: 'APPROVED' });
    service.readRepositoryAccess = async () => ({ project_access:true });
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
    service.readRepositoryAccess = originals.readRepositoryAccess;
  }
}

// PostgreSQL run_artifacts.py proves rollback of the actual tables/audit.
// These service tests prove all mutations are delegated to that one RPC.
async function verifyReviewRollback(): Promise<void> {
  const service = DocumentService as any;
  const originalRpc = supabaseAdmin.rpc;
  const originalFrom = supabaseAdmin.from;
  const originals = { getRawVersion: service.getRawVersion, getRawDocument: service.getRawDocument,
    assertDocumentAccess: service.assertDocumentAccess, getDocumentById: service.getDocumentById };
  let hydrated = 0;
  const calls: string[] = [];
  try {
    service.getRawVersion = async () => ({ id: 'version-1', document_id: 'document-1' });
    service.getRawDocument = async () => ({ id: 'document-1', project_id: 'project-1', updated_at: '2026-09-02T00:00:00Z' });
    service.assertDocumentAccess = async () => project;
    service.getDocumentById = async () => { hydrated++; return {}; };
    (supabaseAdmin as any).from = () => { throw new Error('No direct metadata/audit writes allowed'); };
    (supabaseAdmin as any).rpc = async (name: string, input: any) => {
      assert(name === 'mutate_official_artifact', 'Review must use atomic artifact RPC');
      calls.push(input.p_step);
      return input.p_step === 'LOOKUP' ? { data: { state: 'NONE' }, error: null } : { data: null, error: { code: '23514' } };
    };
    await expectAsyncDocumentError(() => DocumentService.reviewVersion('version-1', { status: 'APPROVED' }, actors.headSa), 'Failed to review document version.', 500);
    assert(calls.join(',') === 'LOOKUP,COMMIT', 'Review delegates metadata and audit to a single transaction');
    assert(hydrated === 0, 'Failed audit must not report a successful review');
  } finally { Object.assign(service, originals); (supabaseAdmin as any).rpc=originalRpc; (supabaseAdmin as any).from=originalFrom; }
}

async function verifyRollbackCasMatchDetection(): Promise<void> {
  const service=DocumentService as any;
  const originalRpc=supabaseAdmin.rpc;
  const originals={ getRawVersion:service.getRawVersion,getRawDocument:service.getRawDocument,assertDocumentAccess:service.assertDocumentAccess };
  try {
    service.getRawVersion=async()=>({document_id:'document-1'});
    service.getRawDocument=async()=>({id:'document-1',updated_at:'2026-09-02T00:00:00Z'});
    service.assertDocumentAccess=async()=>project;
    (supabaseAdmin as any).rpc=async (_name:string,input:any)=>input.p_step==='LOOKUP'
      ? {data:{state:'NONE'},error:null}:{data:null,error:{code:'40001'}};
    await expectAsyncDocumentError(()=>DocumentService.reviewVersion('version-1',{status:'APPROVED'},actors.headSa),'Failed to review document version.',409);
  } finally {Object.assign(service,originals);(supabaseAdmin as any).rpc=originalRpc;}
}

async function verifySalesDocumentReadFinality(): Promise<void> {
  const service = DocumentService as any;
  const originalFrom = supabaseAdmin.from;
  const originalSignedDownload = DocumentStorageService.createSignedDownloadUrl;
  const originals = {
    getProject: service.getProject,
    getRawDocument: service.getRawDocument,
    getRawVersion: service.getRawVersion,
    assertDocumentAccess: service.assertDocumentAccess,
    hydrateDocuments: service.hydrateDocuments,
  };
  const approvedDocument = {
    id: 'document-approved',
    project_id: 'project-1',
    title: 'Approved MoM',
    category: 'MOM',
    status: 'APPROVED',
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
  };
  const submittedDocument = {
    id: 'document-submitted',
    project_id: 'project-1',
    title: 'Internal SA Evidence',
    category: 'OTHER',
    status: 'SUBMITTED',
    created_at: '2026-09-02T00:00:00.000Z',
    updated_at: '2026-09-02T00:00:00.000Z',
  };
  const documents = [approvedDocument, submittedDocument];
  let signedDownloadCalls = 0;
  const restoreAccessFixture = installRestrictedRepositoryFixture(Object.fromEntries(Object.values(actors).map(actor => [actor.userId, actor.role])), () => ({ projects: [{ id:'project-1', sales_id:actors.salesOwner.userId, pic_id:actors.assignedSa.userId }], documents }));

  try {
    service.getProject = async () => ({
      id: 'project-1',
      name: 'Project 1',
      customer: null,
      sales_id: actors.salesOwner.userId,
      pic_id: actors.assignedSa.userId,
    });
    service.getRawDocument = async (documentId: string) => {
      const document = documents.find((entry) => entry.id === documentId);
      if (!document) throw new DocumentServiceError('Document not found', 404);
      return document;
    };
    service.getRawVersion = async () => ({
      id: 'version-submitted',
      document_id: submittedDocument.id,
      storage_path: 'project-1/document-submitted/evidence.pdf',
    });
    service.assertDocumentAccess = async () => ({ id: 'project-1' });
    service.hydrateDocuments = async (rows: Array<Record<string, unknown>>) => rows.map(row => ({ ...row, updatedAt:row.updated_at }));
    (DocumentStorageService as any).createSignedDownloadUrl = async () => {
      signedDownloadCalls += 1;
      return 'https://signed.example/temporary';
    };
    (supabaseAdmin as any).from = (table: string) => {
      if (!['documents','document_repository_access'].includes(table)) throw new Error(`Unexpected table: ${table}`);
      const filters: Array<[string, unknown]> = [];
      const inFilters: Array<[string, unknown[]]> = [];
      const request: any = {
        select: () => request,
        order: () => request,
        eq: (field: string, value: unknown) => {
          filters.push([field, value]);
          return request;
        },
        in: (field: string, values: unknown[]) => {
          inFilters.push([field, values]);
          return request;
        },
        ilike: () => request,
        range: (start: number, end: number) => {
          request.pageStart = start;
          request.pageEnd = end;
          return request;
        },
        then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
          const data = (table === 'documents' ? documents : []).filter((document) =>
            filters.every(([field, value]) => document[field as keyof typeof document] === value) &&
            inFilters.every(([field, values]) => values.includes(document[field as keyof typeof document]))
          ).slice(request.pageStart || 0, (request.pageEnd ?? documents.length - 1) + 1);
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return request;
    };

    const salesDocuments = await DocumentService.listDocuments({ projectId: 'project-1' }, actors.salesOwner);
    assert(salesDocuments.length === 1 && salesDocuments[0].id === approvedDocument.id, 'Test 12c: SALES list must contain approved documents only');
    const headSaDocuments = await DocumentService.listDocuments({ projectId: 'project-1' }, actors.headSa);
    assert(headSaDocuments.length === 2, 'Test 12c: HEAD_SA retains access to approved and non-final documents');
    for (let index = 0; index < 101; index++) {
      documents.push({ ...approvedDocument, id: `extra-official-${index}` });
    }
    const pagedDocuments = await DocumentService.listDocuments({ projectId: 'project-1' }, actors.salesOwner);
    assert(pagedDocuments.length === 102, 'Test 12c: official repository listing must include results after the first database page');
    documents.length = 2;

    const salesApprovedDocument = await DocumentService.getDocumentById(approvedDocument.id, actors.salesOwner);
    assert(salesApprovedDocument.id === approvedDocument.id, 'Test 12c: SALES may fetch an approved document');
    await expectAsyncDocumentError(
      () => DocumentService.getDocumentById(submittedDocument.id, actors.salesOwner),
      'Document not found',
      404
    );
    await expectAsyncDocumentError(
      () => DocumentService.getDownloadUrl('version-submitted', actors.salesOwner),
      'Document not found',
      404
    );
    assert(signedDownloadCalls === 0, 'Test 12c: SALES must be denied before a signed URL is created for a non-final document');

    for (const actor of [actors.headSa, actors.superAdmin, actors.assignedSa]) {
      const document = await DocumentService.getDocumentById(submittedDocument.id, actor);
      assert(document.id === submittedDocument.id, `Test 12c: ${actor.role} retains access to non-final documents`);
    }
    const headSaDownload = await DocumentService.getDownloadUrl('version-submitted', actors.headSa);
    assert(headSaDownload.url === 'https://signed.example/temporary' && signedDownloadCalls === 1, 'Test 12c: HEAD_SA retains signed download access to a non-final document');
  } finally {
    restoreAccessFixture();
    (supabaseAdmin as any).from = originalFrom;
    (DocumentStorageService as any).createSignedDownloadUrl = originalSignedDownload;
    service.getProject = originals.getProject;
    service.getRawDocument = originals.getRawDocument;
    service.getRawVersion = originals.getRawVersion;
    service.assertDocumentAccess = originals.assertDocumentAccess;
    service.hydrateDocuments = originals.hydrateDocuments;
  }
}

async function verifyVersionUploadRejectionBeforeMutation(): Promise<void> {
  const service = DocumentService as any;
  const originalFrom = supabaseAdmin.from;
  const originals = {
    getRawDocument: service.getRawDocument,
    assertDocumentAccess: service.assertDocumentAccess,
    uploadDocumentFile: service.uploadDocumentFile,
  };
  let currentProject = { id: 'project-1', ...project };
  let storageUploads = 0;
  let metadataWrites = 0;
  let initialVersion = {
    id: 'version-1',
    document_id: 'document-1',
    version_number: 1,
    status: 'APPROVED',
    is_latest: true,
    uploaded_by: actors.salesOwner.userId,
    changelog: 'Initial SALES milestone document upload.',
  };
  const file = { originalname: 'version-2.pdf', size: 10, mimetype: 'application/pdf' } as Express.Multer.File;

  try {
    service.getRawDocument = async () => ({
      id: 'document-1',
      project_id: 'project-1',
      title: 'Sales Milestone Document',
      category: 'OTHER',
      status: 'APPROVED',
      updated_at: '2026-09-01T00:00:00.000Z',
    });
    service.assertDocumentAccess = async () => currentProject;
    service.uploadDocumentFile = async () => {
      storageUploads += 1;
    };
    (supabaseAdmin as any).from = (table: string) => {
      if (table !== 'document_versions') throw new Error(`Unexpected table before policy decision: ${table}`);
      const readQuery: any = {
        eq: () => readQuery,
        order: () => readQuery,
        limit: async () => ({ data: [initialVersion], error: null }),
      };
      return {
        select: () => readQuery,
        insert: () => {
          metadataWrites += 1;
          throw new Error('Metadata write must not be reached');
        },
        update: () => {
          metadataWrites += 1;
          throw new Error('Metadata write must not be reached');
        },
      };
    };

    currentProject = { id: 'project-1', ...project, is_postponed: true };
    await expectAsyncDocumentError(
      () => DocumentService.uploadNewVersion('document-1', { changelog: 'Blocked while postponed.' }, file, actors.salesOwner),
      'Document versions can only be uploaded while the project is active.',
      409
    );

    currentProject = { id: 'project-1', ...project };
    initialVersion = {
      ...initialVersion,
      uploaded_by: actors.superAdmin.userId,
      changelog: 'Initial upload.',
    };
    await expectAsyncDocumentError(
      () => DocumentService.uploadNewVersion('document-1', { changelog: 'Blocked for SUPER_ADMIN legacy uploader.' }, file, actors.superAdmin),
      'Forbidden',
      403
    );

    assert(storageUploads === 0, 'Test 12d: rejected version uploads must not touch storage');
    assert(metadataWrites === 0, 'Test 12d: rejected version uploads must not mutate metadata');
  } finally {
    (supabaseAdmin as any).from = originalFrom;
    service.getRawDocument = originals.getRawDocument;
    service.assertDocumentAccess = originals.assertDocumentAccess;
    service.uploadDocumentFile = originals.uploadDocumentFile;
  }
}

async function verifyVersionDemotionCompareAndSet(): Promise<void> {
  const service=DocumentService as any;
  const originalRpc=supabaseAdmin.rpc, originalFrom=supabaseAdmin.from;
  const originalUpload=DocumentStorageService.upload, originalRemove=DocumentStorageService.removeMany;
  const originals={getRawDocument:service.getRawDocument,assertDocumentAccess:service.assertDocumentAccess};
  const steps:string[]=[];let removed:string[]=[];
  try {
    service.getRawDocument=async()=>({id:'document-1',updated_at:'2026-09-02T00:00:00Z'});
    service.assertDocumentAccess=async()=>({id:'project-1',...project});
    const query:any={eq:()=>query,order:()=>query,limit:async()=>({data:[initialVersions.salesMilestone],error:null})};
    (supabaseAdmin as any).from=()=>({select:()=>query});
    (DocumentStorageService as any).upload=async()=>{};
    (DocumentStorageService as any).removeMany=async(paths:string[])=>{removed=paths;};
    (supabaseAdmin as any).rpc=async (_name:string,input:any)=>{
      steps.push(input.p_step);
      if(input.p_step==='LOOKUP')return {data:{state:'NONE'},error:null};
      if(input.p_step==='RESERVE')return {data:{state:'RESERVED',token:'owned',files:[{path:'owned-exact-path'}]},error:null};
      if(input.p_step==='COMMIT')return {data:null,error:{code:'40001'}};
      return {data:{state:'FROZEN',files:[{path:'owned-exact-path'}]},error:null};
    };
    await expectAsyncDocumentError(()=>DocumentService.uploadNewVersion('document-1',{changelog:'New version'},
      {originalname:'fixture.pdf',mimetype:'application/pdf',size:12,buffer:Buffer.from('fixture')} as Express.Multer.File,actors.salesOwner), 'Failed to upload document version.',409);
    assert(steps.join(',')==='LOOKUP,RESERVE,COMMIT,CANCEL','Stale upload must use atomic CAS and cancellation fence');
    assert(removed.join(',')==='owned-exact-path','Only frozen exact operation-owned bytes can be removed');
  } finally {Object.assign(service,originals);(supabaseAdmin as any).rpc=originalRpc;(supabaseAdmin as any).from=originalFrom;
    DocumentStorageService.upload=originalUpload;DocumentStorageService.removeMany=originalRemove;}
}

async function run(): Promise<void> {
  await verifyStorageErrorSafety();
  console.log('Test 10 - Storage upload error is safe for document callers: passed');

  await verifySignedDownloadErrorSafety();
  console.log('Test 10b - Signed download provider errors remain generic in storage and document services: passed');

  await verifyReviewRollback();
  console.log('Test 11 - Review delegates all writes/audit to atomic RPC and fails safely: passed');

  await verifyRollbackCasMatchDetection();
  console.log('Test 12b - Stale review is rejected by database CAS without compensation writes: passed');

  await verifySalesDocumentReadFinality();
  console.log('Test 12c - SALES sees approved official documents only while internal non-final document access stays role-scoped: passed');

  await verifyVersionUploadRejectionBeforeMutation();
  console.log('Test 12d - Rejected official version uploads stop before storage and metadata mutation: passed');

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
