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

type VersionState = Pick<DocumentVersionRow, 'id' | 'version_number' | 'status' | 'is_latest'>;

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

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

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

export class DocumentService {
  private static async getProject(projectId: string): Promise<ProjectRow> {
    const { data, error } = await supabaseAdmin
      .from('projects')
      .select('id,name,customer,sales_id,pic_id')
      .eq('id', projectId)
      .maybeSingle();

    if (error) throw new DocumentServiceError(error.message, 500);
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

    if (error) throw new DocumentServiceError(error.message, 500);
    if (!data) throw new DocumentServiceError('Milestone does not belong to the selected project.');
  }

  private static async getRawDocument(documentId: string): Promise<DocumentRow> {
    const { data, error } = await supabaseAdmin
      .from('documents')
      .select(documentFields)
      .eq('id', documentId)
      .maybeSingle();

    if (error) throw new DocumentServiceError(error.message, 500);
    if (!data) throw new DocumentServiceError('Document not found', 404);
    return data as DocumentRow;
  }

  private static async getRawVersion(versionId: string): Promise<DocumentVersionRow> {
    const { data, error } = await supabaseAdmin
      .from('document_versions')
      .select(versionFields)
      .eq('id', versionId)
      .maybeSingle();

    if (error) throw new DocumentServiceError(error.message, 500);
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
    if (error) throw new DocumentServiceError(error.message, 500);
    return (data || []).map((project: { id: string }) => project.id);
  }

  private static async loadUsers(userIds: string[]): Promise<Map<string, UserRow>> {
    const ids = [...new Set(userIds.filter(Boolean))];
    if (!ids.length) return new Map();

    const { data, error } = await supabaseAdmin.from('users').select(userFields).in('id', ids);
    if (error) throw new DocumentServiceError(error.message, 500);
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

    if (projectResult.error) throw new DocumentServiceError(projectResult.error.message, 500);
    if (milestoneResult.error) throw new DocumentServiceError(milestoneResult.error.message, 500);
    if (versionResult.error) throw new DocumentServiceError(versionResult.error.message, 500);
    if (commentResult.error) throw new DocumentServiceError(commentResult.error.message, 500);

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

    if (approvalError) throw new DocumentServiceError(approvalError.message, 500);
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

    if (error) throw new DocumentServiceError(error.message, 500);
  }

  private static async removeUploadedFile(storagePath: string, cleanupErrors: string[]): Promise<void> {
    try {
      await DocumentStorageService.remove(storagePath);
    } catch (error) {
      cleanupErrors.push(errorMessage(error, 'Failed to remove uploaded document file.'));
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
    if (error) throw new DocumentServiceError(error.message, 500);
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

    await DocumentStorageService.upload(file, storagePath);

    try {
      const { error: documentError } = await supabaseAdmin.from('documents').insert({
        id: documentId,
        project_id: input.projectId,
        milestone_id: input.milestoneId || null,
        title: input.title.trim(),
        category: input.category,
        status: 'SUBMITTED',
      });
      if (documentError) throw new DocumentServiceError(documentError.message, 500);
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
      if (versionError) throw new DocumentServiceError(versionError.message, 500);

      const { error: approvalError } = await supabaseAdmin.from('document_version_approvals').insert({
        document_version_id: versionId,
        status: 'PENDING',
        action_role: 'HEAD_SA',
      });
      if (approvalError) throw new DocumentServiceError(approvalError.message, 500);

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
        if (deleteError) cleanupErrors.push(deleteError.message);
      }
      await this.removeUploadedFile(storagePath, cleanupErrors);

      const message = errorMessage(error, 'Failed to create document.');
      if (cleanupErrors.length) {
        throw new DocumentServiceError(`${message} Cleanup failed: ${cleanupErrors.join(' ')}`, 500);
      }
      throw error;
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

    if (versionsError) throw new DocumentServiceError(versionsError.message, 500);
    const versions = (versionsData || []) as VersionState[];
    const latestVersions = versions.filter((version) => version.is_latest);
    const nextVersionNumber = (versions[0]?.version_number || 0) + 1;
    const versionId = randomUUID();
    const storagePath = buildDocumentStoragePath(document.project_id, documentId, file.originalname);
    let demotedLatest = false;
    let insertedVersion = false;
    let updatedDocument = false;

    await DocumentStorageService.upload(file, storagePath);

    try {
      if (latestVersions.length) {
        const { error: demoteError } = await supabaseAdmin
          .from('document_versions')
          .update({ is_latest: false, status: 'SUPERSEDED' })
          .in('id', latestVersions.map((version) => version.id));
        if (demoteError) throw new DocumentServiceError(demoteError.message, 500);
        demotedLatest = true;
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
      if (insertError) throw new DocumentServiceError(insertError.message, 500);
      insertedVersion = true;

      const { error: documentError } = await supabaseAdmin
        .from('documents')
        .update({ status: 'SUBMITTED', updated_at: new Date().toISOString() })
        .eq('id', documentId);
      if (documentError) throw new DocumentServiceError(documentError.message, 500);
      updatedDocument = true;

      const { error: approvalError } = await supabaseAdmin.from('document_version_approvals').insert({
        document_version_id: versionId,
        status: 'PENDING',
        action_role: 'HEAD_SA',
      });
      if (approvalError) throw new DocumentServiceError(approvalError.message, 500);

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
        if (deleteError) cleanupErrors.push(deleteError.message);
      }
      if (updatedDocument) {
        const { error: restoreDocumentError } = await supabaseAdmin
          .from('documents')
          .update({ status: document.status, updated_at: document.updated_at })
          .eq('id', documentId);
        if (restoreDocumentError) cleanupErrors.push(restoreDocumentError.message);
      }
      if (demotedLatest) {
        for (const version of latestVersions) {
          const { error: restoreVersionError } = await supabaseAdmin
            .from('document_versions')
            .update({ is_latest: true, status: version.status })
            .eq('id', version.id);
          if (restoreVersionError) cleanupErrors.push(restoreVersionError.message);
        }
      }
      await this.removeUploadedFile(storagePath, cleanupErrors);

      const message = errorMessage(error, 'Failed to upload document version.');
      if (cleanupErrors.length) {
        throw new DocumentServiceError(`${message} Cleanup failed: ${cleanupErrors.join(' ')}`, 500);
      }
      throw error;
    }

    return this.getDocumentById(documentId, actor);
  }

  static async reviewVersion(versionId: string, input: ReviewVersionInput, actor: Actor) {
    if (!['HEAD_SA', 'SUPER_ADMIN'].includes(actor.role)) {
      throw new DocumentServiceError('Forbidden', 403);
    }

    const version = await this.getRawVersion(versionId);
    const document = await this.getRawDocument(version.document_id);
    await this.assertDocumentAccess(document, actor);

    if (!version.is_latest || version.status !== 'SUBMITTED') {
      throw new DocumentServiceError('Only the latest submitted document version can be reviewed.');
    }

    const { data: pendingApproval, error: pendingApprovalError } = await supabaseAdmin
      .from('document_version_approvals')
      .select('id')
      .eq('document_version_id', versionId)
      .eq('status', 'PENDING')
      .order('created_at', { ascending: false })
      .maybeSingle();
    if (pendingApprovalError) throw new DocumentServiceError(pendingApprovalError.message, 500);
    if (!pendingApproval) throw new DocumentServiceError('Document version has no pending review.');

    const reviewedAt = new Date().toISOString();
    const { data: updatedVersion, error: versionError } = await supabaseAdmin
      .from('document_versions')
      .update({ status: input.status })
      .eq('id', versionId)
      .eq('status', 'SUBMITTED')
      .select('id')
      .maybeSingle();
    if (versionError) throw new DocumentServiceError(versionError.message, 500);
    if (!updatedVersion) throw new DocumentServiceError('Document version is no longer submitted.');

    const { error: documentError } = await supabaseAdmin
      .from('documents')
      .update({ status: input.status, updated_at: reviewedAt })
      .eq('id', document.id);
    if (documentError) throw new DocumentServiceError(documentError.message, 500);

    const { data: updatedApproval, error: approvalError } = await supabaseAdmin
      .from('document_version_approvals')
      .update({
        status: input.status,
        feedback: input.feedback?.trim() || null,
        reviewed_by: actor.userId,
        reviewed_at: reviewedAt,
      })
      .eq('id', pendingApproval.id)
      .eq('status', 'PENDING')
      .select('id')
      .maybeSingle();
    if (approvalError) throw new DocumentServiceError(approvalError.message, 500);
    if (!updatedApproval) throw new DocumentServiceError('Document review is no longer pending.');

    await this.logDocumentActivity(
      actor,
      document.project_id,
      input.status === 'APPROVED' ? 'DOCUMENT_APPROVED' : 'DOCUMENT_REJECTED',
      `${actor.fullName} ${input.status === 'APPROVED' ? 'approved' : 'rejected'} document '${document.title}' (v${version.version_number})`
    );

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

    if (error || !data) throw new DocumentServiceError(error?.message || 'Failed to add document comment.', 500);
    await this.logDocumentActivity(actor, document.project_id, 'DOCUMENT_COMMENT_ADDED', `${actor.fullName} commented on document '${document.title}'`);
    const users = await this.loadUsers([actor.userId]);
    return this.mapComment(data as DocumentCommentRow, users);
  }

  static async getDownloadUrl(versionId: string, actor: Actor) {
    const version = await this.getRawVersion(versionId);
    const document = await this.getRawDocument(version.document_id);
    await this.assertDocumentAccess(document, actor);

    return {
      url: await DocumentStorageService.createSignedDownloadUrl(version.storage_path),
      expires_in_seconds: 300,
    };
  }
}
