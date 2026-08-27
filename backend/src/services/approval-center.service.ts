import { prisma } from '../config/prisma';
import { WorkflowEngineService } from './workflow-engine.service';
import { DocumentService } from './document.service';
import {
  ListApprovalsQuery,
  ProcessApprovalInput,
  ApprovalCommentInput,
} from '../validators/approval.validator';

export class ApprovalCenterService {
  /**
   * List all approvals across Deadlines, Milestones, and Documents
   */
  static async listApprovals(query: ListApprovalsQuery) {
    const { type, status, projectId, search } = query;

    // 1. Fetch Milestone & Document Approvals from Approval Table
    const approvalWhere: any = {};

    if (status && status !== 'ALL') {
      approvalWhere.status = status;
    }

    if (type === 'MILESTONE') {
      approvalWhere.milestoneId = { not: null };
    } else if (type === 'DOCUMENT') {
      approvalWhere.documentVersionId = { not: null };
    }

    const rawApprovals = await prisma.approval.findMany({
      where: approvalWhere,
      orderBy: { createdAt: 'desc' },
      include: {
        approver: { select: { id: true, fullName: true, role: true, avatarUrl: true } },
        milestone: {
          include: {
            project: {
              select: { id: true, name: true, projectCode: true, clientName: true },
            },
            pic: { select: { id: true, fullName: true, role: true } },
            workflowStage: { select: { name: true, orderIndex: true } },
          },
        },
        documentVersion: {
          include: {
            document: {
              include: {
                project: {
                  select: { id: true, name: true, projectCode: true, clientName: true },
                },
                milestone: { select: { id: true, name: true } },
              },
            },
            uploadedBy: { select: { id: true, fullName: true, role: true } },
          },
        },
      },
    });

    // Format Approval Items into unified structure
    const formattedApprovals: any[] = [];

    for (const app of rawApprovals) {
      if (app.milestone) {
        // Milestone Approval Item
        formattedApprovals.push({
          id: app.id,
          category: 'MILESTONE',
          title: `Milestone Sign-Off: ${app.milestone.name}`,
          status: app.status,
          projectId: app.milestone.project.id,
          projectName: app.milestone.project.name,
          projectCode: app.milestone.project.projectCode,
          clientName: app.milestone.project.clientName,
          targetEntityId: app.milestone.id,
          submittedBy: app.milestone.pic?.fullName || 'Solution Architect',
          submittedAt: app.createdAt,
          deadline: app.milestone.deadline,
          feedback: app.feedback,
          approvedAt: app.approvedAt,
          approverName: app.approver?.fullName,
          details: `Stage Step ${app.milestone.orderIndex}. Requires Head SA verification.`,
        });
      } else if (app.documentVersion) {
        // Document Version Approval Item
        formattedApprovals.push({
          id: app.id,
          category: 'DOCUMENT',
          title: `Deliverable Review: ${app.documentVersion.document.title} (v${app.documentVersion.versionNumber})`,
          status: app.status,
          projectId: app.documentVersion.document.project.id,
          projectName: app.documentVersion.document.project.name,
          projectCode: app.documentVersion.document.project.projectCode,
          clientName: app.documentVersion.document.project.clientName,
          targetEntityId: app.documentVersion.id,
          documentId: app.documentVersion.documentId,
          submittedBy: app.documentVersion.uploadedBy?.fullName || 'Author',
          submittedAt: app.createdAt,
          fileUrl: app.documentVersion.fileUrl,
          fileName: app.documentVersion.fileName,
          fileSize: app.documentVersion.fileSize,
          changelog: app.documentVersion.changelog,
          feedback: app.feedback,
          approvedAt: app.approvedAt,
          approverName: app.approver?.fullName,
          details: `Category: ${app.documentVersion.document.category}. Changelog: "${app.documentVersion.changelog || 'None'}"`,
        });
      }
    }

    // 2. Fetch Postponed Projects (Deadline Approvals) if queried
    if (type === 'ALL' || type === 'DEADLINE') {
      const deadlineProjects = await prisma.project.findMany({
        where: {
          postponeReason: { not: null },
          ...(status === 'PENDING' ? { status: 'ON_HOLD' } : {}),
          ...(projectId ? { id: projectId } : {}),
        },
        orderBy: { updatedAt: 'desc' },
        include: {
          salesPIC: { select: { id: true, fullName: true, role: true } },
        },
      });

      for (const p of deadlineProjects) {
        formattedApprovals.push({
          id: `deadline-${p.id}`,
          category: 'DEADLINE',
          title: `Project Deadline Extension: ${p.name}`,
          status: p.status === 'ON_HOLD' ? 'PENDING' : 'APPROVED',
          projectId: p.id,
          projectName: p.name,
          projectCode: p.projectCode,
          clientName: p.clientName,
          targetEntityId: p.id,
          submittedBy: p.salesPIC?.fullName || 'Sales Executive',
          submittedAt: p.updatedAt,
          deadline: p.targetEndDate,
          details: `Requested Postpone Deadline: ${p.targetEndDate.toISOString().split('T')[0]}. Reason: "${p.postponeReason}"`,
          feedback: p.postponeReason,
        });
      }
    }

    // Apply search filter if provided
    let results = formattedApprovals;
    if (search) {
      const q = search.toLowerCase();
      results = results.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.clientName.toLowerCase().includes(q) ||
          a.projectCode.toLowerCase().includes(q) ||
          a.submittedBy.toLowerCase().includes(q)
      );
    }

    return results;
  }

  /**
   * Get Approval Statistics Overview
   */
  static async getApprovalStats() {
    const [pendingMilestones, pendingDocs, pendingDeadlines] = await Promise.all([
      prisma.approval.count({
        where: { status: 'PENDING', milestoneId: { not: null } },
      }),
      prisma.approval.count({
        where: { status: 'PENDING', documentVersionId: { not: null } },
      }),
      prisma.project.count({
        where: { status: 'ON_HOLD', postponeReason: { not: null } },
      }),
    ]);

    return {
      totalPending: pendingMilestones + pendingDocs + pendingDeadlines,
      pendingMilestones,
      pendingDocs,
      pendingDeadlines,
    };
  }

  /**
   * Process Approval Decision (Approve or Reject)
   */
  static async processDecision(
    approvalId: string,
    input: ProcessApprovalInput,
    approverUserId: string
  ) {
    // 1. Handle Deadline Approval item
    if (approvalId.startsWith('deadline-')) {
      const projectId = approvalId.replace('deadline-', '');
      const isApproved = input.action === 'APPROVE';

      const updatedProject = await prisma.project.update({
        where: { id: projectId },
        data: {
          status: isApproved ? 'IN_PROGRESS' : 'CANCELLED',
        },
      });

      await prisma.activityLog.create({
        data: {
          userId: approverUserId,
          projectId,
          action: isApproved ? 'APPROVE' : 'REJECT',
          entityType: 'DEADLINE',
          entityId: projectId,
          details: `Deadline extension for project '${updatedProject.name}' ${
            isApproved ? 'APPROVED' : 'REJECTED'
          }. Remarks: ${input.feedback || 'None'}`,
        },
      });

      return { success: true, message: `Deadline request ${input.action.toLowerCase()}d` };
    }

    // 2. Handle Milestone or Document Approval via Approval Table
    const approval = await prisma.approval.findUnique({
      where: { id: approvalId },
    });

    if (!approval) {
      throw new Error('Approval ticket not found');
    }

    if (approval.milestoneId) {
      if (input.action === 'APPROVE') {
        await WorkflowEngineService.approveMilestone(
          approval.milestoneId,
          { feedback: input.feedback },
          approverUserId
        );
      } else {
        await WorkflowEngineService.rejectMilestone(
          approval.milestoneId,
          { feedback: input.feedback || 'Revision required by Head Solution Architect' },
          approverUserId
        );
      }
    } else if (approval.documentVersionId) {
      await DocumentService.reviewVersion(
        approval.documentVersionId,
        {
          status: input.action as 'APPROVED' | 'REJECTED',
          feedback: input.feedback,
        },
        approverUserId
      );
    }

    return { success: true, message: `Approval ${input.action.toLowerCase()}d successfully` };
  }

  /**
   * Add comment to approval ticket context
   */
  static async addComment(
    approvalId: string,
    input: ApprovalCommentInput,
    userId: string
  ) {
    const approval = await prisma.approval.findUnique({
      where: { id: approvalId },
      include: {
        milestone: true,
        documentVersion: true,
      },
    });

    if (!approval) {
      throw new Error('Approval ticket not found');
    }

    const projectId = approval.milestone?.projectId || approval.documentVersion?.documentId;

    if (!projectId) {
      throw new Error('Associated project not found for this approval');
    }

    return prisma.comment.create({
      data: {
        projectId: approval.milestone?.projectId || '',
        milestoneId: approval.milestoneId,
        documentId: approval.documentVersion?.documentId,
        authorId: userId,
        content: input.content,
      },
      include: {
        author: { select: { id: true, fullName: true, role: true, avatarUrl: true } },
      },
    });
  }
}
