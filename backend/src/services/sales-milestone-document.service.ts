import { randomUUID } from 'crypto';
import { supabaseAdmin } from '../config/supabase';
import {
  buildDocumentStoragePath,
  DocumentStorageService,
  isAllowedDocumentFileName,
  MAX_DOCUMENT_FILE_SIZE_BYTES,
  MAX_MILESTONE_SUBMISSION_FILES,
} from '../utils/storage.util';

type Actor = { userId: string; role: string; fullName: string };

type SalesMilestoneDocumentContext = {
  id: string;
  project_id: string;
  name: string;
  status: string;
  workflow_stage: { default_role: string } | null;
  project: {
    id: string;
    name: string;
    sales_id: string;
    status: string;
    is_postponed: boolean | null;
  } | null;
};

type UploadOperation = {
  milestoneId: string;
  projectId: string;
  documentIds: string[];
  storagePaths: string[];
};

type CreatedDocument = {
  id: string;
  file_name: string;
  title: string;
  category: 'OTHER';
};

const asRelatedOne = <T>(value: T | T[] | null): T | null =>
  Array.isArray(value) ? value[0] || null : value || null;

export class SalesMilestoneDocumentError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = 'SalesMilestoneDocumentError';
  }
}

function toSafeUploadError(error: unknown): SalesMilestoneDocumentError {
  if (error instanceof SalesMilestoneDocumentError) return error;
  return new SalesMilestoneDocumentError('Failed to upload milestone documents.', 500);
}

export class SalesMilestoneDocumentService {
  private static async getContext(milestoneId: string): Promise<SalesMilestoneDocumentContext> {
    const { data, error } = await supabaseAdmin
      .from('project_milestones')
      .select(
        'id,project_id,name,status,workflow_stage:workflow_stages!project_milestones_workflow_stage_id_fkey(default_role),project:projects!project_milestones_project_id_fkey(id,name,sales_id,status,is_postponed)'
      )
      .eq('id', milestoneId)
      .maybeSingle();

    if (error) throw new SalesMilestoneDocumentError('Failed to retrieve milestone document data.', 500);
    if (!data) throw new SalesMilestoneDocumentError('Milestone not found', 404);

    const row = data as Omit<SalesMilestoneDocumentContext, 'workflow_stage' | 'project'> & {
      workflow_stage: SalesMilestoneDocumentContext['workflow_stage'] | SalesMilestoneDocumentContext['workflow_stage'][];
      project: SalesMilestoneDocumentContext['project'] | SalesMilestoneDocumentContext['project'][];
    };
    return {
      ...row,
      workflow_stage: asRelatedOne(row.workflow_stage),
      project: asRelatedOne(row.project),
    };
  }

  private static assertUploadAuthorized(context: SalesMilestoneDocumentContext, actor: Actor): void {
    if (!['SALES', 'SUPER_ADMIN'].includes(actor.role)) {
      throw new SalesMilestoneDocumentError('Forbidden', 403);
    }
    if (!context.project) throw new SalesMilestoneDocumentError('Project not found', 404);
    if (actor.role === 'SALES' && context.project.sales_id !== actor.userId) {
      throw new SalesMilestoneDocumentError('Forbidden', 403);
    }
    if (context.workflow_stage?.default_role !== 'SALES') {
      throw new SalesMilestoneDocumentError('Documents can only be uploaded to SALES milestones.', 409);
    }
    if (context.project.status === 'POSTPONED' || context.project.is_postponed) {
      throw new SalesMilestoneDocumentError('Project is postponed.', 409);
    }
    if (['COMPLETED', 'CANCELLED'].includes(context.project.status)) {
      throw new SalesMilestoneDocumentError('Project is no longer available for milestone document uploads.', 409);
    }
  }

  private static assertFilesValid(files: Express.Multer.File[]): void {
    if (!files.length) {
      throw new SalesMilestoneDocumentError('At least one file is required for milestone document upload.', 400);
    }
    if (files.length > MAX_MILESTONE_SUBMISSION_FILES) {
      throw new SalesMilestoneDocumentError(
        `A maximum of ${MAX_MILESTONE_SUBMISSION_FILES} files may be uploaded at once.`,
        400
      );
    }

    for (const file of files) {
      if (!file.originalname?.trim() || !isAllowedDocumentFileName(file.originalname)) {
        throw new SalesMilestoneDocumentError(
          'File format not supported. Allowed formats: PDF, DOCX, XLSX, PPTX, Images, ZIP.',
          400
        );
      }
      if (!Number.isFinite(file.size) || file.size < 0 || file.size > MAX_DOCUMENT_FILE_SIZE_BYTES) {
        throw new SalesMilestoneDocumentError('Each file must be 50 MB or smaller.', 400);
      }
    }
  }

  private static documentTitle(fileName: string): string {
    return `Sales milestone document - ${fileName}`.slice(0, 500);
  }

  private static async createOfficialDocument(
    context: SalesMilestoneDocumentContext,
    actor: Actor,
    file: Express.Multer.File,
    operation: UploadOperation
  ): Promise<CreatedDocument> {
    const documentId = randomUUID();
    const versionId = randomUUID();
    const storagePath = buildDocumentStoragePath(context.project_id, documentId, file.originalname);
    operation.storagePaths.push(storagePath);
    await DocumentStorageService.upload(file, storagePath);

    const title = this.documentTitle(file.originalname);
    // Include the operation-owned ID before insertion to cover an ambiguous provider response.
    operation.documentIds.push(documentId);
    const { data: document, error: documentError } = await supabaseAdmin
      .from('documents')
      .insert({
        id: documentId,
        project_id: context.project_id,
        milestone_id: context.id,
        title,
        category: 'OTHER',
        status: 'APPROVED',
      })
      .select('id')
      .maybeSingle();
    if (documentError || !document) {
      throw new SalesMilestoneDocumentError('Failed to upload milestone documents.', 500);
    }

    const { error: versionError } = await supabaseAdmin.from('document_versions').insert({
      id: versionId,
      document_id: documentId,
      version_number: 1,
      file_name: file.originalname,
      storage_path: storagePath,
      file_size: file.size,
      mime_type: file.mimetype || 'application/octet-stream',
      changelog: 'Initial SALES milestone document upload.',
      status: 'APPROVED',
      is_latest: true,
      uploaded_by: actor.userId,
    });
    if (versionError) {
      throw new SalesMilestoneDocumentError('Failed to upload milestone documents.', 500);
    }

    return { id: documentId, file_name: file.originalname, title, category: 'OTHER' };
  }

  private static async rollback(operation: UploadOperation): Promise<void> {
    const cleanupFailures: string[] = [];

    try {
      await DocumentStorageService.removeMany(operation.storagePaths);
    } catch {
      cleanupFailures.push('storage');
    }

    if (operation.documentIds.length) {
      const { error } = await supabaseAdmin.from('documents').delete().in('id', operation.documentIds);
      if (error) cleanupFailures.push('documents');
    }

    if (cleanupFailures.length) {
      console.error('[SalesMilestoneDocument] Upload rollback did not fully complete.', {
        milestoneId: operation.milestoneId,
        projectId: operation.projectId,
        cleanupFailures,
      });
    }
  }

  static async upload(milestoneId: string, actor: Actor, files: Express.Multer.File[]) {
    const context = await this.getContext(milestoneId);
    this.assertUploadAuthorized(context, actor);
    this.assertFilesValid(files);

    const operation: UploadOperation = {
      milestoneId: context.id,
      projectId: context.project_id,
      documentIds: [],
      storagePaths: [],
    };

    try {
      const documents: CreatedDocument[] = [];
      for (const file of files) {
        documents.push(await this.createOfficialDocument(context, actor, file, operation));
      }

      return {
        milestone_id: context.id,
        documents,
      };
    } catch (error) {
      await this.rollback(operation);
      throw toSafeUploadError(error);
    }
  }
}
