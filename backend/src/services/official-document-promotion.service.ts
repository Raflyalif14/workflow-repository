import { supabaseAdmin } from '../config/supabase';

export type ApprovedOfficialDocumentInput = {
  documentId: string;
  versionId: string;
  projectId: string;
  milestoneId: string;
  title: string;
  fileName: string;
  storagePath: string;
  fileSize: number | string;
  mimeType: string;
  uploadedBy: string;
  changelog: string;
};

export class OfficialDocumentPromotionError extends Error {
  constructor(message = 'Failed to create official document.', readonly statusCode = 500) {
    super(message);
    this.name = 'OfficialDocumentPromotionError';
  }
}

export class OfficialDocumentPromotionService {
  static async createApprovedDocument(input: ApprovedOfficialDocumentInput): Promise<void> {
    const { data: document, error: documentError } = await supabaseAdmin
      .from('documents')
      .insert({
        id: input.documentId,
        project_id: input.projectId,
        milestone_id: input.milestoneId,
        title: input.title,
        category: 'OTHER',
        status: 'APPROVED',
      })
      .select('id')
      .maybeSingle();

    if (documentError || !document) {
      throw new OfficialDocumentPromotionError();
    }

    const { error: versionError } = await supabaseAdmin.from('document_versions').insert({
      id: input.versionId,
      document_id: input.documentId,
      version_number: 1,
      file_name: input.fileName,
      storage_path: input.storagePath,
      file_size: input.fileSize,
      mime_type: input.mimeType,
      changelog: input.changelog,
      status: 'APPROVED',
      is_latest: true,
      uploaded_by: input.uploadedBy,
    });

    if (versionError) {
      throw new OfficialDocumentPromotionError();
    }
  }

  static async removeCreatedDocument(documentId: string): Promise<boolean> {
    const { data, error } = await supabaseAdmin
      .from('documents')
      .delete()
      .eq('id', documentId)
      .select('id')
      .maybeSingle();

    if (error) {
      throw new OfficialDocumentPromotionError('Failed to remove official document.');
    }

    return Boolean(data);
  }
}
