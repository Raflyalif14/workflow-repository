import { DocumentAccessService, DocumentAccessError, accessMetadata, RepositoryAccess } from './document-access.service';
import { ArtifactMutationService, ArtifactMutationError, artifactFileManifest } from './artifact-mutation.service';
import { supabaseAdmin } from '../config/supabase';
import { canAccessProject } from './project-access.service';
import { DocumentStorageService } from '../utils/storage.util';
import {
  CreateCommentInput,
  ListDocumentsQuery,
  ReviewVersionInput,
  UploadVersionInput,
} from '../validators/document.validator';

export type DocumentActor = { userId: string; role: string; fullName: string };
type Actor = DocumentActor;
type DocumentStatus = 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED';
type DocumentApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVISED';

type ProjectRow = {
  id: string;
  name: string;
  customer: string | null;
  sales_id: string;
  pic_id: string | null;
  status: string;
  is_postponed: boolean | null;
};

type MilestoneRow = {
  id: string;
  project_id: string;
  name: string;
  step_order: number;
};

type DocumentRow = {
  id: string;
  project_id: string;
  milestone_id: string | null;
  title: string;
  category: string;
  status: DocumentStatus;
  created_at: string;
  updated_at: string;
};

type DocumentVersionRow = {
  id: string;
  document_id: string;
  version_number: number;
  file_name: string;
  storage_path: string;
  file_size: number | string;
  mime_type: string;
  changelog: string | null;
  status: DocumentStatus;
  is_latest: boolean;
  uploaded_by: string;
  created_at: string;
};

type DocumentApprovalRow = {
  id: string;
  document_version_id: string;
  status: DocumentApprovalStatus;
  action_role: string;
  feedback: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

type DocumentCommentRow = {
  id: string;
  document_id: string;
  milestone_id: string | null;
  author_id: string;
  content: string;
  created_at: string;
};

type UserRow = {
  id: string;
  full_name: string;
  role: string;
};

export type DocumentVersionLifecycleState = Pick<DocumentVersionRow, 'id' | 'version_number' | 'status' | 'is_latest'>;
export type DocumentApprovalLifecycleState = Pick<DocumentApprovalRow, 'id' | 'document_version_id' | 'status'>;
type VersionState = DocumentVersionLifecycleState;

export type DocumentVersionUploadOrigin =
  | 'SALES_MILESTONE'
  | 'SALES_SUPPORTING_INPUT'
  | 'MILESTONE_SUBMISSION'
  | 'CATEGORIZED_LEGACY'
  | 'LEGACY_OR_OTHER';

const documentFields = 'id,project_id,milestone_id,title,category,status,created_at,updated_at';
const versionFields = 'id,document_id,version_number,file_name,storage_path,file_size,mime_type,changelog,status,is_latest,uploaded_by,created_at';
const approvalFields = 'id,document_version_id,status,action_role,feedback,reviewed_by,reviewed_at,created_at';
const commentFields = 'id,document_id,milestone_id,author_id,content,created_at';
const userFields = 'id,full_name,role';

export class DocumentServiceError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = 'DocumentServiceError';
  }
}

export function toSafeDocumentServiceError(error: unknown, fallback: string): DocumentServiceError {
  if (error instanceof DocumentServiceError) return error;
  return new DocumentServiceError(fallback, 500);
}

const asDocumentStatus = (value: string): DocumentStatus => value as DocumentStatus;

const toUser = (user: UserRow | undefined, fallbackId: string) => ({
  id: user?.id || fallbackId,
  fullName: user?.full_name || 'Unknown user',
  role: user?.role || 'UNKNOWN',
});

const toProject = (project: ProjectRow | undefined) =>
  project
    ? {
        id: project.id,
        name: project.name,
        projectCode: project.id.slice(0, 8).toUpperCase(),
        clientName: project.customer || '-',
      }
    : undefined;

const toMilestone = (milestone: MilestoneRow | undefined) =>
  milestone
    ? {
        id: milestone.id,
        name: milestone.name,
        orderIndex: milestone.step_order,
      }
    : null;

export function canAccessDocumentProject(
  project: Pick<ProjectRow, 'sales_id' | 'pic_id'>,
  actor: DocumentActor
): boolean {
  return canAccessProject(project, actor);
}

export function getDocumentVersionUploadOrigin(
  document: Pick<DocumentRow, 'category'>,
  initialVersion?: Pick<DocumentVersionRow, 'changelog'> | null
): DocumentVersionUploadOrigin {
  if (initialVersion?.changelog === 'Initial SALES milestone document upload.') return 'SALES_MILESTONE';
  if (initialVersion?.changelog === 'Promoted from supporting input.') return 'SALES_SUPPORTING_INPUT';
  if (initialVersion?.changelog === 'Promoted from approved milestone submission.') return 'MILESTONE_SUBMISSION';
  if (document.category !== 'OTHER') return 'CATEGORIZED_LEGACY';
  return 'LEGACY_OR_OTHER';
}

export function canUploadOfficialDocumentVersion(
  document: Pick<DocumentRow, 'category'>,
  project: Pick<ProjectRow, 'sales_id' | 'pic_id' | 'status' | 'is_postponed'>,
  initialVersion: Pick<DocumentVersionRow, 'uploaded_by' | 'changelog'> | null | undefined,
  actor: DocumentActor
): boolean {
  if (project.status !== 'ACTIVE' || project.is_postponed === true || !initialVersion) return false;
  if (actor.role === 'SUPER_ADMIN') return false;
  if (!['SALES', 'SA', 'HEAD_SA'].includes(actor.role)) return false;
  if (!canAccessDocumentProject(project, actor)) return false;

  const origin = getDocumentVersionUploadOrigin(document, initialVersion);
  if (origin === 'SALES_MILESTONE' || origin === 'SALES_SUPPORTING_INPUT') {
    return actor.role === 'SALES' && project.sales_id === actor.userId;
  }
  if (origin === 'MILESTONE_SUBMISSION') {
    return ['SA', 'HEAD_SA'].includes(actor.role) && project.pic_id === actor.userId;
  }

  // Historical repository rows have no explicit provenance field. Preserve the
  // original uploader's mutation ownership instead of deriving write access
  // from the broader project read scope.
  return initialVersion.uploaded_by === actor.userId;
}

export function assertOfficialDocumentVersionUploadAllowed(
  document: Pick<DocumentRow, 'category'>,
  project: Pick<ProjectRow, 'sales_id' | 'pic_id' | 'status' | 'is_postponed'>,
  initialVersion: Pick<DocumentVersionRow, 'uploaded_by' | 'changelog'> | null | undefined,
  actor: DocumentActor
): void {
  if (project.status !== 'ACTIVE' || project.is_postponed === true) {
    throw new DocumentServiceError('Document versions can only be uploaded while the project is active.', 409);
  }
  if (!canUploadOfficialDocumentVersion(document, project, initialVersion, actor)) {
    throw new DocumentServiceError('Forbidden', 403);
  }
}

export function buildNewVersionLifecyclePlan(
  latestVersions: DocumentVersionLifecycleState[],
  approvals: DocumentApprovalLifecycleState[]
) {
  const latestVersionIds = latestVersions.map((version) => version.id);
  const latestVersionIdSet = new Set(latestVersionIds);

  return {
    latestVersionIds,
    pendingApprovalIds: approvals
      .filter((approval) => latestVersionIdSet.has(approval.document_version_id) && approval.status === 'PENDING')
      .map((approval) => approval.id),
  };
}

export function assertDocumentReviewer(actor: DocumentActor): void {
  if (!['HEAD_SA', 'SUPER_ADMIN'].includes(actor.role)) {
    throw new DocumentServiceError('Forbidden', 403);
  }
}

export function assertDocumentVersionReviewable(
  version: Pick<DocumentVersionRow, 'status' | 'is_latest'>,
  pendingApproval: Pick<DocumentApprovalRow, 'status'> | null
): void {
  if (!version.is_latest || version.status !== 'SUBMITTED') {
    throw new DocumentServiceError('Only the latest submitted document version can be reviewed.', 409);
  }
  if (!pendingApproval || pendingApproval.status !== 'PENDING') {
    throw new DocumentServiceError('Document version has no pending review.', 409);
  }
}

export function buildDocumentReviewRollback(
  version: Pick<DocumentVersionRow, 'status'>,
  document: Pick<DocumentRow, 'status' | 'updated_at'>,
  approval: Pick<DocumentApprovalRow, 'status' | 'feedback' | 'reviewed_by' | 'reviewed_at'>
) {
  return {
    version: { status: version.status },
    document: { status: document.status, updated_at: document.updated_at },
    approval: {
      status: approval.status,
      feedback: approval.feedback,
      reviewed_by: approval.reviewed_by,
      reviewed_at: approval.reviewed_at,
    },
  };
}

export class DocumentService {
  private static async getProject(projectId: string): Promise<ProjectRow> {
    const { data, error } = await supabaseAdmin
      .from('projects')
      .select('id,name,customer,sales_id,pic_id,status,is_postponed')
      .eq('id', projectId)
      .maybeSingle();

    if (error) throw new DocumentServiceError('Failed to retrieve document data.', 500);
    if (!data) throw new DocumentServiceError('Project not found', 404);
    return data as ProjectRow;
  }

  private static assertProjectAccess(project: ProjectRow, actor: Actor): void {
    if (canAccessProject(project, actor)) return;

    throw new DocumentServiceError('Forbidden', 403);
  }

  private static async assertMilestoneBelongsToProject(milestoneId: string, projectId: string): Promise<void> {
    const { data, error } = await supabaseAdmin
      .from('project_milestones')
      .select('id')
      .eq('id', milestoneId)
      .eq('project_id', projectId)
      .maybeSingle();

    if (error) throw new DocumentServiceError('Failed to retrieve document data.', 500);
    if (!data) throw new DocumentServiceError('Milestone does not belong to the selected project.');
  }

  private static async getRawDocument(documentId: string): Promise<DocumentRow> {
    const { data, error } = await supabaseAdmin
      .from('documents')
      .select(documentFields)
      .eq('id', documentId)
      .maybeSingle();

    if (error) throw new DocumentServiceError('Failed to retrieve document data.', 500);
    if (!data) throw new DocumentServiceError('Document not found', 404);
    return data as DocumentRow;
  }

  private static async getRawVersion(versionId: string): Promise<DocumentVersionRow> {
    const { data, error } = await supabaseAdmin
      .from('document_versions')
      .select(versionFields)
      .eq('id', versionId)
      .maybeSingle();

    if (error) throw new DocumentServiceError('Failed to retrieve document data.', 500);
    if (!data) throw new DocumentServiceError('Document version not found', 404);
    return data as DocumentVersionRow;
  }

  private static async assertDocumentAccess(document: DocumentRow, actor: Actor): Promise<ProjectRow> {
    const project = await this.getProject(document.project_id);
    this.assertProjectAccess(project, actor);
    return project;
  }


  private static async loadUsers(userIds: string[]): Promise<Map<string, UserRow>> {
    const ids = [...new Set(userIds.filter(Boolean))];
    if (!ids.length) return new Map();

    const { data, error } = await supabaseAdmin.from('users').select(userFields).in('id', ids);
    if (error) throw new DocumentServiceError('Failed to retrieve document data.', 500);
    return new Map(((data || []) as UserRow[]).map((user) => [user.id, user]));
  }

  private static mapApproval(row: DocumentApprovalRow, users: Map<string, UserRow>) {
    return {
      id: row.id,
      status: row.status,
      actionRole: row.action_role,
      feedback: row.feedback,
      approvedAt: row.reviewed_at,
      approver: row.reviewed_by ? toUser(users.get(row.reviewed_by), row.reviewed_by) : null,
    };
  }

  private static mapVersion(
    row: DocumentVersionRow,
    approvals: DocumentApprovalRow[],
    users: Map<string, UserRow>
  ) {
    return {
      id: row.id,
      documentId: row.document_id,
      versionNumber: row.version_number,
      fileName: row.file_name,
      fileUrl: `/documents/versions/${row.id}/download-url`,
      fileSize: Number(row.file_size),
      mimeType: row.mime_type,
      changelog: row.changelog,
      status: asDocumentStatus(row.status),
      isLatest: row.is_latest,
      uploadedBy: toUser(users.get(row.uploaded_by), row.uploaded_by),
      approvals: approvals.map((approval) => this.mapApproval(approval, users)),
      createdAt: row.created_at,
    };
  }

  private static mapComment(row: DocumentCommentRow, users: Map<string, UserRow>) {
    return {
      id: row.id,
      documentId: row.document_id,
      content: row.content,
      createdAt: row.created_at,
      author: toUser(users.get(row.author_id), row.author_id),
    };
  }

  private static async hydrateDocuments(documents: DocumentRow[], includeComments: boolean, actor: Actor, accesses?: Map<string, RepositoryAccess>): Promise<any[]> {
    if (!documents.length) return [];
    const sharedOnly = documents.filter(document => accesses?.get(document.id)?.project_access === false);
    if (sharedOnly.length) {
      const native = await this.hydrateDocuments(documents.filter(document => !sharedOnly.includes(document)), includeComments, actor, accesses);
      const { data: versions, error } = await supabaseAdmin.from('document_versions')
        .select('id,document_id,version_number,file_name,file_size,mime_type,status,is_latest,created_at')
        .in('document_id', sharedOnly.map(document => document.id)).eq('status', 'APPROVED').eq('is_latest', true);
      if (error) throw new DocumentServiceError('Failed to retrieve document data.', 500);
      const shared = sharedOnly.flatMap(document => {
        const version = versions?.find(version => version.document_id === document.id);
        if (!version) return [];
        return [{ id: document.id, projectId: document.project_id, title: document.title, category: document.category,
          status: 'APPROVED', createdAt: document.created_at, updatedAt: document.updated_at,
          canUploadVersion: false, ...accessMetadata(accesses!.get(document.id)!), versions: [{
            id: version.id, documentId: document.id, versionNumber: version.version_number, fileName: version.file_name,
            fileSize: Number(version.file_size), mimeType: version.mime_type, status: version.status,
            isLatest: true, createdAt: version.created_at, fileUrl: `/documents/versions/${version.id}/download-url`,
          }] }];
      });
      const result = new Map([...native, ...shared].map(document => [document.id, document]));
      return documents.flatMap(document => result.has(document.id) ? [result.get(document.id)] : []);
    }

    const documentIds = documents.map((document) => document.id);
    const projectIds = [...new Set(documents.map((document) => document.project_id))];
    const milestoneIds = [...new Set(documents.map((document) => document.milestone_id).filter((id): id is string => Boolean(id)))];

    const [projectResult, milestoneResult, versionResult, commentResult] = await Promise.all([
      supabaseAdmin.from('projects').select('id,name,customer,sales_id,pic_id,status,is_postponed').in('id', projectIds),
      milestoneIds.length
        ? supabaseAdmin.from('project_milestones').select('id,project_id,name,step_order').in('id', milestoneIds)
        : Promise.resolve({ data: [], error: null }),
      supabaseAdmin
        .from('document_versions')
        .select(versionFields)
        .in('document_id', documentIds)
        .order('version_number', { ascending: false }),
      supabaseAdmin
        .from('document_comments')
        .select(commentFields)
        .in('document_id', documentIds)
        .order('created_at', { ascending: true }),
    ]);

    if (projectResult.error || milestoneResult.error || versionResult.error || commentResult.error) {
      throw new DocumentServiceError('Failed to retrieve document data.', 500);
    }

    const versions = (versionResult.data || []) as DocumentVersionRow[];
    const comments = (commentResult.data || []) as DocumentCommentRow[];
    const versionIds = versions.map((version) => version.id);
    const { data: approvalData, error: approvalError } = versionIds.length
      ? await supabaseAdmin
          .from('document_version_approvals')
          .select(approvalFields)
          .in('document_version_id', versionIds)
          .order('created_at', { ascending: false })
      : { data: [], error: null };

    if (approvalError) throw new DocumentServiceError('Failed to retrieve document data.', 500);
    const approvals = (approvalData || []) as DocumentApprovalRow[];
    const users = await this.loadUsers([
      ...versions.map((version) => version.uploaded_by),
      ...comments.map((comment) => comment.author_id),
      ...approvals.map((approval) => approval.reviewed_by).filter((id): id is string => Boolean(id)),
    ]);

    const projects = new Map(((projectResult.data || []) as ProjectRow[]).map((project) => [project.id, project]));
    const milestones = new Map(((milestoneResult.data || []) as MilestoneRow[]).map((milestone) => [milestone.id, milestone]));

    return documents.map((document) => {
      const documentVersions = versions
        .filter((version) => version.document_id === document.id && (actor.role !== 'SALES' || (version.status === 'APPROVED' && version.is_latest)))
        .sort((left, right) => right.version_number - left.version_number);
      const initialVersion = versions.filter(version => version.document_id === document.id)
        .sort((a, b) => a.version_number - b.version_number)[0];
      const project = projects.get(document.project_id);
      const documentComments = comments.filter((comment) => comment.document_id === document.id);

      return {
        id: document.id,
        ...(accesses?.get(document.id) ? accessMetadata(accesses.get(document.id)!) : {}),
        projectId: document.project_id,
        milestoneId: document.milestone_id,
        title: document.title,
        category: document.category,
        status: asDocumentStatus(document.status),
        createdAt: document.created_at,
        updatedAt: document.updated_at,
        project: toProject(project),
        milestone: document.milestone_id ? toMilestone(milestones.get(document.milestone_id)) : null,
        canUploadVersion: Boolean(
          project && canUploadOfficialDocumentVersion(document, project, initialVersion, actor)
        ),
        versions: documentVersions.map((version) =>
          this.mapVersion(
            version,
            approvals.filter((approval) => approval.document_version_id === version.id),
            users
          )
        ),
        ...(includeComments ? { comments: documentComments.map((comment) => this.mapComment(comment, users)) } : {}),
        _count: {
          versions: documentVersions.length,
          comments: documentComments.length,
        },
      };
    });
  }

  static async listDocuments(query: ListDocumentsQuery, actor: Actor) {
    const authorized = (await DocumentAccessService.list(actor, 'OFFICIAL', { includeSharing: true }))
      .filter(access => !query.projectId || access.project_id === query.projectId);
    if (!authorized.length) return [];
    const accesses = new Map(authorized.map(access => [access.source_id, access]));
    const pageSize = 100;
    const ids = authorized.map(access => access.source_id);
    const scopes = Array.from({ length: Math.ceil(ids.length / pageSize) }, (_, index) => ids.slice(index * pageSize, (index + 1) * pageSize));
    const results: Awaited<ReturnType<typeof DocumentService.hydrateDocuments>> = [];
    for (const scope of scopes) {
      for (let offset = 0; ; offset += pageSize) {
        let request: any = supabaseAdmin.from('documents').select(documentFields)
          .order('updated_at', { ascending: false }).order('id', { ascending: true });
        request = request.in('id', scope);
        if (query.milestoneId) request = request.eq('milestone_id', query.milestoneId);
        if (query.category) request = request.eq('category', query.category);
        if (query.status) request = request.eq('status', query.status);
        if (actor.role === 'SALES') request = request.eq('status', 'APPROVED');
        if (query.search?.trim()) request = request.ilike('title', `%${query.search.trim()}%`);
        const { data, error } = await request.range(offset, offset + pageSize - 1);
        if (error) throw new DocumentServiceError('Failed to retrieve document data.', 500);
        results.push(...await this.hydrateDocuments((data || []) as DocumentRow[], false, actor, accesses));
        if (!data || data.length < pageSize) break;
      }
    }
    return results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  }

  static async getDocumentById(documentId: string, actor: Actor) {
    const document = await this.getRawDocument(documentId);
    const access = await this.readRepositoryAccess(documentId, actor);
    const [hydrated] = await this.hydrateDocuments([document], true, actor, new Map([[documentId, access]]));
    if (!hydrated) throw new DocumentServiceError('Document not found', 404);
    return hydrated;
  }

  static async uploadNewVersion(documentId: string, input: UploadVersionInput, file: Express.Multer.File, actor: Actor, requestId?: string) {
    const document = await this.getRawDocument(documentId);
    const project = await this.assertDocumentAccess(document, actor);
    const { data, error } = await supabaseAdmin.from('document_versions').select('uploaded_by,changelog,version_number')
      .eq('document_id', documentId).order('version_number', { ascending: true }).limit(1);
    if (error) throw new DocumentServiceError('Failed to retrieve document data.', 500);
    assertOfficialDocumentVersionUploadAllowed(document, project, data?.[0], actor);
    try {
      return await ArtifactMutationService.execute(actor.userId, 'VERSION', {
        document_id: documentId, changelog: input.changelog, expected_updated_at: document.updated_at,
        files: artifactFileManifest([file]),
      }, requestId, async files => { await DocumentStorageService.upload(file, files[0].path); });
    } catch (error) { throw new DocumentServiceError('Failed to upload document version.', error instanceof ArtifactMutationError ? error.statusCode : 500); }
  }

  static async reviewVersion(versionId: string, input: ReviewVersionInput, actor: Actor, requestId?: string) {
    assertDocumentReviewer(actor);
    const version = await this.getRawVersion(versionId);
    const document = await this.getRawDocument(version.document_id);
    await this.assertDocumentAccess(document, actor);
    try {
      await ArtifactMutationService.execute(actor.userId, 'REVIEW', { version_id: versionId,
        status: input.status, feedback: input.feedback?.trim() || null, expected_updated_at: document.updated_at }, requestId);
    } catch (error) { throw new DocumentServiceError('Failed to review document version.', error instanceof ArtifactMutationError ? error.statusCode : 500); }
    return this.getDocumentById(document.id, actor);
  }

  static async addComment(documentId: string, input: CreateCommentInput, actor: Actor, requestId?: string) {
    const document = await this.getRawDocument(documentId);
    await this.assertDocumentAccess(document, actor);
    if (input.milestoneId) await this.assertMilestoneBelongsToProject(input.milestoneId, document.project_id);
    let comment;
    try {
      comment = await ArtifactMutationService.execute(actor.userId, 'COMMENT', { document_id: documentId,
        content: input.content.trim(), milestone_id: input.milestoneId || null }, requestId);
    } catch (error) { throw new DocumentServiceError('Failed to add document comment.', error instanceof ArtifactMutationError ? error.statusCode : 500); }
    return this.mapComment(comment as DocumentCommentRow, await this.loadUsers([actor.userId]));
  }

  private static async readRepositoryAccess(documentId: string, actor: Actor) {
    return DocumentAccessService.read(actor, 'OFFICIAL', documentId).catch(error => {
      if (error instanceof DocumentAccessError) throw new DocumentServiceError('Document not found', error.statusCode);
      throw error;
    });
  }

  static async getDownloadUrl(versionId: string, actor: Actor) {
    const version = await this.getRawVersion(versionId);
    const document = await this.getRawDocument(version.document_id);
    const access = await this.readRepositoryAccess(document.id, actor);
    if ((!access.project_access || actor.role === 'SALES') && (version.status !== 'APPROVED' || !version.is_latest)) {
      throw new DocumentServiceError('Document version not found', 404);
    }

    try {
      return {
        url: await DocumentStorageService.createSignedDownloadUrl(version.storage_path),
        expires_in_seconds: 300,
      };
    } catch {
      throw new DocumentServiceError('Failed to create document download URL.', 500);
    }
  }
}
