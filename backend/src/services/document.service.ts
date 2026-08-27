import { prisma } from '../config/prisma';
import { StorageService } from '../utils/storage.util';
import { WorkflowEngineService } from './workflow-engine.service';
import {
  CreateDocumentInput,
  UploadVersionInput,
  ReviewVersionInput,
  CreateCommentInput,
  ListDocumentsQuery,
} from '../validators/document.validator';

export class DocumentService {
  /**
   * List documents with filters
   */
  static async listDocuments(query: ListDocumentsQuery) {
    const where: any = {};

    if (query.projectId) {
      where.projectId = query.projectId;
    }
    if (query.milestoneId) {
      where.milestoneId = query.milestoneId;
    }
    if (query.category) {
      where.category = query.category;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.search) {
      where.title = { contains: query.search.trim(), mode: 'insensitive' };
    }

    return prisma.document.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        project: { select: { id: true, name: true, projectCode: true, clientName: true } },
        milestone: { select: { id: true, name: true, orderIndex: true } },
        versions: {
          where: { isLatest: true },
          take: 1,
          include: {
            uploadedBy: { select: { id: true, fullName: true, role: true } },
            approvals: {
              take: 1,
              orderBy: { createdAt: 'desc' },
              include: { approver: { select: { id: true, fullName: true, role: true } } },
            },
          },
        },
        _count: {
          select: {
            versions: true,
            comments: true,
          },
        },
      },
    });
  }

  /**
   * Get single document details with all versions and comments thread
   */
  static async getDocumentById(id: string) {
    const document = await prisma.document.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true, projectCode: true, clientName: true } },
        milestone: { select: { id: true, name: true, orderIndex: true } },
        versions: {
          orderBy: { versionNumber: 'desc' },
          include: {
            uploadedBy: { select: { id: true, fullName: true, role: true, avatarUrl: true } },
            approvals: {
              orderBy: { createdAt: 'desc' },
              include: {
                approver: { select: { id: true, fullName: true, role: true } },
              },
            },
          },
        },
        comments: {
          orderBy: { createdAt: 'asc' },
          include: {
            author: { select: { id: true, fullName: true, role: true, avatarUrl: true } },
          },
        },
      },
    });

    if (!document) {
      throw new Error('Document not found');
    }

    return document;
  }

  /**
   * Create new Document and upload Initial Version (v1)
   */
  static async createDocument(
    input: CreateDocumentInput,
    file: Express.Multer.File,
    userId: string
  ) {
    const fileUrl = StorageService.getFileUrl(file.filename);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create parent Document container
      const newDoc = await tx.document.create({
        data: {
          projectId: input.projectId,
          milestoneId: input.milestoneId,
          title: input.title,
          category: input.category,
          status: 'SUBMITTED',
        },
      });

      // 2. Create Document Version 1
      const initialVersion = await tx.documentVersion.create({
        data: {
          documentId: newDoc.id,
          versionNumber: 1,
          fileName: file.originalname,
          fileUrl,
          fileSize: file.size,
          mimeType: file.mimetype,
          changelog: input.changelog || 'Initial document version upload.',
          status: 'SUBMITTED',
          uploadedById: userId,
          isLatest: true,
        },
      });

      // 3. Create Approval Ticket for this version
      await tx.approval.create({
        data: {
          documentVersionId: initialVersion.id,
          approverId: userId, // Placeholder
          status: 'PENDING',
          actionRole: 'HEAD_SOLUTION_ARCHITECT',
          feedback: 'Submitted for Head SA document review.',
        },
      });

      // 4. Log Activity
      await tx.activityLog.create({
        data: {
          userId,
          projectId: input.projectId,
          milestoneId: input.milestoneId,
          action: 'UPLOAD_DOCUMENT',
          entityType: 'DOCUMENT',
          entityId: newDoc.id,
          details: `Document '${newDoc.title}' (v1: ${file.originalname}) uploaded.`,
        },
      });

      return newDoc;
    });

    return this.getDocumentById(result.id);
  }

  /**
   * Upload New Document Version (v2, v3...)
   */
  static async uploadNewVersion(
    documentId: string,
    input: UploadVersionInput,
    file: Express.Multer.File,
    userId: string
  ) {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: {
        versions: { orderBy: { versionNumber: 'desc' } },
      },
    });

    if (!document) {
      throw new Error('Document not found');
    }

    const latestVersionNumber = document.versions[0]?.versionNumber || 0;
    const nextVersionNumber = latestVersionNumber + 1;
    const fileUrl = StorageService.getFileUrl(file.filename);

    await prisma.$transaction(async (tx) => {
      // 1. Demote old latest version
      await tx.documentVersion.updateMany({
        where: { documentId, isLatest: true },
        data: { isLatest: false, status: 'SUPERSEDED' },
      });

      // 2. Insert new Version
      const newVersion = await tx.documentVersion.create({
        data: {
          documentId,
          versionNumber: nextVersionNumber,
          fileName: file.originalname,
          fileUrl,
          fileSize: file.size,
          mimeType: file.mimetype,
          changelog: input.changelog,
          status: 'SUBMITTED',
          uploadedById: userId,
          isLatest: true,
        },
      });

      // 3. Update Parent Document status
      await tx.document.update({
        where: { id: documentId },
        data: { status: 'SUBMITTED' },
      });

      // 4. Create Approval record for new version
      await tx.approval.create({
        data: {
          documentVersionId: newVersion.id,
          approverId: userId,
          status: 'PENDING',
          actionRole: 'HEAD_SOLUTION_ARCHITECT',
          feedback: `v${nextVersionNumber} revision submitted. Changelog: ${input.changelog}`,
        },
      });

      // 5. Log Activity
      await tx.activityLog.create({
        data: {
          userId,
          projectId: document.projectId,
          milestoneId: document.milestoneId,
          action: 'UPLOAD_DOCUMENT',
          entityType: 'DOCUMENT_VERSION',
          entityId: newVersion.id,
          details: `Uploaded v${nextVersionNumber} for '${document.title}' (${file.originalname}). Changelog: ${input.changelog}`,
        },
      });
    });

    return this.getDocumentById(documentId);
  }

  /**
   * Approve or Reject a specific Document Version (Head SA / Super Admin)
   */
  static async reviewVersion(
    versionId: string,
    input: ReviewVersionInput,
    approverUserId: string
  ) {
    const version = await prisma.documentVersion.findUnique({
      where: { id: versionId },
      include: { document: true },
    });

    if (!version) {
      throw new Error('Document version not found');
    }

    const now = new Date();
    const isApproved = input.status === 'APPROVED';

    await prisma.$transaction(async (tx) => {
      // 1. Update Version Status
      await tx.documentVersion.update({
        where: { id: versionId },
        data: {
          status: isApproved ? 'APPROVED' : 'REJECTED',
        },
      });

      // 2. Update Parent Document Status if this is latest version
      if (version.isLatest) {
        await tx.document.update({
          where: { id: version.documentId },
          data: {
            status: isApproved ? 'APPROVED' : 'REJECTED',
          },
        });
      }

      // 3. Update Approval Ticket
      await tx.approval.updateMany({
        where: { documentVersionId: versionId, status: 'PENDING' },
        data: {
          status: isApproved ? 'APPROVED' : 'REJECTED',
          approverId: approverUserId,
          feedback: input.feedback,
          approvedAt: isApproved ? now : null,
        },
      });

      // 4. Log Activity
      await tx.activityLog.create({
        data: {
          userId: approverUserId,
          projectId: version.document.projectId,
          action: isApproved ? 'APPROVE' : 'REJECT',
          entityType: 'DOCUMENT_VERSION',
          entityId: versionId,
          details: `Document '${version.document.title}' (v${version.versionNumber}) ${
            isApproved ? 'APPROVED' : 'REJECTED'
          }. ${input.feedback ? `Feedback: ${input.feedback}` : ''}`,
        },
      });
    });

    // 5. If attached to a milestone and approved, also advance the milestone workflow
    if (isApproved && version.document.milestoneId) {
      try {
        await WorkflowEngineService.approveMilestone(
          version.document.milestoneId,
          { feedback: `Approved via Document Review: '${version.document.title}'` },
          approverUserId
        );
      } catch (err) {
        console.warn('Could not auto-advance milestone on doc approval:', err);
      }
    }

    return this.getDocumentById(version.documentId);
  }

  /**
   * Add Comment to Document
   */
  static async addComment(documentId: string, input: CreateCommentInput, authorId: string) {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new Error('Document not found');
    }

    const comment = await prisma.comment.create({
      data: {
        documentId,
        projectId: document.projectId,
        milestoneId: input.milestoneId || document.milestoneId,
        authorId,
        content: input.content,
      },
      include: {
        author: { select: { id: true, fullName: true, role: true, avatarUrl: true } },
      },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        userId: authorId,
        projectId: document.projectId,
        action: 'COMMENT',
        entityType: 'DOCUMENT',
        entityId: documentId,
        details: `Added a comment on document '${document.title}'.`,
      },
    });

    return comment;
  }
}
