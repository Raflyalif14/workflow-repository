import { randomUUID } from 'crypto';
import { supabaseAdmin } from '../config/supabase';
import {
  buildMilestoneSubmissionStoragePath,
  DocumentStorageService,
  isAllowedDocumentFileName,
  MAX_DOCUMENT_FILE_SIZE_BYTES,
  MAX_MILESTONE_SUBMISSION_FILES,
} from '../utils/storage.util';
import { notifyMilestoneSubmitted } from './milestone-notification.service';

type Actor = { userId: string; role: string; fullName: string };

type SubmissionContext = {
  id: string;
  project_id: string;
  name: string;
  status: string;
  pic_id: string | null;
  project: {
    id: string;
    name: string;
    status: string;
    is_postponed: boolean;
  } | null;
};

type StagedAttachment = {
  id: string;
  file: Express.Multer.File;
  storagePath: string;
};

type SubmissionOperation = {
  packageId: string;
  packageCreated: boolean;
  stagedAttachments: StagedAttachment[];
  attachmentMetadataPersisted: boolean;
  approvalId: string | null;
  milestoneSubmittedAt: string | null;
  finalized: boolean;
};

const asRelatedOne = <T>(value: T | T[] | null): T | null =>
  Array.isArray(value) ? value[0] || null : value || null;

const nowIso = () => new Date().toISOString();

export class MilestoneSubmissionPackageError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = 'MilestoneSubmissionPackageError';
  }
}

function businessError(error: unknown): MilestoneSubmissionPackageError {
  if (error instanceof MilestoneSubmissionPackageError) return error;

  const message = error instanceof Error ? error.message : 'Failed to submit milestone work.';
  if (message === 'Forbidden') return new MilestoneSubmissionPackageError(message, 403);
  if (message.endsWith('not found')) return new MilestoneSubmissionPackageError(message, 404);
  if (
    message === 'Project is postponed.' ||
    message === 'Project is not active.' ||
    message === 'Only an IN_PROGRESS milestone can be submitted.'
  ) {
    return new MilestoneSubmissionPackageError(message, 409);
  }

  return new MilestoneSubmissionPackageError('Failed to submit milestone work.', 500);
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';
}

function validateMilestoneSubmissionState(context: SubmissionContext, actor: Actor): void {
  if (!['SA', 'HEAD_SA'].includes(actor.role)) throw new Error('Forbidden');
  if (!context.project) throw new Error('Project not found');
  if (context.pic_id !== actor.userId) throw new Error('Forbidden');
  if (context.project.status === 'POSTPONED' || context.project.is_postponed) {
    throw new Error('Project is postponed.');
  }
  if (context.project.status !== 'ACTIVE') throw new Error('Project is not active.');
  if (context.status !== 'IN_PROGRESS') throw new Error('Only an IN_PROGRESS milestone can be submitted.');
}

export class MilestoneSubmissionPackageService {
  private static async getContext(milestoneId: string): Promise<SubmissionContext> {
    const { data, error } = await supabaseAdmin
      .from('project_milestones')
      .select('id,project_id,name,status,pic_id,project:projects!project_milestones_project_id_fkey(id,name,status,is_postponed)')
      .eq('id', milestoneId)
      .maybeSingle();

    if (error) throw new MilestoneSubmissionPackageError('Failed to retrieve milestone submission data.', 500);
    if (!data) throw new MilestoneSubmissionPackageError('Milestone not found', 404);

    return {
      ...(data as Omit<SubmissionContext, 'project'>),
      project: asRelatedOne((data as { project: SubmissionContext['project'] | SubmissionContext['project'][] }).project),
    };
  }

  private static assertFilesValid(files: Express.Multer.File[]): void {
    for (const file of files) {
      if (!file.originalname?.trim() || !isAllowedDocumentFileName(file.originalname)) {
        throw new MilestoneSubmissionPackageError(
          'File format not supported. Allowed formats: PDF, DOCX, XLSX, PPTX, Images, ZIP.',
          400
        );
      }
      if (!Number.isFinite(file.size) || file.size < 0 || file.size > MAX_DOCUMENT_FILE_SIZE_BYTES) {
        throw new MilestoneSubmissionPackageError('Each file must be 50 MB or smaller.', 400);
      }
    }
  }

  private static async assertNoPendingApproval(milestoneId: string): Promise<void> {
    const { data, error } = await supabaseAdmin
      .from('milestone_approvals')
      .select('id')
      .eq('milestone_id', milestoneId)
      .eq('status', 'PENDING')
      .maybeSingle();

    if (error) throw new MilestoneSubmissionPackageError('Failed to retrieve milestone submission data.', 500);
    if (data) throw new MilestoneSubmissionPackageError('This milestone already has a pending approval.', 409);
  }

  private static async createStagingPackage(context: SubmissionContext, actor: Actor, packageId: string): Promise<void> {
    const { error } = await supabaseAdmin.from('milestone_submission_packages').insert({
      id: packageId,
      project_id: context.project_id,
      milestone_id: context.id,
      submitted_by: actor.userId,
      status: 'STAGING',
      attachment_count: 0,
      cleanup_status: 'NOT_REQUIRED',
    });

    if (error) {
      if (isUniqueViolation(error)) {
        throw new MilestoneSubmissionPackageError('A submission is already being processed for this milestone.', 409);
      }
      throw new MilestoneSubmissionPackageError('Failed to create milestone submission package.', 500);
    }
  }

  private static attachmentRows(packageId: string, actor: Actor, stagedAttachments: StagedAttachment[], status: string) {
    return stagedAttachments.map((attachment) => ({
      id: attachment.id,
      package_id: packageId,
      file_name: attachment.file.originalname,
      storage_path: attachment.storagePath,
      file_size: attachment.file.size,
      mime_type: attachment.file.mimetype || 'application/octet-stream',
      uploaded_by: actor.userId,
      status,
    }));
  }

  private static async persistAttachments(
    packageId: string,
    actor: Actor,
    stagedAttachments: StagedAttachment[]
  ): Promise<void> {
    const { error } = await supabaseAdmin
      .from('milestone_submission_attachments')
      .insert(this.attachmentRows(packageId, actor, stagedAttachments, 'PENDING'));

    if (error) throw new MilestoneSubmissionPackageError('Failed to save milestone submission attachments.', 500);
  }

  private static async setAttachmentCount(packageId: string, count: number): Promise<void> {
    const { data, error } = await supabaseAdmin
      .from('milestone_submission_packages')
      .update({ attachment_count: count, updated_at: nowIso() })
      .eq('id', packageId)
      .eq('status', 'STAGING')
      .select('id')
      .maybeSingle();

    if (error) throw new MilestoneSubmissionPackageError('Failed to save milestone submission package.', 500);
    if (!data) throw new MilestoneSubmissionPackageError('Milestone submission package is no longer available.', 409);
  }

  private static async createPendingApproval(context: SubmissionContext, actor: Actor, note?: string): Promise<string> {
    const { data, error } = await supabaseAdmin
      .from('milestone_approvals')
      .insert({
        milestone_id: context.id,
        submitted_by: actor.userId,
        submission_note: note?.trim() || null,
        status: 'PENDING',
        reviewed_by: null,
        review_note: null,
        reviewed_at: null,
      })
      .select('id')
      .maybeSingle();

    if (error) {
      if (isUniqueViolation(error)) {
        throw new MilestoneSubmissionPackageError('This milestone already has a pending approval.', 409);
      }
      throw new MilestoneSubmissionPackageError('Failed to create milestone approval.', 500);
    }
    if (!data) throw new MilestoneSubmissionPackageError('Failed to create milestone approval.', 500);

    return data.id;
  }

  private static async transitionMilestoneToSubmitted(context: SubmissionContext): Promise<string> {
    const submittedAt = nowIso();
    const { data, error } = await supabaseAdmin
      .from('project_milestones')
      .update({ status: 'SUBMITTED', updated_at: submittedAt })
      .eq('id', context.id)
      .eq('status', 'IN_PROGRESS')
      .select('id')
      .maybeSingle();

    if (error) throw new MilestoneSubmissionPackageError('Failed to submit milestone work.', 500);
    if (!data) throw new MilestoneSubmissionPackageError('Only an IN_PROGRESS milestone can be submitted.', 409);

    return submittedAt;
  }

  private static async linkApproval(packageId: string, approvalId: string): Promise<void> {
    const { data, error } = await supabaseAdmin
      .from('milestone_submission_packages')
      .update({ milestone_approval_id: approvalId, updated_at: nowIso() })
      .eq('id', packageId)
      .eq('status', 'STAGING')
      .select('id')
      .maybeSingle();

    if (error) throw new MilestoneSubmissionPackageError('Failed to finalize milestone submission package.', 500);
    if (!data) throw new MilestoneSubmissionPackageError('Milestone submission package is no longer available.', 409);
  }

  private static async finalizePackage(packageId: string, approvalId: string): Promise<void> {
    const { data, error } = await supabaseAdmin
      .from('milestone_submission_packages')
      .update({ status: 'PENDING_REVIEW', cleanup_status: 'NOT_REQUIRED', updated_at: nowIso() })
      .eq('id', packageId)
      .eq('milestone_approval_id', approvalId)
      .eq('status', 'STAGING')
      .select('id')
      .maybeSingle();

    if (error) throw new MilestoneSubmissionPackageError('Failed to finalize milestone submission package.', 500);
    if (!data) throw new MilestoneSubmissionPackageError('Milestone submission package is no longer available.', 409);
  }

  private static async logSubmission(actor: Actor, context: SubmissionContext, note?: string): Promise<void> {
    const description = `${actor.fullName} submitted milestone '${context.name}'${note?.trim() ? `. Note: ${note.trim()}` : ''}`;
    const { error } = await supabaseAdmin.from('activity_logs').insert({
      project_id: context.project_id,
      user_id: actor.userId,
      action: 'MILESTONE_SUBMITTED',
      description,
    });

    if (error) throw new MilestoneSubmissionPackageError('Failed to record milestone submission activity.', 500);
  }

  private static async restoreMilestone(
    milestoneId: string,
    submittedAt: string | null,
    cleanupErrors: string[]
  ): Promise<void> {
    if (!submittedAt) return;

    const { data, error } = await supabaseAdmin
      .from('project_milestones')
      .update({ status: 'IN_PROGRESS', updated_at: nowIso() })
      .eq('id', milestoneId)
      .eq('status', 'SUBMITTED')
      .eq('updated_at', submittedAt)
      .select('id')
      .maybeSingle();

    if (error || !data) cleanupErrors.push('milestone');
  }

  private static async markCleanupFailed(
    operation: SubmissionOperation,
    actor: Actor,
    cleanupErrors: string[]
  ): Promise<void> {
    if (!operation.attachmentMetadataPersisted && operation.stagedAttachments.length) {
      const { error } = await supabaseAdmin
        .from('milestone_submission_attachments')
        .insert(this.attachmentRows(operation.packageId, actor, operation.stagedAttachments, 'CLEANUP_FAILED'));
      if (error) cleanupErrors.push('attachment metadata');
    } else if (operation.attachmentMetadataPersisted) {
      const { error } = await supabaseAdmin
        .from('milestone_submission_attachments')
        .update({ status: 'CLEANUP_FAILED', updated_at: nowIso() })
        .eq('package_id', operation.packageId);
      if (error) cleanupErrors.push('attachments');
    }

    const { data, error } = await supabaseAdmin
      .from('milestone_submission_packages')
      .update({
        status: 'FAILED',
        cleanup_status: 'FAILED',
        milestone_approval_id: null,
        attachment_count: operation.stagedAttachments.length,
        updated_at: nowIso(),
      })
      .eq('id', operation.packageId)
      .select('id')
      .maybeSingle();
    if (error || !data) cleanupErrors.push('package');
  }

  private static async deletePackage(packageId: string, cleanupErrors: string[]): Promise<void> {
    const { data, error } = await supabaseAdmin
      .from('milestone_submission_packages')
      .delete()
      .eq('id', packageId)
      .eq('status', 'STAGING')
      .select('id')
      .maybeSingle();
    if (error || !data) cleanupErrors.push('package');
  }

  private static async deletePendingApproval(approvalId: string | null, actor: Actor, cleanupErrors: string[]): Promise<void> {
    if (!approvalId) return;

    const { data, error } = await supabaseAdmin
      .from('milestone_approvals')
      .delete()
      .eq('id', approvalId)
      .eq('status', 'PENDING')
      .eq('submitted_by', actor.userId)
      .select('id')
      .maybeSingle();
    if (error || !data) cleanupErrors.push('approval');
  }

  private static async compensate(
    context: SubmissionContext,
    actor: Actor,
    operation: SubmissionOperation
  ): Promise<void> {
    if (!operation.packageCreated) return;

    const cleanupErrors: string[] = [];
    await this.restoreMilestone(context.id, operation.milestoneSubmittedAt, cleanupErrors);

    let storageCleaned = true;
    try {
      await DocumentStorageService.removeMany(operation.stagedAttachments.map((attachment) => attachment.storagePath));
    } catch {
      storageCleaned = false;
      cleanupErrors.push('storage');
      await this.markCleanupFailed(operation, actor, cleanupErrors);
    }

    if (storageCleaned) {
      await this.deletePackage(operation.packageId, cleanupErrors);
    }

    await this.deletePendingApproval(operation.approvalId, actor, cleanupErrors);

    if (cleanupErrors.length) {
      console.error('[MilestoneSubmissionPackage] Compensation did not fully complete.', {
        milestoneId: context.id,
        packageId: operation.packageId,
        cleanupErrors,
      });
    }
  }

  static async submit(
    milestoneId: string,
    actor: Actor,
    files: Express.Multer.File[],
    note?: string
  ) {
    if (!files.length) {
      throw new MilestoneSubmissionPackageError('At least one file is required to submit milestone work.', 400);
    }
    if (files.length > MAX_MILESTONE_SUBMISSION_FILES) {
      throw new MilestoneSubmissionPackageError(
        `A maximum of ${MAX_MILESTONE_SUBMISSION_FILES} files may be submitted at once.`,
        400
      );
    }
    this.assertFilesValid(files);

    const context = await this.getContext(milestoneId);
    try {
      validateMilestoneSubmissionState(context, actor);
    } catch (error) {
      throw businessError(error);
    }
    await this.assertNoPendingApproval(milestoneId);

    const operation: SubmissionOperation = {
      packageId: randomUUID(),
      packageCreated: false,
      stagedAttachments: [],
      attachmentMetadataPersisted: false,
      approvalId: null,
      milestoneSubmittedAt: null,
      finalized: false,
    };

    try {
      await this.createStagingPackage(context, actor, operation.packageId);
      operation.packageCreated = true;

      for (const file of files) {
        const stagedAttachment: StagedAttachment = {
          id: randomUUID(),
          file,
          storagePath: buildMilestoneSubmissionStoragePath(
            context.project_id,
            context.id,
            operation.packageId,
            file.originalname
          ),
        };
        operation.stagedAttachments.push(stagedAttachment);
        await DocumentStorageService.upload(file, stagedAttachment.storagePath);
      }

      await this.persistAttachments(operation.packageId, actor, operation.stagedAttachments);
      operation.attachmentMetadataPersisted = true;
      await this.setAttachmentCount(operation.packageId, operation.stagedAttachments.length);

      operation.approvalId = await this.createPendingApproval(context, actor, note);
      operation.milestoneSubmittedAt = await this.transitionMilestoneToSubmitted(context);
      await this.linkApproval(operation.packageId, operation.approvalId);
      await this.finalizePackage(operation.packageId, operation.approvalId);
      operation.finalized = true;

      await this.logSubmission(actor, context, note);
      await notifyMilestoneSubmitted({
        projectId: context.project_id,
        projectName: context.project?.name || 'Project',
        milestoneId: context.id,
        milestoneName: context.name,
        picId: context.pic_id,
      });

      return {
        milestone_id: context.id,
        name: context.name,
        status: 'SUBMITTED',
        submitted_by: {
          id: actor.userId,
          full_name: actor.fullName,
        },
        approval: {
          id: operation.approvalId,
          status: 'PENDING',
        },
        package: {
          id: operation.packageId,
          status: 'PENDING_REVIEW',
          attachment_count: operation.stagedAttachments.length,
          attachments: operation.stagedAttachments.map((attachment) => ({
            id: attachment.id,
            file_name: attachment.file.originalname,
          })),
        },
      };
    } catch (error) {
      if (!operation.finalized) {
        await this.compensate(context, actor, operation);
      }
      throw businessError(error);
    }
  }
}
