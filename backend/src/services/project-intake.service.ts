import { supabaseAdmin } from '../config/supabase';
import { canAccessProject, ProjectAccessActor } from './project-access.service';
import { DocumentStorageService } from '../utils/storage.util';

type ProjectAccessRow = {
  id: string;
  sales_id: string | null;
  pic_id: string | null;
};

type IntakeAttachmentRow = {
  id: string;
  project_id: string;
  kind: 'MOM' | 'PHOTO' | 'DOCUMENT';
  original_filename: string;
  mime_type: string;
  size_bytes: number | string;
  created_at: string;
};

type IntakeAttachmentDownloadRow = IntakeAttachmentRow & {
  storage_path: string;
};

export class ProjectIntakeError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = 'ProjectIntakeError';
  }
}

export class ProjectIntakeService {
  private static async assertProjectAccess(projectId: string, actor: ProjectAccessActor): Promise<void> {
    const { data: project, error } = await supabaseAdmin
      .from('projects')
      .select('id,sales_id,pic_id')
      .eq('id', projectId)
      .maybeSingle();

    if (error) throw new ProjectIntakeError('Unable to load project intake evidence.', 500);
    if (!project || !canAccessProject(project as ProjectAccessRow, actor)) {
      throw new ProjectIntakeError('Project not found', 404);
    }
  }

  static async list(projectId: string, actor: ProjectAccessActor) {
    await this.assertProjectAccess(projectId, actor);
    const { data, error } = await supabaseAdmin
      .from('project_intake_attachments')
      .select('id,project_id,kind,original_filename,mime_type,size_bytes,created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    if (error) throw new ProjectIntakeError('Unable to load project intake evidence.', 500);
    return ((data || []) as IntakeAttachmentRow[]).map((attachment) => ({
      id: attachment.id,
      project_id: attachment.project_id,
      kind: attachment.kind,
      file_name: attachment.original_filename,
      mime_type: attachment.mime_type,
      size_bytes: Number(attachment.size_bytes),
      created_at: attachment.created_at,
    }));
  }

  static async getDownloadUrl(projectId: string, attachmentId: string, actor: ProjectAccessActor) {
    await this.assertProjectAccess(projectId, actor);
    const { data: attachment, error } = await supabaseAdmin
      .from('project_intake_attachments')
      .select('id,project_id,kind,original_filename,mime_type,size_bytes,storage_path,created_at')
      .eq('id', attachmentId)
      .eq('project_id', projectId)
      .maybeSingle();

    if (error) throw new ProjectIntakeError('Unable to load project intake evidence.', 500);
    if (!attachment) throw new ProjectIntakeError('Project intake attachment not found', 404);

    try {
      const url = await DocumentStorageService.createSignedDownloadUrl(
        (attachment as IntakeAttachmentDownloadRow).storage_path,
        300
      );
      return {
        attachment_id: attachment.id,
        file_name: attachment.original_filename,
        url,
        expires_in_seconds: 300,
      };
    } catch {
      throw new ProjectIntakeError('Failed to create project intake download URL.', 500);
    }
  }
}
