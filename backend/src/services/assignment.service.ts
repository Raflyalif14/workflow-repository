import { prisma } from '../config/prisma';
import { AssignPicInput } from '../validators/assignment.validator';

export class AssignmentService {
  static async assignOrReassignPIC(projectId: string, input: AssignPicInput, assignedByUserId: string) {
    const project = await prisma.project.findUnique({ where: { id: projectId }, include: { milestones: { orderBy: { orderIndex: 'asc' } } } });
    if (!project) throw new Error('Project not found');
    const user = await prisma.user.findUnique({ where: { id: input.newPicId } });
    if (!user || !user.isActive) throw new Error('Selected Solution Architect is inactive or not found');
    const target = input.milestoneId ? project.milestones.find((item) => item.id === input.milestoneId) : project.milestones[0];
    if (input.milestoneId && !target) throw new Error('Milestone not found in this project');
    const previousPicId = target?.picId || null;
    if (input.assignToAllFuture && target) await prisma.projectMilestone.updateMany({ where: { projectId, orderIndex: { gte: target.orderIndex } }, data: { picId: input.newPicId } });
    else if (target) await prisma.projectMilestone.update({ where: { id: target.id }, data: { picId: input.newPicId } });
    const history = await prisma.assignmentHistory.create({ data: { projectId, milestoneId: target?.id, previousPicId, newPicId: input.newPicId, assignedById: assignedByUserId, reason: input.reason, assignedToFuture: input.assignToAllFuture }, include: { previousPic: true, newPic: true, assignedBy: true } });
    return history;
  }

  static getAssignmentHistory(projectId: string) {
    return prisma.assignmentHistory.findMany({ where: { projectId }, orderBy: { createdAt: 'desc' }, include: { previousPic: true, newPic: true, assignedBy: true, milestone: true } });
  }

  static getEligibleSolutionArchitects() {
    return prisma.user.findMany({ where: { isActive: true, role: { in: ['SOLUTION_ARCHITECT', 'HEAD_SOLUTION_ARCHITECT', 'SUPER_ADMIN'] } }, orderBy: [{ role: 'asc' }, { fullName: 'asc' }] });
  }
}
