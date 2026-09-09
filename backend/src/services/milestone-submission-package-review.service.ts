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
  updated_at: string;
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

const packageFields = 'id,project_id,milestone_id,submitted_by,status,attachment_count,cleanup_status,created_at,updated_at';
const attachmentFields = 'id,package_id,file_name,storage_path,file_size,mime_type,uploaded_by,status,promoted_document_id';
const nowIso = () => new Date().toISOString();
const REJECTING_RECOVERY_MIN_AGE_MS = 30_000;

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

  static async restoreRejectedClaim(operation: SubmissionPackageReviewOperation): Promise<void> {
    if (operation.decision !== 'REJECTED' || operation.packageFinalized) return;
    await this.restoreClaim(operation);
  }

  static async recoverUndurableRejectedClaim(approvalId: string): Promise<void> {
    const packageRow = await this.getLinkedPackage(approvalId);
    if (!packageRow || packageRow.status !== 'REJECTING') return;

    const claimedAt = Date.parse(packageRow.updated_at);
    if (!Number.isFinite(claimedAt) || Date.now() - claimedAt < REJECTING_RECOVERY_MIN_AGE_MS) {
      throw new MilestoneSubmissionPackageReviewError('Milestone submission rejection is still being processed.', 409);
    }

    const { data: attachments, error: attachmentError } = await supabaseAdmin
      .from('milestone_submission_attachments')
      .select(attachmentFields)
      .eq('package_id', packageRow.id)
      .order('created_at', { ascending: true });
    if (attachmentError) throw new MilestoneSubmissionPackageReviewError('Failed to retrieve milestone submission attachments.', 500);

    const pendingAttachments = (attachments || []) as SubmissionAttachment[];
    if (
      pendingAttachments.length !== packageRow.attachment_count ||
      !pendingAttachments.length ||
      !pendingAttachments.every((attachment) => attachment.status === 'PENDING')
    ) {
      throw new MilestoneSubmissionPackageReviewError('Milestone submission package is not recoverable for review.', 409);
    }

    const { data, error } = await supabaseAdmin
      .from('milestone_submission_packages')
      .update({ status: 'PENDING_REVIEW', updated_at: nowIso() })
      .eq('id', packageRow.id)
      .eq('milestone_approval_id', approvalId)
      .eq('status', 'REJECTING')
      .select('id')
      .maybeSingle();
    if (error) throw new MilestoneSubmissionPackageReviewError('Failed to recover milestone submission rejection.', 500);
    if (!data) throw new MilestoneSubmissionPackageReviewError('Milestone submission rejection is no longer recoverable.', 409);
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

  private static async markRejectedAttachments(operation: SubmissionPackageReviewOperation): Promise<void> {
    const { data, error } = await supabaseAdmin
      .from('milestone_submission_attachments')
      .update({ status: 'REJECTED', updated_at: nowIso() })
      .eq('package_id', operation.package.id)
      .eq('status', 'PENDING')
      .in('id', operation.attachments.map((attachment) => attachment.id))
      .select('id');
    if (error) throw new MilestoneSubmissionPackageReviewError('Failed to retain rejected milestone submission attachments.', 500);
    if ((data || []).length !== operation.attachments.length) {
      throw new MilestoneSubmissionPackageReviewError('Milestone submission attachments are no longer pending.', 409);
    }
  }

  private static async completeRejection(operation: SubmissionPackageReviewOperation): Promise<void> {
    const { data, error } = await supabaseAdmin
      .from('milestone_submission_packages')
      .update({ status: 'REJECTED', cleanup_status: 'NOT_REQUIRED', updated_at: nowIso() })
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
    await this.markRejectedAttachments(operation);
    await this.completeRejection(operation);
  }

  static async reconcileRejectedPackage(approvalId: string): Promise<void> {
    const packageRow = await this.getLinkedPackage(approvalId);
    if (!packageRow || packageRow.status === 'REJECTED') return;
    if (packageRow.status !== 'REJECTING') {
      throw new MilestoneSubmissionPackageReviewError('Milestone submission rejection is not being finalized.', 409);
    }

    const { data, error } = await supabaseAdmin
      .from('milestone_submission_attachments')
      .select(attachmentFields)
      .eq('package_id', packageRow.id)
      .order('created_at', { ascending: true });
    if (error) throw new MilestoneSubmissionPackageReviewError('Failed to retrieve milestone submission attachments.', 500);

    const attachments = (data || []) as SubmissionAttachment[];
    if (!attachments.length || attachments.length !== packageRow.attachment_count) {
      throw new MilestoneSubmissionPackageReviewError('Milestone submission package is incomplete.', 409);
    }
    if (!attachments.every((attachment) => ['PENDING', 'REJECTED'].includes(attachment.status))) {
      throw new MilestoneSubmissionPackageReviewError('Milestone submission attachments are no longer available for rejection.', 409);
    }

    const operation: SubmissionPackageReviewOperation = {
      approvalId,
      decision: 'REJECTED',
      package: packageRow,
      attachments,
      promotedDocuments: [],
      packageFinalized: false,
      rolledBack: false,
    };
    if (attachments.some((attachment) => attachment.status === 'PENDING')) {
      await this.markRejectedAttachments(operation);
    }
    await this.completeRejection(operation);
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
    const attachmentStatus = packageData.status === 'PENDING_REVIEW'
      ? 'PENDING'
      : packageData.status === 'REJECTED'
        ? 'REJECTED'
        : null;
    if (!attachmentStatus) {
      return {
        id: packageData.id,
        status: packageData.status,
        submission_approval_id: packageData.milestone_approval_id,
        attachment_count: packageData.attachment_count,
        attachments: [],
      };
    }

    const { data: attachments, error: attachmentError } = await supabaseAdmin
      .from('milestone_submission_attachments')
      .select('id,file_name,file_size,mime_type,status')
      .eq('package_id', packageData.id)
      .eq('status', attachmentStatus)
      .order('created_at', { ascending: true });
    if (attachmentError) throw new MilestoneSubmissionPackageReviewError('Failed to retrieve milestone submission attachments.', 500);
    if ((attachments || []).length !== packageData.attachment_count) {
      throw new MilestoneSubmissionPackageReviewError('Milestone submission package is incomplete.', 409);
    }

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
      .select('id,status')
      .eq('milestone_id', milestoneId)
      .in('status', ['PENDING_REVIEW', 'REJECTED'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (packageError) throw new MilestoneSubmissionPackageReviewError('Failed to retrieve milestone submission attachment.', 500);
    if (!packageRow) throw new MilestoneSubmissionPackageReviewError('Milestone submission attachment not found', 404);

    const attachmentStatus = packageRow.status === 'PENDING_REVIEW'
      ? 'PENDING'
      : packageRow.status === 'REJECTED'
        ? 'REJECTED'
        : null;
    if (!attachmentStatus) throw new MilestoneSubmissionPackageReviewError('Milestone submission attachment not found', 404);

    const { data: attachment, error: attachmentError } = await supabaseAdmin
      .from('milestone_submission_attachments')
      .select('id,file_name,storage_path')
      .eq('id', attachmentId)
      .eq('package_id', packageRow.id)
      .eq('status', attachmentStatus)
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
