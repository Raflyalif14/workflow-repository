import { randomUUID } from 'crypto';
import { supabaseAdmin } from '../config/supabase';
import { DocumentStorageService } from '../utils/storage.util';
import { OfficialDocumentPromotionService } from './official-document-promotion.service';

type Actor = { userId: string; role: string; fullName: string };
type ReviewDecision = 'APPROVED' | 'REJECTED';
type PackageStatus = 'PENDING_REVIEW' | 'PROMOTING' | 'APPROVED' | 'REJECTING' | 'REJECTED';

type SubmissionPackage = {
  id: string;
  project_id: string;
  milestone_id: string;
  milestone_approval_id: string | null;
  submitted_by: string;
  status: PackageStatus;
  attachment_count: number;
  cleanup_status: string;
  created_at: string;
};

type SubmissionAttachment = {
  id: string;
  package_id: string;
  file_name: string;
  storage_path: string;
  file_size: number | string;
  mime_type: string;
  uploaded_by: string;
  status: string;
  promoted_document_id: string | null;
};

type ReadMilestoneContext = {
  id: string;
  pic_id: string | null;
  project: { id: string; sales_id: string | null } | null;
};

type PromotedDocument = {
  documentId: string;
  attachmentId: string;
  attachmentLinked: boolean;
};

export type SubmissionPackageReviewOperation = {
  approvalId: string;
  decision: ReviewDecision;
  package: SubmissionPackage;
  attachments: SubmissionAttachment[];
  promotedDocuments: PromotedDocument[];
  packageFinalized: boolean;
  rolledBack: boolean;
};

const packageFields = 'id,project_id,milestone_id,milestone_approval_id,submitted_by,status,attachment_count,cleanup_status,created_at';
const attachmentFields = 'id,package_id,file_name,storage_path,file_size,mime_type,uploaded_by,status,promoted_document_id';
const nowIso = () => new Date().toISOString();

const normalizeRelatedOne = <T>(value: T | T[] | null): T | null =>
  Array.isArray(value) ? value[0] || null : value || null;

export class MilestoneSubmissionPackageReviewError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = 'MilestoneSubmissionPackageReviewError';
  }
}

export class MilestoneSubmissionPackageReviewService {
  private static async getLinkedPackage(approvalId: string): Promise<SubmissionPackage | null> {
    const { data, error } = await supabaseAdmin
      .from('milestone_submission_packages')
      .select(packageFields)
      .eq('milestone_approval_id', approvalId)
      .maybeSingle();

    if (error) throw new MilestoneSubmissionPackageReviewError('Failed to retrieve milestone submission package.', 500);
    return (data as SubmissionPackage | null) || null;
  }

  private static async claimPackage(
    packageRow: SubmissionPackage,
    approvalId: string,
    nextStatus: 'PROMOTING' | 'REJECTING'
  ): Promise<SubmissionPackage> {
    const { data, error } = await supabaseAdmin
      .from('milestone_submission_packages')
      .update({ status: nextStatus, updated_at: nowIso() })
      .eq('id', packageRow.id)
      .eq('milestone_approval_id', approvalId)
      .eq('status', 'PENDING_REVIEW')
      .select(packageFields)
      .maybeSingle();

    if (error) throw new MilestoneSubmissionPackageReviewError('Failed to begin milestone submission review.', 500);
    if (!data) throw new MilestoneSubmissionPackageReviewError('Milestone submission package is no longer pending review.', 409);
    return data as SubmissionPackage;
  }

  private static async loadPendingAttachments(packageId: string): Promise<SubmissionAttachment[]> {
    const { data, error } = await supabaseAdmin
      .from('milestone_submission_attachments')
      .select(attachmentFields)
      .eq('package_id', packageId)
      .eq('status', 'PENDING')
      .order('created_at', { ascending: true });

    if (error) throw new MilestoneSubmissionPackageReviewError('Failed to retrieve milestone submission attachments.', 500);
    return (data || []) as SubmissionAttachment[];
  }

  private static async restoreClaim(operation: SubmissionPackageReviewOperation): Promise<void> {
    const claimedStatus = operation.decision === 'APPROVED' ? 'PROMOTING' : 'REJECTING';
    const { data, error } = await supabaseAdmin
      .from('milestone_submission_packages')
      .update({ status: 'PENDING_REVIEW', updated_at: nowIso() })
      .eq('id', operation.package.id)
      .eq('milestone_approval_id', operation.approvalId)
      .eq('status', claimedStatus)
      .select('id')
      .maybeSingle();

    if (error || !data) {
      console.error('[MilestoneSubmissionPackageReview] Failed to restore claimed package state.', {
        packageId: operation.package.id,
      });
    }
  }

  static async beginReview(
    approvalId: string,
    decision: ReviewDecision
  ): Promise<SubmissionPackageReviewOperation | null> {
    const linkedPackage = await this.getLinkedPackage(approvalId);
    if (!linkedPackage) return null;

    const claimedPackage = await this.claimPackage(
      linkedPackage,
      approvalId,
      decision === 'APPROVED' ? 'PROMOTING' : 'REJECTING'
    );
    const operation: SubmissionPackageReviewOperation = {
      approvalId,
      decision,
      package: claimedPackage,
      attachments: [],
      promotedDocuments: [],
      packageFinalized: false,
      rolledBack: false,
    };

    try {
      operation.attachments = await this.loadPendingAttachments(operation.package.id);
      if (!operation.attachments.length || operation.attachments.length !== operation.package.attachment_count) {
        throw new MilestoneSubmissionPackageReviewError('Milestone submission package is incomplete.', 409);
      }
      return operation;
    } catch (error) {
      await this.restoreClaim(operation);
      throw error;
    }
  }

  private static documentTitle(attachment: SubmissionAttachment): string {
    return `Milestone evidence - ${attachment.file_name}`.slice(0, 500);
  }

  private static async createOfficialDocument(
    operation: SubmissionPackageReviewOperation,
    attachment: SubmissionAttachment
  ): Promise<PromotedDocument> {
    const documentId = randomUUID();
    const versionId = randomUUID();
    const promoted: PromotedDocument = { documentId, attachmentId: attachment.id, attachmentLinked: false };
    operation.promotedDocuments.push(promoted);

    try {
      await OfficialDocumentPromotionService.createApprovedDocument({
        documentId,
        versionId,
        projectId: operation.package.project_id,
        milestoneId: operation.package.milestone_id,
        title: this.documentTitle(attachment),
        fileName: attachment.file_name,
        storagePath: attachment.storage_path,
        fileSize: attachment.file_size,
        mimeType: attachment.mime_type,
        uploadedBy: attachment.uploaded_by,
        changelog: 'Promoted from approved milestone submission.',
      });
    } catch {
      throw new MilestoneSubmissionPackageReviewError('Failed to promote milestone submission attachments.', 500);
    }

    const { data: updatedAttachment, error: attachmentError } = await supabaseAdmin
      .from('milestone_submission_attachments')
      .update({ promoted_document_id: documentId, status: 'PROMOTED', updated_at: nowIso() })
      .eq('id', attachment.id)
      .eq('package_id', operation.package.id)
      .eq('status', 'PENDING')
      .select('id')
      .maybeSingle();
    if (attachmentError || !updatedAttachment) {
      throw new MilestoneSubmissionPackageReviewError('Failed to promote milestone submission attachments.', 409);
    }

    promoted.attachmentLinked = true;
    return promoted;
  }

  private static async markPackageApproved(operation: SubmissionPackageReviewOperation): Promise<void> {
    const { data, error } = await supabaseAdmin
      .from('milestone_submission_packages')
      .update({ status: 'APPROVED', cleanup_status: 'NOT_REQUIRED', updated_at: nowIso() })
      .eq('id', operation.package.id)
      .eq('milestone_approval_id', operation.approvalId)
      .eq('status', 'PROMOTING')
      .select('id')
      .maybeSingle();

    if (error) throw new MilestoneSubmissionPackageReviewError('Failed to finalize milestone submission package.', 500);
    if (!data) throw new MilestoneSubmissionPackageReviewError('Milestone submission package is no longer being promoted.', 409);
    operation.packageFinalized = true;
  }

  static async promote(operation: SubmissionPackageReviewOperation): Promise<void> {
    if (operation.decision !== 'APPROVED') throw new MilestoneSubmissionPackageReviewError('Invalid package review action.', 500);

    try {
      for (const attachment of operation.attachments) {
        await this.createOfficialDocument(operation, attachment);
      }
      await this.markPackageApproved(operation);
    } catch (error) {
      await this.rollbackPromotion(operation);
      throw error;
    }
  }

  static async rollbackPromotion(operation: SubmissionPackageReviewOperation): Promise<void> {
    if (operation.rolledBack) return;
    operation.rolledBack = true;
    const cleanupErrors: string[] = [];

    for (const promoted of [...operation.promotedDocuments].reverse()) {
      if (promoted.attachmentLinked) {
        const { data, error } = await supabaseAdmin
          .from('milestone_submission_attachments')
          .update({ promoted_document_id: null, status: 'PENDING', updated_at: nowIso() })
          .eq('id', promoted.attachmentId)
          .eq('package_id', operation.package.id)
          .eq('status', 'PROMOTED')
          .eq('promoted_document_id', promoted.documentId)
          .select('id')
          .maybeSingle();
        if (error || !data) cleanupErrors.push(`attachment:${promoted.attachmentId}`);
      }

      const { data, error } = await supabaseAdmin
        .from('documents')
        .delete()
        .eq('id', promoted.documentId)
        .select('id')
        .maybeSingle();
      if (error || !data) cleanupErrors.push(`document:${promoted.documentId}`);
    }

    const expectedStatus = operation.packageFinalized ? 'APPROVED' : 'PROMOTING';
    const { data: restoredPackage, error: packageError } = await supabaseAdmin
      .from('milestone_submission_packages')
      .update({ status: 'PENDING_REVIEW', cleanup_status: 'NOT_REQUIRED', updated_at: nowIso() })
      .eq('id', operation.package.id)
      .eq('milestone_approval_id', operation.approvalId)
      .eq('status', expectedStatus)
      .select('id')
      .maybeSingle();
    if (packageError || !restoredPackage) cleanupErrors.push('package');

    if (cleanupErrors.length) {
      console.error('[MilestoneSubmissionPackageReview] Promotion rollback did not fully complete.', {
        packageId: operation.package.id,
        cleanupErrors,
      });
    }
  }

  private static async deleteCleanedAttachments(operation: SubmissionPackageReviewOperation, attachmentIds: string[]): Promise<boolean> {
    if (!attachmentIds.length) return true;
    const { data, error } = await supabaseAdmin
      .from('milestone_submission_attachments')
      .delete()
      .eq('package_id', operation.package.id)
      .eq('status', 'PENDING')
      .in('id', attachmentIds)
      .select('id');
    return !error && (data || []).length === attachmentIds.length;
  }

  private static async markFailedAttachments(operation: SubmissionPackageReviewOperation, attachmentIds: string[]): Promise<boolean> {
    if (!attachmentIds.length) return true;
    const { data, error } = await supabaseAdmin
      .from('milestone_submission_attachments')
      .update({ status: 'CLEANUP_FAILED', updated_at: nowIso() })
      .eq('package_id', operation.package.id)
      .eq('status', 'PENDING')
      .in('id', attachmentIds)
      .select('id');
    return !error && (data || []).length === attachmentIds.length;
  }

  private static async completeRejection(
    operation: SubmissionPackageReviewOperation,
    cleanupStatus: 'COMPLETED' | 'FAILED'
  ): Promise<void> {
    const { data, error } = await supabaseAdmin
      .from('milestone_submission_packages')
      .update({ status: 'REJECTED', cleanup_status: cleanupStatus, updated_at: nowIso() })
      .eq('id', operation.package.id)
      .eq('milestone_approval_id', operation.approvalId)
      .eq('status', 'REJECTING')
      .select('id')
      .maybeSingle();

    if (error) throw new MilestoneSubmissionPackageReviewError('Failed to finalize milestone submission rejection.', 500);
    if (!data) throw new MilestoneSubmissionPackageReviewError('Milestone submission package is no longer being rejected.', 409);
    operation.packageFinalized = true;
  }

  static async reject(operation: SubmissionPackageReviewOperation): Promise<void> {
    if (operation.decision !== 'REJECTED') throw new MilestoneSubmissionPackageReviewError('Invalid package review action.', 500);

    const results = await Promise.allSettled(
      operation.attachments.map((attachment) => DocumentStorageService.remove(attachment.storage_path))
    );
    const deletedAttachmentIds: string[] = [];
    const failedAttachmentIds: string[] = [];
    results.forEach((result, index) => {
      (result.status === 'fulfilled' ? deletedAttachmentIds : failedAttachmentIds).push(operation.attachments[index].id);
    });

    const deletedMetadata = await this.deleteCleanedAttachments(operation, deletedAttachmentIds);
    const failedMetadata = await this.markFailedAttachments(operation, failedAttachmentIds);
    const cleanupFailed = failedAttachmentIds.length > 0 || !deletedMetadata || !failedMetadata;

    await this.completeRejection(operation, cleanupFailed ? 'FAILED' : 'COMPLETED');

    if (cleanupFailed) {
      console.error('[MilestoneSubmissionPackageReview] Submission cleanup was incomplete after rejection.', {
        packageId: operation.package.id,
        failedAttachmentCount: failedAttachmentIds.length,
      });
    }
  }

  private static async getReadMilestoneContext(milestoneId: string): Promise<ReadMilestoneContext> {
    const { data, error } = await supabaseAdmin
      .from('project_milestones')
      .select('id,pic_id,project:projects!project_milestones_project_id_fkey(id,sales_id)')
      .eq('id', milestoneId)
      .maybeSingle();

    if (error) throw new MilestoneSubmissionPackageReviewError('Failed to retrieve milestone submission package.', 500);
    if (!data) throw new MilestoneSubmissionPackageReviewError('Milestone not found', 404);
    return {
      ...(data as Omit<ReadMilestoneContext, 'project'>),
      project: normalizeRelatedOne((data as { project: ReadMilestoneContext['project'] | ReadMilestoneContext['project'][] }).project),
    };
  }

  private static assertReadAccess(context: ReadMilestoneContext, actor: Actor): void {
    if (!context.project) throw new MilestoneSubmissionPackageReviewError('Milestone not found', 404);
    if (actor.role === 'SUPER_ADMIN' || actor.role === 'HEAD_SA') return;
    if (actor.role === 'SALES' && context.project.sales_id === actor.userId) return;
    if (actor.role === 'SA' && context.pic_id === actor.userId) return;
    throw new MilestoneSubmissionPackageReviewError('Milestone not found', 404);
  }

  static async getCurrentPackage(milestoneId: string, actor: Actor) {
    const milestone = await this.getReadMilestoneContext(milestoneId);
    this.assertReadAccess(milestone, actor);

    const { data: packageRow, error: packageError } = await supabaseAdmin
      .from('milestone_submission_packages')
      .select(packageFields)
      .eq('milestone_id', milestoneId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (packageError) throw new MilestoneSubmissionPackageReviewError('Failed to retrieve milestone submission package.', 500);
    if (!packageRow) return null;

    const packageData = packageRow as SubmissionPackage;
    const { data: attachments, error: attachmentError } = await supabaseAdmin
      .from('milestone_submission_attachments')
      .select('id,file_name,file_size,mime_type,status')
      .eq('package_id', packageData.id)
      .order('created_at', { ascending: true });
    if (attachmentError) throw new MilestoneSubmissionPackageReviewError('Failed to retrieve milestone submission attachments.', 500);

    return {
      id: packageData.id,
      status: packageData.status,
      submission_approval_id: packageData.milestone_approval_id,
      attachment_count: packageData.attachment_count,
      attachments: attachments || [],
    };
  }

  static async getPendingAttachmentDownloadUrl(milestoneId: string, attachmentId: string, actor: Actor) {
    const milestone = await this.getReadMilestoneContext(milestoneId);
    this.assertReadAccess(milestone, actor);

    const { data: packageRow, error: packageError } = await supabaseAdmin
      .from('milestone_submission_packages')
      .select('id')
      .eq('milestone_id', milestoneId)
      .eq('status', 'PENDING_REVIEW')
      .maybeSingle();
    if (packageError) throw new MilestoneSubmissionPackageReviewError('Failed to retrieve milestone submission attachment.', 500);
    if (!packageRow) throw new MilestoneSubmissionPackageReviewError('Milestone submission attachment not found', 404);

    const { data: attachment, error: attachmentError } = await supabaseAdmin
      .from('milestone_submission_attachments')
      .select('id,file_name,storage_path')
      .eq('id', attachmentId)
      .eq('package_id', packageRow.id)
      .eq('status', 'PENDING')
      .maybeSingle();
    if (attachmentError) throw new MilestoneSubmissionPackageReviewError('Failed to retrieve milestone submission attachment.', 500);
    if (!attachment) throw new MilestoneSubmissionPackageReviewError('Milestone submission attachment not found', 404);

    try {
      return {
        attachment_id: attachment.id,
        file_name: attachment.file_name,
        url: await DocumentStorageService.createSignedDownloadUrl(attachment.storage_path, 300),
      };
    } catch {
      throw new MilestoneSubmissionPackageReviewError('Failed to create milestone submission download URL.', 500);
    }
  }
}
