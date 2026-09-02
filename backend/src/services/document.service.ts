import { randomUUID } from 'crypto';
import { supabaseAdmin } from '../config/supabase';
import { buildDocumentStoragePath, DocumentStorageService } from '../utils/storage.util';
import {
  CreateCommentInput,
  CreateDocumentInput,
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
  return (
    actor.role === 'SUPER_ADMIN' ||
    actor.role === 'HEAD_SA' ||
    (actor.role === 'SALES' && project.sales_id === actor.userId) ||
    (actor.role === 'SA' && project.pic_id === actor.userId)
  );
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
      .select('id,name,customer,sales_id,pic_id')
      .eq('id', projectId)
      .maybeSingle();

    if (error) throw new DocumentServiceError('Failed to retrieve document data.', 500);
    if (!data) throw new DocumentServiceError('Project not found', 404);
    return data as ProjectRow;
  }

  private static assertProjectAccess(project: ProjectRow, actor: Actor): void {
    if (canAccessDocumentProject(project, actor)) return;

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

  private static async getAccessibleProjectIds(actor: Actor): Promise<string[] | null> {
    if (actor.role === 'SUPER_ADMIN' || actor.role === 'HEAD_SA') return null;

    let request: any = supabaseAdmin.from('projects').select('id');
    if (actor.role === 'SALES') request = request.eq('sales_id', actor.userId);
    else if (actor.role === 'SA') request = request.eq('pic_id', actor.userId);
    else return [];

    const { data, error } = await request;
    if (error) throw new DocumentServiceError('Failed to retrieve document data.', 500);
    return (data || []).map((project: { id: string }) => project.id);
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

  private static async hydrateDocuments(documents: DocumentRow[], includeComments: boolean) {
    if (!documents.length) return [];

    const documentIds = documents.map((document) => document.id);
    const projectIds = [...new Set(documents.map((document) => document.project_id))];
    const milestoneIds = [...new Set(documents.map((document) => document.milestone_id).filter((id): id is string => Boolean(id)))];

    const [projectResult, milestoneResult, versionResult, commentResult] = await Promise.all([
      supabaseAdmin.from('projects').select('id,name,customer,sales_id,pic_id').in('id', projectIds),
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
        .filter((version) => version.document_id === document.id)
        .sort((left, right) => right.version_number - left.version_number);
      const documentComments = comments.filter((comment) => comment.document_id === document.id);

      return {
        id: document.id,
        projectId: document.project_id,
        milestoneId: document.milestone_id,
        title: document.title,
        category: document.category,
        status: asDocumentStatus(document.status),
        createdAt: document.created_at,
        updatedAt: document.updated_at,
        project: toProject(projects.get(document.project_id)),
        milestone: document.milestone_id ? toMilestone(milestones.get(document.milestone_id)) : null,
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

  private static async logDocumentActivity(actor: Actor, projectId: string, action: string, description: string): Promise<void> {
    const { error } = await supabaseAdmin.from('activity_logs').insert({
      project_id: projectId,
      user_id: actor.userId,
      action,
      description,
    });

    if (error) throw new DocumentServiceError('Failed to record document activity.', 500);
  }

  private static async removeUploadedFile(storagePath: string, cleanupErrors: string[]): Promise<void> {
    try {
      await DocumentStorageService.remove(storagePath);
    } catch {
      cleanupErrors.push('storage');
    }
  }

  private static async uploadDocumentFile(
    file: Express.Multer.File,
    storagePath: string,
    fallback: string
  ): Promise<void> {
    try {
      await DocumentStorageService.upload(file, storagePath);
    } catch {
      throw new DocumentServiceError(fallback, 500);
    }
  }

  private static reportRollbackFailure(operation: string, cleanupErrors: string[]): void {
    if (cleanupErrors.length) {
      console.error(`[DocumentService] ${operation} rollback did not fully complete.`);
    }
  }

  static async listDocuments(query: ListDocumentsQuery, actor: Actor) {
    if (query.projectId) {
      const project = await this.getProject(query.projectId);
      this.assertProjectAccess(project, actor);
    }

    const accessibleProjectIds = query.projectId ? [query.projectId] : await this.getAccessibleProjectIds(actor);
    if (accessibleProjectIds && !accessibleProjectIds.length) return [];

    let request: any = supabaseAdmin
      .from('documents')
      .select(documentFields)
      .order('updated_at', { ascending: false });

    if (accessibleProjectIds) request = request.in('project_id', accessibleProjectIds);
    if (query.milestoneId) request = request.eq('milestone_id', query.milestoneId);
    if (query.category) request = request.eq('category', query.category);
    if (query.status) request = request.eq('status', query.status);
    if (query.search?.trim()) request = request.ilike('title', `%${query.search.trim()}%`);

    const { data, error } = await request;
    if (error) throw new DocumentServiceError('Failed to retrieve document data.', 500);
    return this.hydrateDocuments((data || []) as DocumentRow[], false);
  }

  static async getDocumentById(documentId: string, actor: Actor) {
    const document = await this.getRawDocument(documentId);
    await this.assertDocumentAccess(document, actor);
    const [hydrated] = await this.hydrateDocuments([document], true);
    return hydrated;
  }

  static async createDocument(input: CreateDocumentInput, file: Express.Multer.File, actor: Actor) {
    const project = await this.getProject(input.projectId);
    this.assertProjectAccess(project, actor);
    if (input.milestoneId) await this.assertMilestoneBelongsToProject(input.milestoneId, input.projectId);

    const documentId = randomUUID();
    const versionId = randomUUID();
    const storagePath = buildDocumentStoragePath(input.projectId, documentId, file.originalname);
    let documentInserted = false;

    await this.uploadDocumentFile(file, storagePath, 'Failed to create document.');

    try {
      const { error: documentError } = await supabaseAdmin.from('documents').insert({
        id: documentId,
        project_id: input.projectId,
        milestone_id: input.milestoneId || null,
        title: input.title.trim(),
        category: input.category,
        status: 'SUBMITTED',
      });
      if (documentError) throw new DocumentServiceError('Failed to create document.', 500);
      documentInserted = true;

      const { error: versionError } = await supabaseAdmin.from('document_versions').insert({
        id: versionId,
        document_id: documentId,
        version_number: 1,
        file_name: file.originalname,
        storage_path: storagePath,
        file_size: file.size,
        mime_type: file.mimetype || 'application/octet-stream',
        changelog: input.changelog?.trim() || 'Initial document version upload.',
        status: 'SUBMITTED',
        is_latest: true,
        uploaded_by: actor.userId,
      });
      if (versionError) throw new DocumentServiceError('Failed to create document.', 500);

      const { error: approvalError } = await supabaseAdmin.from('document_version_approvals').insert({
        document_version_id: versionId,
        status: 'PENDING',
        action_role: 'HEAD_SA',
      });
      if (approvalError) throw new DocumentServiceError('Failed to create document.', 500);

      await this.logDocumentActivity(
        actor,
        input.projectId,
        'DOCUMENT_UPLOADED',
        `${actor.fullName} uploaded document '${input.title.trim()}' (v1: ${file.originalname})`
      );
    } catch (error) {
      const cleanupErrors: string[] = [];
      if (documentInserted) {
        const { error: deleteError } = await supabaseAdmin.from('documents').delete().eq('id', documentId);
        if (deleteError) cleanupErrors.push('document');
      }
      await this.removeUploadedFile(storagePath, cleanupErrors);
      this.reportRollbackFailure('Document creation', cleanupErrors);
      throw toSafeDocumentServiceError(error, 'Failed to create document.');
    }

    return this.getDocumentById(documentId, actor);
  }

  static async uploadNewVersion(
    documentId: string,
    input: UploadVersionInput,
    file: Express.Multer.File,
    actor: Actor
  ) {
    const document = await this.getRawDocument(documentId);
    const project = await this.assertDocumentAccess(document, actor);
    const { data: versionsData, error: versionsError } = await supabaseAdmin
      .from('document_versions')
      .select('id,version_number,status,is_latest')
      .eq('document_id', documentId)
      .order('version_number', { ascending: false });

    if (versionsError) throw new DocumentServiceError('Failed to retrieve document data.', 500);
    const versions = (versionsData || []) as VersionState[];
    const latestVersions = versions.filter((version) => version.is_latest);
    const { data: approvalData, error: approvalLookupError } = latestVersions.length
      ? await supabaseAdmin
          .from('document_version_approvals')
          .select('id,document_version_id,status')
          .in('document_version_id', latestVersions.map((version) => version.id))
      : { data: [], error: null };
    if (approvalLookupError) throw new DocumentServiceError('Failed to retrieve document data.', 500);

    const lifecyclePlan = buildNewVersionLifecyclePlan(
      latestVersions,
      (approvalData || []) as DocumentApprovalLifecycleState[]
    );
    const nextVersionNumber = (versions[0]?.version_number || 0) + 1;
    const versionId = randomUUID();
    const storagePath = buildDocumentStoragePath(document.project_id, documentId, file.originalname);
    let demotedLatestVersions: VersionState[] = [];
    let revisedApprovalIds: string[] = [];
    let insertedVersion = false;
    let updatedDocument = false;
    let submittedAt: string | null = null;

    await this.uploadDocumentFile(file, storagePath, 'Failed to upload document version.');

    try {
      if (lifecyclePlan.latestVersionIds.length) {
        for (const version of latestVersions) {
          const { data: demotedRow, error: demoteError } = await supabaseAdmin
            .from('document_versions')
            .update({ is_latest: false, status: 'SUPERSEDED' })
            .eq('id', version.id)
            .eq('is_latest', true)
            .eq('status', version.status)
            .select('id')
            .maybeSingle();
          if (demoteError) throw new DocumentServiceError('Failed to upload document version.', 500);
          if (!demotedRow) throw new DocumentServiceError('Document version is no longer latest.', 409);
          demotedLatestVersions.push(version);
        }
      }

      if (lifecyclePlan.pendingApprovalIds.length) {
        const { data: revisedRows, error: reviseError } = await supabaseAdmin
          .from('document_version_approvals')
          .update({ status: 'REVISED' })
          .in('id', lifecyclePlan.pendingApprovalIds)
          .eq('status', 'PENDING')
          .select('id');
        if (reviseError) throw new DocumentServiceError('Failed to upload document version.', 500);
        if ((revisedRows || []).length !== lifecyclePlan.pendingApprovalIds.length) {
          throw new DocumentServiceError('Document version approval is no longer pending.', 409);
        }
        revisedApprovalIds = (revisedRows || []).map((approval) => approval.id);
      }

      const { error: insertError } = await supabaseAdmin.from('document_versions').insert({
        id: versionId,
        document_id: documentId,
        version_number: nextVersionNumber,
        file_name: file.originalname,
        storage_path: storagePath,
        file_size: file.size,
        mime_type: file.mimetype || 'application/octet-stream',
        changelog: input.changelog.trim(),
        status: 'SUBMITTED',
        is_latest: true,
        uploaded_by: actor.userId,
      });
      if (insertError) throw new DocumentServiceError('Failed to upload document version.', 500);
      insertedVersion = true;

      submittedAt = new Date().toISOString();
      const { data: updatedDocumentRow, error: documentError } = await supabaseAdmin
        .from('documents')
        .update({ status: 'SUBMITTED', updated_at: submittedAt })
        .eq('id', documentId)
        .eq('status', document.status)
        .eq('updated_at', document.updated_at)
        .select('id')
        .maybeSingle();
      if (documentError) throw new DocumentServiceError('Failed to upload document version.', 500);
      if (!updatedDocumentRow) throw new DocumentServiceError('Document is no longer available for upload.', 409);
      updatedDocument = true;

      const { error: approvalError } = await supabaseAdmin.from('document_version_approvals').insert({
        document_version_id: versionId,
        status: 'PENDING',
        action_role: 'HEAD_SA',
      });
      if (approvalError) throw new DocumentServiceError('Failed to upload document version.', 500);

      await this.logDocumentActivity(
        actor,
        project.id,
        'DOCUMENT_VERSION_UPLOADED',
        `${actor.fullName} uploaded v${nextVersionNumber} for document '${document.title}'`
      );
    } catch (error) {
      const cleanupErrors: string[] = [];
      if (insertedVersion) {
        const { error: deleteError } = await supabaseAdmin.from('document_versions').delete().eq('id', versionId);
        if (deleteError) cleanupErrors.push('version');
      }
      if (updatedDocument && submittedAt) {
        const { data: restoredDocument, error: restoreDocumentError } = await supabaseAdmin
          .from('documents')
          .update({ status: document.status, updated_at: document.updated_at })
          .eq('id', documentId)
          .eq('status', 'SUBMITTED')
          .eq('updated_at', submittedAt)
          .select('id')
          .maybeSingle();
        if (restoreDocumentError || !restoredDocument) cleanupErrors.push('document');
      }
      if (demotedLatestVersions.length) {
        for (const version of demotedLatestVersions) {
          const { data: restoredVersion, error: restoreVersionError } = await supabaseAdmin
            .from('document_versions')
            .update({ is_latest: true, status: version.status })
            .eq('id', version.id)
            .eq('is_latest', false)
            .eq('status', 'SUPERSEDED')
            .select('id')
            .maybeSingle();
          if (restoreVersionError || !restoredVersion) cleanupErrors.push('previous-version');
        }
      }
      if (revisedApprovalIds.length) {
        const { data: restoredApprovals, error: restoreApprovalError } = await supabaseAdmin
          .from('document_version_approvals')
          .update({ status: 'PENDING' })
          .in('id', revisedApprovalIds)
          .eq('status', 'REVISED')
          .select('id');
        if (restoreApprovalError || (restoredApprovals || []).length !== revisedApprovalIds.length) {
          cleanupErrors.push('approval');
        }
      }
      await this.removeUploadedFile(storagePath, cleanupErrors);
      this.reportRollbackFailure('Document version upload', cleanupErrors);
      throw toSafeDocumentServiceError(error, 'Failed to upload document version.');
    }

    return this.getDocumentById(documentId, actor);
  }

  static async reviewVersion(versionId: string, input: ReviewVersionInput, actor: Actor) {
    assertDocumentReviewer(actor);

    const version = await this.getRawVersion(versionId);
    const document = await this.getRawDocument(version.document_id);
    await this.assertDocumentAccess(document, actor);

    const { data: pendingApproval, error: pendingApprovalError } = await supabaseAdmin
      .from('document_version_approvals')
      .select('id,status,feedback,reviewed_by,reviewed_at')
      .eq('document_version_id', versionId)
      .eq('status', 'PENDING')
      .order('created_at', { ascending: false })
      .maybeSingle();
    if (pendingApprovalError) throw new DocumentServiceError('Failed to retrieve document data.', 500);
    const reviewApproval = pendingApproval as Pick<
      DocumentApprovalRow,
      'id' | 'status' | 'feedback' | 'reviewed_by' | 'reviewed_at'
    > | null;
    assertDocumentVersionReviewable(version, reviewApproval);
    if (!reviewApproval) throw new DocumentServiceError('Document version has no pending review.', 409);
    const rollbackState = buildDocumentReviewRollback(version, document, reviewApproval);

    const reviewedAt = new Date().toISOString();
    let versionUpdated = false;
    let documentUpdated = false;
    let approvalUpdated = false;

    try {
      const { data: updatedVersion, error: versionError } = await supabaseAdmin
        .from('document_versions')
        .update({ status: input.status })
        .eq('id', versionId)
        .eq('status', 'SUBMITTED')
        .eq('is_latest', true)
        .select('id')
        .maybeSingle();
      if (versionError) throw new DocumentServiceError('Failed to review document version.', 500);
      if (!updatedVersion) throw new DocumentServiceError('Document version is no longer submitted.', 409);
      versionUpdated = true;

      const { data: updatedDocument, error: documentError } = await supabaseAdmin
        .from('documents')
        .update({ status: input.status, updated_at: reviewedAt })
        .eq('id', document.id)
        .eq('status', document.status)
        .eq('updated_at', document.updated_at)
        .select('id')
        .maybeSingle();
      if (documentError) throw new DocumentServiceError('Failed to review document version.', 500);
      if (!updatedDocument) throw new DocumentServiceError('Document is no longer available for review.', 409);
      documentUpdated = true;

      const { data: updatedApproval, error: approvalError } = await supabaseAdmin
        .from('document_version_approvals')
        .update({
          status: input.status,
          feedback: input.feedback?.trim() || null,
          reviewed_by: actor.userId,
          reviewed_at: reviewedAt,
        })
        .eq('id', reviewApproval.id)
        .eq('status', 'PENDING')
        .select('id')
        .maybeSingle();
      if (approvalError) throw new DocumentServiceError('Failed to review document version.', 500);
      if (!updatedApproval) throw new DocumentServiceError('Document review is no longer pending.', 409);
      approvalUpdated = true;

      await this.logDocumentActivity(
        actor,
        document.project_id,
        input.status === 'APPROVED' ? 'DOCUMENT_APPROVED' : 'DOCUMENT_REJECTED',
        `${actor.fullName} ${input.status === 'APPROVED' ? 'approved' : 'rejected'} document '${document.title}' (v${version.version_number})`
      );
    } catch (error) {
      const cleanupErrors: string[] = [];
      if (approvalUpdated) {
        const { data: restoredApproval, error: restoreApprovalError } = await supabaseAdmin
          .from('document_version_approvals')
          .update(rollbackState.approval)
          .eq('id', reviewApproval.id)
          .eq('status', input.status)
          .eq('reviewed_by', actor.userId)
          .eq('reviewed_at', reviewedAt)
          .select('id')
          .maybeSingle();
        if (restoreApprovalError || !restoredApproval) cleanupErrors.push('approval');
      }
      if (documentUpdated) {
        const { data: restoredDocument, error: restoreDocumentError } = await supabaseAdmin
          .from('documents')
          .update(rollbackState.document)
          .eq('id', document.id)
          .eq('status', input.status)
          .eq('updated_at', reviewedAt)
          .select('id')
          .maybeSingle();
        if (restoreDocumentError || !restoredDocument) cleanupErrors.push('document');
      }
      if (versionUpdated) {
        const { data: restoredVersion, error: restoreVersionError } = await supabaseAdmin
          .from('document_versions')
          .update(rollbackState.version)
          .eq('id', versionId)
          .eq('status', input.status)
          .eq('is_latest', true)
          .select('id')
          .maybeSingle();
        if (restoreVersionError || !restoredVersion) cleanupErrors.push('version');
      }
      this.reportRollbackFailure('Document review', cleanupErrors);
      throw toSafeDocumentServiceError(error, 'Failed to review document version.');
    }

    return this.getDocumentById(document.id, actor);
  }

  static async addComment(documentId: string, input: CreateCommentInput, actor: Actor) {
    const document = await this.getRawDocument(documentId);
    await this.assertDocumentAccess(document, actor);
    if (input.milestoneId) await this.assertMilestoneBelongsToProject(input.milestoneId, document.project_id);

    const { data, error } = await supabaseAdmin
      .from('document_comments')
      .insert({
        document_id: documentId,
        milestone_id: input.milestoneId || document.milestone_id,
        author_id: actor.userId,
        content: input.content.trim(),
      })
      .select(commentFields)
      .single();

    if (error || !data) throw new DocumentServiceError('Failed to add document comment.', 500);
    await this.logDocumentActivity(actor, document.project_id, 'DOCUMENT_COMMENT_ADDED', `${actor.fullName} commented on document '${document.title}'`);
    const users = await this.loadUsers([actor.userId]);
    return this.mapComment(data as DocumentCommentRow, users);
  }

  static async getDownloadUrl(versionId: string, actor: Actor) {
    const version = await this.getRawVersion(versionId);
    const document = await this.getRawDocument(version.document_id);
    await this.assertDocumentAccess(document, actor);

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
