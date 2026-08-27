import { prisma } from '../config/prisma';
import { ProjectService } from './project.service';
import {
  SubmitMilestoneInput,
  ApproveMilestoneInput,
  RejectMilestoneInput,
  AssignPicInput,
} from '../validators/workflow-engine.validator';
import { UserRole } from '../validators/auth.validator';

export class WorkflowEngineService {
  /**
   * 1. Start Milestone (Sequential Rule Enforcement)
   */
  static async startMilestone(milestoneId: string, userId: string) {
    const milestone = await prisma.projectMilestone.findUnique({
      where: { id: milestoneId },
      include: {
        workflowStage: true,
        project: {
          include: {
            milestones: { orderBy: { orderIndex: 'asc' } },
          },
        },
      },
    });

    if (!milestone) {
      throw new Error('Milestone not found');
    }

    if (milestone.status === 'COMPLETED' || milestone.status === 'APPROVED') {
      throw new Error('This milestone is already completed');
    }

    // Sequential Rule: Validate Step N - 1
    if (milestone.orderIndex > 1) {
      const prevMilestone = milestone.project.milestones.find(
        (m) => m.orderIndex === milestone.orderIndex - 1
      );

      if (
        prevMilestone &&
        prevMilestone.status !== 'COMPLETED' &&
        prevMilestone.status !== 'APPROVED'
      ) {
        throw new Error(
          `Sequential Workflow Violation: Cannot start step ${milestone.orderIndex} ('${milestone.name}'). Previous step '${prevMilestone.name}' must be completed/approved first.`
        );
      }
    }

    const now = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.projectMilestone.update({
        where: { id: milestoneId },
        data: {
          status: 'IN_PROGRESS',
          startDate: milestone.startDate || now,
        },
      });

      // Ensure project status is IN_PROGRESS
      if (milestone.project.status === 'DRAFT') {
        await tx.project.update({
          where: { id: milestone.projectId },
          data: { status: 'IN_PROGRESS' },
        });
      }

      // Log Activity
      await tx.activityLog.create({
        data: {
          userId,
          projectId: milestone.projectId,
          milestoneId,
          action: 'CHANGE_STATUS',
          entityType: 'MILESTONE',
          entityId: milestoneId,
          details: `Milestone '${milestone.name}' (Step ${milestone.orderIndex}) started.`,
        },
      });

      return result;
    });

    return updated;
  }

  /**
   * 2. Submit Milestone (Checks whether Stage requires Approval)
   */
  static async submitMilestone(
    milestoneId: string,
    input: SubmitMilestoneInput,
    userId: string
  ) {
    const milestone = await prisma.projectMilestone.findUnique({
      where: { id: milestoneId },
      include: {
        workflowStage: true,
        project: {
          include: {
            milestones: { orderBy: { orderIndex: 'asc' } },
          },
        },
      },
    });

    if (!milestone) {
      throw new Error('Milestone not found');
    }

    if (milestone.status !== 'IN_PROGRESS' && milestone.status !== 'REJECTED') {
      throw new Error(`Cannot submit milestone with current status '${milestone.status}'`);
    }

    const requiresApproval = milestone.workflowStage?.requiresApproval ?? false;
    const now = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      if (requiresApproval) {
        // Transition to WAITING_APPROVAL & Create Approval Ticket
        const updatedMilestone = await tx.projectMilestone.update({
          where: { id: milestoneId },
          data: {
            status: 'WAITING_APPROVAL',
            notes: input.notes ?? milestone.notes,
          },
        });

        await tx.approval.create({
          data: {
            milestoneId,
            approverId: userId, // Placeholder / assigned approver
            status: 'PENDING',
            actionRole: (milestone.workflowStage?.approverRole as any) || 'HEAD_SOLUTION_ARCHITECT',
            feedback: input.notes,
          },
        });

        await tx.activityLog.create({
          data: {
            userId,
            projectId: milestone.projectId,
            milestoneId,
            action: 'SUBMIT',
            entityType: 'MILESTONE',
            entityId: milestoneId,
            details: `Milestone '${milestone.name}' submitted for approval to Head Solution Architect.`,
          },
        });

        return updatedMilestone;
      } else {
        // Direct Complete & Unlock Next Milestone
        const updatedMilestone = await tx.projectMilestone.update({
          where: { id: milestoneId },
          data: {
            status: 'COMPLETED',
            actualEndDate: now,
            notes: input.notes ?? milestone.notes,
          },
        });

        // Unlock next milestone
        const nextMilestone = milestone.project.milestones.find(
          (m) => m.orderIndex === milestone.orderIndex + 1
        );

        if (nextMilestone && nextMilestone.status === 'NOT_STARTED') {
          await tx.projectMilestone.update({
            where: { id: nextMilestone.id },
            data: {
              status: 'IN_PROGRESS',
              startDate: now,
            },
          });
        }

        // Check if all project milestones finished
        const allCompleted = milestone.project.milestones.every(
          (m) => m.id === milestone.id || m.status === 'COMPLETED' || m.status === 'APPROVED'
        );

        if (allCompleted) {
          await tx.project.update({
            where: { id: milestone.projectId },
            data: {
              status: 'COMPLETED',
              actualEndDate: now,
            },
          });
        }

        await tx.activityLog.create({
          data: {
            userId,
            projectId: milestone.projectId,
            milestoneId,
            action: 'CHANGE_STATUS',
            entityType: 'MILESTONE',
            entityId: milestoneId,
            details: `Milestone '${milestone.name}' completed without approval. Next step unlocked.`,
          },
        });

        return updatedMilestone;
      }
    });

    return updated;
  }

  /**
   * 3. Approve Milestone (Head SA / Super Admin Action)
   */
  static async approveMilestone(
    milestoneId: string,
    input: ApproveMilestoneInput,
    approverUserId: string
  ) {
    const milestone = await prisma.projectMilestone.findUnique({
      where: { id: milestoneId },
      include: {
        project: {
          include: {
            milestones: { orderBy: { orderIndex: 'asc' } },
          },
        },
      },
    });

    if (!milestone) {
      throw new Error('Milestone not found');
    }

    // Idempotent: If already approved or completed, return cleanly
    if (milestone.status === 'APPROVED' || milestone.status === 'COMPLETED') {
      return milestone;
    }

    const now = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      // 1. Update ALL Approval Records for this milestone to APPROVED
      await tx.approval.updateMany({
        where: { milestoneId, status: 'PENDING' },
        data: {
          status: 'APPROVED',
          approverId: approverUserId,
          feedback: input.feedback,
          approvedAt: now,
        },
      });

      // 2. Mark Milestone as APPROVED
      const updatedMilestone = await tx.projectMilestone.update({
        where: { id: milestoneId },
        data: {
          status: 'APPROVED',
          actualEndDate: now,
        },
      });

      // 3. Unlock & Auto-start Next Milestone
      const nextMilestone = milestone.project.milestones.find(
        (m) => m.orderIndex === milestone.orderIndex + 1
      );

      if (nextMilestone && (nextMilestone.status === 'NOT_STARTED' || nextMilestone.status === 'REJECTED')) {
        await tx.projectMilestone.update({
          where: { id: nextMilestone.id },
          data: {
            status: 'IN_PROGRESS',
            startDate: nextMilestone.startDate || now,
          },
        });
      }

      // 4. Recalculate project progress
      const allMilestones = milestone.project.milestones;
      const totalCount = allMilestones.length;
      // Count this milestone as completed
      const completedCount = allMilestones.filter(
        (m) => m.id === milestoneId || m.status === 'COMPLETED' || m.status === 'APPROVED'
      ).length;
      const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

      // 5. Check if all milestones finished -> Mark Project COMPLETED
      const allCompleted = completedCount === totalCount;

      await tx.project.update({
        where: { id: milestone.projectId },
        data: {
          ...(allCompleted
            ? { status: 'COMPLETED', actualEndDate: now }
            : { status: 'IN_PROGRESS' }),
        },
      });

      // 6. Log Activity
      await tx.activityLog.create({
        data: {
          userId: approverUserId,
          projectId: milestone.projectId,
          milestoneId,
          action: 'APPROVE',
          entityType: 'APPROVAL',
          entityId: milestoneId,
          details: `Milestone '${milestone.name}' (Step ${milestone.orderIndex}) APPROVED. Next step unlocked. Progress: ${progressPercent}%. ${input.feedback ? `Feedback: ${input.feedback}` : ''}`,
        },
      });

      return updatedMilestone;
    });

    return updated;
  }

  /**
   * 4. Reject Milestone (Head SA / Super Admin Action)
   */
  static async rejectMilestone(
    milestoneId: string,
    input: RejectMilestoneInput,
    approverUserId: string
  ) {
    const milestone = await prisma.projectMilestone.findUnique({
      where: { id: milestoneId },
    });

    if (!milestone) {
      throw new Error('Milestone not found');
    }

    const now = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      // 1. Update Approval Record to REJECTED
      await tx.approval.updateMany({
        where: { milestoneId, status: 'PENDING' },
        data: {
          status: 'REJECTED',
          approverId: approverUserId,
          feedback: input.feedback,
        },
      });

      // 2. Set Milestone Status to REJECTED with revision feedback
      const updatedMilestone = await tx.projectMilestone.update({
        where: { id: milestoneId },
        data: {
          status: 'REJECTED',
          notes: `Rejection Note: ${input.feedback}`,
        },
      });

      // Log Activity
      await tx.activityLog.create({
        data: {
          userId: approverUserId,
          projectId: milestone.projectId,
          milestoneId,
          action: 'REJECT',
          entityType: 'APPROVAL',
          entityId: milestoneId,
          details: `Milestone '${milestone.name}' REJECTED. Reason: ${input.feedback}`,
        },
      });

      return updatedMilestone;
    });

    return updated;
  }

  /**
   * 5. Assign PIC to Milestone(s)
   */
  static async assignPic(
    milestoneId: string,
    input: AssignPicInput,
    userId: string
  ) {
    const milestone = await prisma.projectMilestone.findUnique({
      where: { id: milestoneId },
      include: {
        project: {
          include: {
            milestones: { orderBy: { orderIndex: 'asc' } },
          },
        },
      },
    });

    if (!milestone) {
      throw new Error('Milestone not found');
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: input.picId },
    });

    if (!targetUser) {
      throw new Error('Target PIC User not found');
    }

    await prisma.$transaction(async (tx) => {
      if (input.applyToSubsequent) {
        // Assign this and all future milestones to the selected SA PIC
        await tx.projectMilestone.updateMany({
          where: {
            projectId: milestone.projectId,
            orderIndex: { gte: milestone.orderIndex },
          },
          data: { picId: input.picId },
        });
      } else {
        await tx.projectMilestone.update({
          where: { id: milestoneId },
          data: { picId: input.picId },
        });
      }

      await tx.activityLog.create({
        data: {
          userId,
          projectId: milestone.projectId,
          milestoneId,
          action: 'UPDATE',
          entityType: 'MILESTONE',
          entityId: milestoneId,
          details: `Assigned PIC '${targetUser.fullName}' to milestone '${milestone.name}' ${
            input.applyToSubsequent ? 'and all subsequent stages' : ''
          }.`,
        },
      });
    });

    return { success: true, message: `PIC assigned to ${targetUser.fullName}` };
  }
}
