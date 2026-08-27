import { prisma } from '../config/prisma';
import {
  CreateProjectInput,
  UpdateProjectInput,
  PostponeProjectInput,
  TriggerMilestoneInput,
  ListProjectsQuery,
} from '../validators/project.validator';

export class ProjectService {
  /**
   * Helper: Add working days skipping weekends and database holidays
   */
  static async addWorkingDays(startDate: Date, daysToAdd: number): Promise<Date> {
    const holidays = await prisma.holiday.findMany({
      select: { date: true },
    });
    const holidaySet = new Set(
      holidays.map((h) => h.date.toISOString().split('T')[0])
    );

    const currentDate = new Date(startDate);
    let added = 0;

    while (added < daysToAdd) {
      currentDate.setDate(currentDate.getDate() + 1);
      const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 6 = Saturday
      const dateStr = currentDate.toISOString().split('T')[0];

      // Skip weekend (0 or 6) and official holidays
      if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidaySet.has(dateStr)) {
        added++;
      }
    }

    return currentDate;
  }

  /**
   * List projects with search, filter, pagination, and progress calculation
   */
  static async listProjects(query: ListProjectsQuery) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.scenarioId) {
      where.scenarioId = query.scenarioId;
    }

    if (query.salesId) {
      where.salesId = query.salesId;
    }

    if (query.search) {
      const search = query.search.trim();
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { projectCode: { contains: search, mode: 'insensitive' } },
        { clientName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, rawProjects] = await Promise.all([
      prisma.project.count({ where }),
      prisma.project.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          scenario: {
            select: {
              id: true,
              name: true,
              code: true,
              slaWorkingDays: true,
              workflowTemplate: { select: { name: true } },
            },
          },
          salesPIC: {
            select: { id: true, fullName: true, email: true, username: true },
          },
          headSaPIC: {
            select: { id: true, fullName: true, email: true },
          },
          milestones: {
            select: {
              id: true,
              name: true,
              status: true,
              orderIndex: true,
              deadline: true,
              pic: { select: { id: true, fullName: true } },
            },
            orderBy: { orderIndex: 'asc' },
          },
        },
      }),
    ]);

    // Calculate progress percentage for each project
    const projects = rawProjects.map((p) => {
      const totalMilestones = p.milestones.length;
      const completedMilestones = p.milestones.filter(
        (m) => m.status === 'COMPLETED' || m.status === 'APPROVED'
      ).length;
      const progress =
        totalMilestones > 0
          ? Math.round((completedMilestones / totalMilestones) * 100)
          : 0;

      return {
        ...p,
        totalMilestones,
        completedMilestones,
        progress,
      };
    });

    const totalPages = Math.ceil(total / limit);

    return {
      projects,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  /**
   * Get single project detail with milestones and activity logs
   */
  static async getProjectById(id: string) {
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        scenario: {
          include: {
            workflowTemplate: true,
            stages: { orderBy: { orderIndex: 'asc' } },
          },
        },
        createdBy: { select: { id: true, fullName: true, email: true } },
        salesPIC: { select: { id: true, fullName: true, email: true, phoneNumber: true } },
        headSaPIC: { select: { id: true, fullName: true, email: true } },
        milestones: {
          orderBy: { orderIndex: 'asc' },
          include: {
            pic: { select: { id: true, fullName: true, email: true } },
            approvals: {
              include: {
                approver: { select: { id: true, fullName: true, role: true } },
              },
            },
            documents: {
              include: {
                versions: { where: { isLatest: true }, take: 1 },
              },
            },
          },
        },
        activityLogs: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: {
            user: { select: { id: true, fullName: true, role: true } },
          },
        },
      },
    });

    if (!project) {
      throw new Error('Project not found');
    }

    const totalMilestones = project.milestones.length;
    const completedMilestones = project.milestones.filter(
      (m) => m.status === 'COMPLETED' || m.status === 'APPROVED'
    ).length;
    const progress =
      totalMilestones > 0
        ? Math.round((completedMilestones / totalMilestones) * 100)
        : 0;

    return {
      ...project,
      totalMilestones,
      completedMilestones,
      progress,
    };
  }

  /**
   * Create new Project and auto-instantiate Milestones from Scenario Stages
   */
  static async createProject(input: CreateProjectInput, salesUserId: string) {
    const existing = await prisma.project.findUnique({
      where: { projectCode: input.projectCode },
    });

    if (existing) {
      throw new Error(`Project with code '${input.projectCode}' already exists`);
    }

    const scenario = await prisma.scenario.findUnique({
      where: { id: input.scenarioId },
      include: {
        stages: { orderBy: { orderIndex: 'asc' } },
        workflowTemplate: true,
      },
    });

    if (!scenario) {
      throw new Error('Selected Scenario does not exist');
    }

    const startDate = new Date(input.startDate);

    // Calculate target end date via working days if not provided
    let targetEndDate: Date;
    if (input.targetEndDate) {
      targetEndDate = new Date(input.targetEndDate);
    } else {
      targetEndDate = await this.addWorkingDays(startDate, scenario.slaWorkingDays);
    }

    // Default PIC (if not specified, assigned to sales creator or fallback)
    const defaultPicId = input.defaultPicId || salesUserId;

    // Transaction: create project and all scenario-based milestones
    const project = await prisma.$transaction(async (tx) => {
      const newProject = await tx.project.create({
        data: {
          projectCode: input.projectCode,
          name: input.name,
          clientName: input.clientName,
          description: input.description,
          scenarioId: scenario.id,
          createdById: salesUserId,
          salesId: salesUserId,
          headSaId: input.headSaId,
          status: 'IN_PROGRESS',
          startDate,
          targetEndDate,
        },
      });

      // Iteratively generate milestones and calculate sequential working day deadlines
      let currentStageStart = new Date(startDate);
      const stages = scenario.stages;

      if (stages.length > 0) {
        for (const stage of stages) {
          const stageDeadline = await this.addWorkingDays(
            currentStageStart,
            stage.defaultDurationDays || 5
          );

          await tx.projectMilestone.create({
            data: {
              projectId: newProject.id,
              workflowStageId: stage.id,
              name: stage.name,
              orderIndex: stage.orderIndex,
              picId: defaultPicId,
              status: stage.orderIndex === 1 ? 'IN_PROGRESS' : 'NOT_STARTED',
              startDate: stage.orderIndex === 1 ? currentStageStart : null,
              deadline: stageDeadline,
            },
          });

          // Next stage starts when current stage is expected to complete
          currentStageStart = new Date(stageDeadline);
        }
      }

      // Log activity
      await tx.activityLog.create({
        data: {
          userId: salesUserId,
          projectId: newProject.id,
          action: 'CREATE',
          entityType: 'PROJECT',
          entityId: newProject.id,
          details: `Project '${newProject.name}' (${newProject.projectCode}) created with scenario '${scenario.name}'.`,
        },
      });

      return newProject;
    });

    return this.getProjectById(project.id);
  }

  /**
   * Postpone Project and adjust milestone timelines
   */
  static async postponeProject(
    projectId: string,
    input: PostponeProjectInput,
    userId: string
  ) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { milestones: { orderBy: { orderIndex: 'asc' } } },
    });

    if (!project) {
      throw new Error('Project not found');
    }

    const newTargetEndDate = new Date(input.newTargetEndDate);
    if (newTargetEndDate <= new Date(project.startDate)) {
      throw new Error('New target deadline must be after the project start date');
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Update project deadline and postpone notes
      const updatedProject = await tx.project.update({
        where: { id: projectId },
        data: {
          targetEndDate: newTargetEndDate,
          postponeReason: input.reason,
          status: project.status === 'COMPLETED' ? 'COMPLETED' : 'ON_HOLD',
        },
      });

      // Shift pending milestones to the new timeline boundary
      const pendingMilestones = project.milestones.filter(
        (m) => m.status !== 'COMPLETED' && m.status !== 'APPROVED'
      );

      if (pendingMilestones.length > 0) {
        const lastPending = pendingMilestones[pendingMilestones.length - 1];
        await tx.projectMilestone.update({
          where: { id: lastPending.id },
          data: { deadline: newTargetEndDate },
        });
      }

      // Record Activity Log
      await tx.activityLog.create({
        data: {
          userId,
          projectId,
          action: 'UPDATE',
          entityType: 'PROJECT',
          entityId: projectId,
          details: `Project postponed to ${newTargetEndDate.toISOString().split('T')[0]}. Reason: ${input.reason}`,
          metadata: {
            oldDeadline: project.targetEndDate,
            newDeadline: newTargetEndDate,
            reason: input.reason,
          },
        },
      });

      return updatedProject;
    });

    return this.getProjectById(updated.id);
  }

  /**
   * Trigger / Update Milestone progress
   */
  static async triggerMilestone(
    milestoneId: string,
    input: TriggerMilestoneInput,
    userId: string
  ) {
    const milestone = await prisma.projectMilestone.findUnique({
      where: { id: milestoneId },
      include: { project: { include: { milestones: true } } },
    });

    if (!milestone) {
      throw new Error('Milestone not found');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const updatedMilestone = await tx.projectMilestone.update({
        where: { id: milestoneId },
        data: {
          status: input.status,
          notes: input.notes ?? milestone.notes,
          ...(input.status === 'IN_PROGRESS' && !milestone.startDate && { startDate: now }),
          ...(input.status === 'COMPLETED' && { actualEndDate: now }),
        },
      });

      // If milestone completed, trigger next milestone to IN_PROGRESS
      if (input.status === 'COMPLETED') {
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

        // Check if all milestones are completed -> mark project COMPLETED
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
      }

      // Log activity
      await tx.activityLog.create({
        data: {
          userId,
          projectId: milestone.projectId,
          milestoneId: milestone.id,
          action: 'CHANGE_STATUS',
          entityType: 'MILESTONE',
          entityId: milestone.id,
          details: `Milestone '${milestone.name}' status changed to '${input.status}'.`,
          metadata: { previousStatus: milestone.status, newStatus: input.status },
        },
      });

      return updatedMilestone;
    });

    return updated;
  }

  /**
   * List available Scenarios for Sales picker
   */
  static async listScenarios() {
    return prisma.scenario.findMany({
      where: { isActive: true },
      include: {
        workflowTemplate: { select: { name: true, code: true } },
        stages: { orderBy: { orderIndex: 'asc' } },
        _count: { select: { projects: true } },
      },
      orderBy: { name: 'asc' },
    });
  }
}
