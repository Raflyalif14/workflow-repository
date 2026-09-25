export interface DashboardSummary {
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  onHoldProjects: number;
  postponedProjects?: number;
  cancelledProjects?: number;
  overdueMilestones: number;
  waitingApproval: number;
}

export interface ScenarioDistribution {
  scenarioId: string;
  scenarioName: string;
  count: number;
}

export interface StatusDistribution {
  status: string;
  count: number;
  color: string;
}

export interface ProjectProgress {
  id: string;
  name: string;
  projectCode: string;
  clientName: string;
  status: string;
  progress: number;
  targetEndDate: string | null;
  totalMilestones: number;
  completedMilestones: number;
  overdueMilestones: number;
  percentage: number;
}

export interface RecentActivity {
  id: string;
  action: string;
  entityType: string;
  details: string;
  createdAt: string;
  user: {
    id: string;
    fullName: string;
    role: string;
  };
  project: {
    id: string;
    name: string;
    projectCode: string;
  } | null;
}

export interface DashboardOutputDocuments {
  reviewQueue: Array<{ projectId: string; projectName: string; count: number }>;
  revisionQueue: Array<{ projectId: string; projectName: string; count: number }>;
  salesProgress: Array<{ projectId: string; approvedCount: number; selectedCount: number }>;
}

export interface DashboardSaWorkload {
  saId: string;
  saName: string;
  activeProjectCount: number;
  activeMilestoneCount: number;
  overdueCount: number;
  revisionCount: number;
  waitingReviewCount: number;
  nearestDeadline: string | null;
}

export interface DashboardData {
  summary: DashboardSummary;
  scenarioDistribution: ScenarioDistribution[];
  statusDistribution: StatusDistribution[];
  projectProgress: ProjectProgress[];
  recentActivity: RecentActivity[];
  outputDocuments: DashboardOutputDocuments;
  saWorkload: DashboardSaWorkload[];
  salesResults: {
    totalEstimatedRevenue: number;
    finalContractValueTotal: number;
    waitingResult: { count: number; estimatedRevenue: number };
    won: { count: number; estimatedRevenue: number };
    lost: { count: number; estimatedRevenue: number };
  } | null;
}
