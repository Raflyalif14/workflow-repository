import { supabaseAdmin } from '../config/supabase';
import { DocumentStorageService } from '../utils/storage.util';

type Actor = { userId: string; role: string };
type CleanupStatus = 'PENDING' | 'COMPLETED' | 'FAILED';
type CleanupRecord = {
  id: string;
  status: CleanupStatus;
  storage_paths: unknown;
  storage_object_count: number | string | null;
};

export class ProjectDeletionError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = 'ProjectDeletionError';
  }
}

const ensureSuperAdmin = (actor: Actor): void => {
  if (actor.role !== 'SUPER_ADMIN') throw new ProjectDeletionError('Forbidden', 403);
};

const ids = (rows: Array<{ id: string }> | null) => (rows || []).map((row) => row.id);
const rows = async (table: string, configure: (query: any) => any): Promise<Array<{ id: string }>> => {
  const { data, error } = await configure(supabaseAdmin.from(table).select('id'));
  if (error) throw new ProjectDeletionError('Unable to prepare project deletion preview.', 500);
  return (data || []) as Array<{ id: string }>;
};

const storageRows = async (table: string, configure: (query: any) => any): Promise<Array<{ id: string; storage_path: string }>> => {
  const { data, error } = await configure(supabaseAdmin.from(table).select('id,storage_path'));
  if (error) throw new ProjectDeletionError('Unable to prepare project deletion preview.', 500);
  return (data || []) as Array<{ id: string; storage_path: string }>;
};

const capturedStoragePaths = (storagePaths: unknown): string[] => {
  if (!Array.isArray(storagePaths) || !storagePaths.every((path) => typeof path === 'string' && Boolean(path.trim()))) {
    throw new ProjectDeletionError('Unable to retry project storage cleanup.', 500);
  }
  return storagePaths;
};

const cleanupSummary = (cleanup: CleanupRecord) => ({
  id: cleanup.id,
  status: cleanup.status,
  storage_object_count: Number(cleanup.storage_object_count) || 0,
});

export class ProjectDeletionService {
  private static async getCleanup(cleanupId: string): Promise<CleanupRecord> {
    const { data, error } = await supabaseAdmin
      .from('project_deletion_cleanups')
      .select('id,status,storage_paths,storage_object_count')
      .eq('id', cleanupId)
      .maybeSingle();
    if (error) throw new ProjectDeletionError('Unable to retrieve project deletion cleanup.', 500);
    if (!data) throw new ProjectDeletionError('Project deletion cleanup not found.', 404);
    return data as CleanupRecord;
  }

  static async preview(projectId: string, actor: Actor) {
    ensureSuperAdmin(actor);
    const { data: project, error } = await supabaseAdmin
      .from('projects')
      .select('id,name,status,scenario:scenarios!projects_scenario_id_fkey(id,name)')
      .eq('id', projectId)
      .maybeSingle();
    if (error) throw new ProjectDeletionError('Unable to prepare project deletion preview.', 500);
    if (!project) throw new ProjectDeletionError('Project not found', 404);

    const milestones = await rows('project_milestones', (query) => query.eq('project_id', projectId));
    const milestoneIds = ids(milestones);
    const documents = await rows('documents', (query) => query.eq('project_id', projectId));
    const documentIds = ids(documents);
    const packages = await rows('milestone_submission_packages', (query) => query.eq('project_id', projectId));
    const packageIds = ids(packages);
    const contributions = await rows('milestone_contributions', (query) => query.eq('project_id', projectId));
    const contributionIds = ids(contributions);
    const [versions, attachments, contributionAttachments, intakeAttachments] = await Promise.all([
      documentIds.length ? storageRows('document_versions', (query) => query.in('document_id', documentIds)) : [],
      packageIds.length ? storageRows('milestone_submission_attachments', (query) => query.in('package_id', packageIds)) : [],
      contributionIds.length
        ? storageRows('milestone_contribution_attachments', (query) => query.in('contribution_id', contributionIds))
        : [],
      storageRows('project_intake_attachments', (query) => query.eq('project_id', projectId)),
    ]);
    const versionIds = ids(versions);
    const projectNotifications = await rows('notifications', (query) => query.eq('project_id', projectId));
    const milestoneNotifications = milestoneIds.length ? await rows('notifications', (query) => query.in('milestone_id', milestoneIds)) : [];
    const notifications = [...new Map([...projectNotifications, ...milestoneNotifications].map((row) => [row.id, row])).values()];
    const notificationIds = ids(notifications);
    const counts = await Promise.all([
      milestoneIds.length ? rows('milestone_approvals', (query) => query.in('milestone_id', milestoneIds)) : [],
      milestoneIds.length ? rows('milestone_deadline_approvals', (query) => query.in('milestone_id', milestoneIds)) : [],
      milestoneIds.length ? rows('milestone_deadline_history', (query) => query.in('milestone_id', milestoneIds)) : [],
      rows('project_plan_approvals', (query) => query.eq('project_id', projectId)),
      rows('project_assignments', (query) => query.eq('project_id', projectId)),
      rows('activity_logs', (query) => query.eq('project_id', projectId)),
      notificationIds.length ? rows('notification_deliveries', (query) => query.in('notification_id', notificationIds)) : [],
      versionIds.length ? rows('document_version_approvals', (query) => query.in('document_version_id', versionIds)) : [],
      documentIds.length ? rows('document_comments', (query) => query.in('document_id', documentIds)) : [],
    ]);
    const storageObjectCount = new Set(
      [...versions, ...attachments, ...contributionAttachments, ...intakeAttachments]
        .map((row) => row.storage_path)
        .filter(Boolean)
    ).size;
    const scenario = Array.isArray(project.scenario) ? project.scenario[0] : project.scenario;
    return {
      project_id: project.id,
      project_name: project.name,
      scenario: scenario ? { id: scenario.id, name: scenario.name } : null,
      status: project.status,
      milestone_count: milestones.length,
      document_count: documents.length,
      document_version_count: versions.length,
      submission_package_count: packages.length,
      submission_attachment_count: attachments.length,
      milestone_contribution_count: contributions.length,
      milestone_contribution_attachment_count: contributionAttachments.length,
      project_intake_attachment_count: intakeAttachments.length,
      approvals: { milestone: counts[0].length, deadline: counts[1].length, deadline_history: counts[2].length, project_plan: counts[3].length, document_version: counts[7].length },
      assignment_count: counts[4].length,
      activity_log_count: counts[5].length,
      notification_count: notifications.length,
      notification_delivery_count: counts[6].length,
      document_comment_count: counts[8].length,
      storage_object_count: storageObjectCount,
    };
  }

  static async delete(projectId: string, confirmation: string, actor: Actor) {
    ensureSuperAdmin(actor);
    const { data, error } = await supabaseAdmin.rpc('delete_project_with_cleanup', {
      p_project_id: projectId,
      p_confirmation: confirmation,
      p_initiated_by: actor.userId,
    });
    if (error) {
      if (error.code === 'P0002') throw new ProjectDeletionError('Project not found', 404);
      if (error.code === '22023') throw new ProjectDeletionError('Project confirmation does not match.', 400);
      throw new ProjectDeletionError('Unable to delete project.', 500);
    }
    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.cleanup_id || !Array.isArray(result.storage_paths)) throw new ProjectDeletionError('Unable to delete project.', 500);
    const storagePaths = result.storage_paths.filter((path: unknown): path is string => typeof path === 'string' && Boolean(path));
    let cleanupStatus: CleanupStatus = 'PENDING';
    try {
      await DocumentStorageService.removeMany(storagePaths);
      const { data: updated, error: updateError } = await supabaseAdmin
        .from('project_deletion_cleanups')
        .update({ status: 'COMPLETED', completed_at: new Date().toISOString(), updated_at: new Date().toISOString(), failure_code: null })
        .eq('id', result.cleanup_id)
        .eq('status', 'PENDING')
        .select('id')
        .maybeSingle();
      if (updateError || !updated) throw new Error('cleanup tracking failed');
      cleanupStatus = 'COMPLETED';
    } catch {
      console.error('[ProjectDeletion] Storage cleanup could not be confirmed.', { cleanupId: result.cleanup_id, projectId });
      const { data: failed } = await supabaseAdmin
        .from('project_deletion_cleanups')
        .update({ status: 'FAILED', failed_at: new Date().toISOString(), updated_at: new Date().toISOString(), failure_code: 'STORAGE_DELETE_FAILED' })
        .eq('id', result.cleanup_id)
        .eq('status', 'PENDING')
        .select('id')
        .maybeSingle();
      cleanupStatus = failed ? 'FAILED' : 'PENDING';
    }
    return { project_id: projectId, cleanup: { id: result.cleanup_id, status: cleanupStatus, storage_object_count: Number(result.storage_object_count) || 0 } };
  }

  static async retry(cleanupId: string, actor: Actor) {
    ensureSuperAdmin(actor);
    const cleanup = await this.getCleanup(cleanupId);
    const storagePaths = capturedStoragePaths(cleanup.storage_paths);

    if (cleanup.status === 'COMPLETED') {
      return { cleanup: cleanupSummary(cleanup) };
    }
    if (cleanup.status !== 'FAILED') {
      throw new ProjectDeletionError('Project deletion cleanup is already being processed.', 409);
    }

    const retryAt = new Date().toISOString();
    const { data: claimed, error: claimError } = await supabaseAdmin
      .from('project_deletion_cleanups')
      .update({ status: 'PENDING', updated_at: retryAt })
      .eq('id', cleanup.id)
      .eq('status', 'FAILED')
      .select('id,status,storage_paths,storage_object_count')
      .maybeSingle();
    if (claimError) throw new ProjectDeletionError('Unable to retry project storage cleanup.', 500);
    if (!claimed) {
      const latest = await this.getCleanup(cleanupId);
      if (latest.status === 'COMPLETED') return { cleanup: cleanupSummary(latest) };
      throw new ProjectDeletionError('Project deletion cleanup is already being processed.', 409);
    }

    try {
      await DocumentStorageService.removeMany(storagePaths);
    } catch (error) {
      console.error('[ProjectDeletion] Storage cleanup retry could not be confirmed.', {
        cleanupId: cleanup.id,
        storageObjectCount: storagePaths.length,
        error: error instanceof Error ? error.message : 'Unknown storage cleanup error',
      });
      const { data: failed, error: failureError } = await supabaseAdmin
        .from('project_deletion_cleanups')
        .update({
          status: 'FAILED',
          failed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          failure_code: 'STORAGE_DELETE_FAILED',
        })
        .eq('id', cleanup.id)
        .eq('status', 'PENDING')
        .select('id')
        .maybeSingle();
      if (failureError || !failed) {
        console.error('[ProjectDeletion] Storage cleanup retry failure could not be recorded.', { cleanupId: cleanup.id });
      }
      throw new ProjectDeletionError('Unable to retry project storage cleanup.', 500);
    }

    const { data: completed, error: completionError } = await supabaseAdmin
      .from('project_deletion_cleanups')
      .update({
        status: 'COMPLETED',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        failure_code: null,
      })
      .eq('id', cleanup.id)
      .eq('status', 'PENDING')
      .select('id,status,storage_paths,storage_object_count')
      .maybeSingle();
    if (completionError || !completed) {
      console.error('[ProjectDeletion] Storage cleanup retry completion could not be recorded.', { cleanupId: cleanup.id });
      throw new ProjectDeletionError('Unable to retry project storage cleanup.', 500);
    }

    return { cleanup: cleanupSummary(completed as CleanupRecord) };
  }
}
