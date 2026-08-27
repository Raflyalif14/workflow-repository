import { prisma } from '../config/prisma';

export class DashboardService {
  /**
   * Get all dashboard statistics in a single call
   */
  static async getOverview() {
    // Run all queries in parallel for performance
    const [
      totalProjects,
      activeProjects,
      completedProjects,
      onHoldProjects,
      cancelledProjects,
      overdueMilestones,
      waitingApproval,
      projectsByScenario,
      projectProgress,
      recentActivity,
    ] = await Promise.all([
      // 1. Total Projects
      prisma.project.count(),

      // 2. Active Projects (IN_PROGRESS)
      prisma.project.count({ where: { status: 'IN_PROGRESS' } }),

      // 3. Completed Projects
      prisma.project.count({ where: { status: 'COMPLETED' } }),

      // 4. On Hold Projects
      prisma.project.count({ where: { status: 'ON_HOLD' } }),

      // 5. Cancelled Projects
      prisma.project.count({ where: { status: 'CANCELLED' } }),

      // 6. Overdue Milestones (deadline passed but not COMPLETED/APPROVED)
      prisma.projectMilestone.count({
        where: {
          deadline: { lt: new Date() },
          status: { notIn: ['COMPLETED', 'APPROVED'] },
        },
      }),

      // 7. Waiting Approval (pending milestone + pending documents)
      prisma.approval.count({ where: { status: 'PENDING' } }),

      // 8. Projects grouped by Scenario
      prisma.project.groupBy({
        by: ['scenarioId'],
        _count: { id: true },
      }),

      // 9. Project Progress (each project with milestone completion %)
      prisma.project.findMany({
        where: { status: { in: ['IN_PROGRESS', 'ON_HOLD'] } },
        orderBy: { updatedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          name: true,
          projectCode: true,
          clientName: true,
          status: true,
          targetEndDate: true,
          milestones: {
            select: {
              id: true,
              name: true,
              status: true,
              orderIndex: true,
              deadline: true,
            },
            orderBy: { orderIndex: 'asc' },
          },
        },
      }),

      // 10. Recent Activity Logs
      prisma.activityLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: {
          user: { select: { id: true, fullName: true, role: true } },
          project: { select: { id: true, name: true, projectCode: true } },
        },
      }),
    ]);

    // Resolve scenario names
    const scenarioIds = projectsByScenario.map((s) => s.scenarioId);
    const scenarios = await prisma.scenario.findMany({
      where: { id: { in: scenarioIds } },
      select: { id: true, name: true },
    });
    const scenarioMap = new Map(scenarios.map((s) => [s.id, s.name]));

    const scenarioDistribution = projectsByScenario.map((group) => ({
      scenarioId: group.scenarioId,
      scenarioName: scenarioMap.get(group.scenarioId) || 'Unknown',
      count: group._count.id,
    }));

    // Compute per-project milestone progress
    const projectProgressData = projectProgress.map((p) => {
      const total = p.milestones.length;
      const completed = p.milestones.filter(
        (m) => m.status === 'COMPLETED' || m.status === 'APPROVED'
      ).length;
      const overdue = p.milestones.filter(
        (m) =>
          m.deadline &&
          new Date(m.deadline) < new Date() &&
          m.status !== 'COMPLETED' &&
          m.status !== 'APPROVED'
      ).length;
      const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

      return {
        id: p.id,
        name: p.name,
        projectCode: p.projectCode,
        clientName: p.clientName,
        status: p.status,
        progress: percentage,
        targetEndDate: p.targetEndDate,
        totalMilestones: total,
        completedMilestones: completed,
        overdueMilestones: overdue,
        percentage,
      };
    });

    // Project status distribution for donut/pie chart
    const statusDistribution = [
      { status: 'IN_PROGRESS', count: activeProjects, color: '#3b82f6' },
      { status: 'COMPLETED', count: completedProjects, color: '#22c55e' },
      { status: 'ON_HOLD', count: onHoldProjects, color: '#f59e0b' },
      { status: 'CANCELLED', count: cancelledProjects, color: '#ef4444' },
    ].filter((d) => d.count > 0);

    return {
      summary: {
        totalProjects,
        activeProjects,
        completedProjects,
        onHoldProjects,
        overdueMilestones,
        waitingApproval,
      },
      scenarioDistribution,
      statusDistribution,
      projectProgress: projectProgressData,
      recentActivity: recentActivity.map((a) => ({
        id: a.id,
        action: a.action,
        entityType: a.entityType,
        details: a.details,
        createdAt: a.createdAt,
        user: a.user,
        project: a.project,
      })),
    };
  }
}
