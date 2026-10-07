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
  reviewQueue: Array<{ projectId: string; milestoneId: string; projectName: string; count: number }>;
  revisionQueue: Array<{ projectId: string; milestoneId: string; projectName: string; count: number }>;
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

export interface DashboardHeadSaProjectValues {
  active: { count: number; estimatedRevenue: number };
  won: { count: number; finalContractValue: number };
}

export interface DashboardData {
  allWorkStatus?: {
    total: number; planning: number; active: number; postponed: number;
    completed: number; won: number; lost: number; waitingResult: number; cancelled: number;
  } | null;
  phaseWorkStatus?: {
    PRA_TENDER: { active: number; postponed: number };
    ON_SUBMISSION_TENDER: { won: number; lost: number };
  } | null;
  summary: DashboardSummary;
  scenarioDistribution: ScenarioDistribution[];
  statusDistribution: StatusDistribution[];
  projectProgress: ProjectProgress[];
  recentActivity: RecentActivity[];
  outputDocuments: DashboardOutputDocuments;
  saWorkload: DashboardSaWorkload[];
  headSaProjectValues: DashboardHeadSaProjectValues | null;
  salesResults: {
    totalEstimatedRevenue: number;
    finalContractValueTotal: number;
    waitingResult: { count: number; estimatedRevenue: number };
    won: { count: number; estimatedRevenue: number };
    lost: { count: number; estimatedRevenue: number };
  } | null;
}
