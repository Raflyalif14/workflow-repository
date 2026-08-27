import { prisma } from '../config/prisma';
import { CreateWorkflowInput, CreateWorkflowVersionInput } from '../validators/workflow.validator';

export class WorkflowService {
  static async listWorkflows(filters?: { repositoryId?: string; search?: string }) {
    const where: any = {};
    if (filters?.repositoryId) {
      where.repositoryId = filters.repositoryId;
    }
    if (filters?.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    return prisma.workflow.findMany({
      where,
      include: {
        repository: {
          select: { id: true, name: true, slug: true },
        },
        author: {
          select: { id: true, username: true, fullName: true, avatarUrl: true },
        },
        versions: {
          where: { isLatest: true },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  static async getWorkflowById(id: string) {
    const workflow = await prisma.workflow.findUnique({
      where: { id },
      include: {
        repository: true,
        author: {
          select: { id: true, username: true, fullName: true, avatarUrl: true },
        },
        versions: {
          orderBy: { createdAt: 'desc' },
          include: {
            steps: {
              orderBy: { stepOrder: 'asc' },
            },
          },
        },
      },
    });

    if (!workflow) {
      throw new Error('Workflow not found');
    }

    return workflow;
  }

  static async createWorkflow(input: CreateWorkflowInput, authorId: string) {
    return prisma.workflow.create({
      data: {
        name: input.name,
        slug: input.slug,
        description: input.description,
        category: input.category,
        tags: input.tags,
        repositoryId: input.repositoryId,
        authorId,
      },
      include: {
        author: {
          select: { id: true, username: true, fullName: true },
        },
      },
    });
  }

  static async createVersion(input: CreateWorkflowVersionInput) {
    // Demote current latest version
    await prisma.workflowVersion.updateMany({
      where: { workflowId: input.workflowId, isLatest: true },
      data: { isLatest: false },
    });

    return prisma.workflowVersion.create({
      data: {
        workflowId: input.workflowId,
        versionNumber: input.versionNumber,
        changelog: input.changelog,
        triggerType: input.triggerType,
        definitionJson: input.definitionJson,
        isLatest: true,
      },
    });
  }
}
