export type ProjectStatus =
  | "DRAFT"
  | "ACTIVE"
  | "POSTPONED"
  | "IN_PROGRESS"
  | "ON_HOLD"
  | "COMPLETED"
  | "CANCELLED";

export type MilestoneStatus =
  | "CREATED"
  | "NOT_STARTED"
  | "PENDING"
  | "TRIGGERED"
  | "IN_PROGRESS"
  | "SUBMITTED"
  | "APPROVAL"
  | "WAITING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "COMPLETED"
  | "OVERDUE";

export interface ProjectMilestonePhase4 {
  id: string;
  project_id: string;
  workflow_stage_id: string;
  name: string;
  description?: string | null;
  step_order: number;
  status: MilestoneStatus;
  pic_id?: string | null;
  pic?: { id: string; full_name?: string; fullName?: string; email: string; role: string } | null;
  workflow_stage?: { id: string; default_role: string } | null;
  start_date?: string | null;
  duration_working_days?: number | null;
  due_date?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export type DeadlineApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "SUPERSEDED";
export type ProjectPlanApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";
export type InitiationApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";
export type MilestoneSubmissionApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface UserSummarySnake {
  id: string;
  full_name: string;
  fullName?: string;
  email: string;
}

export interface MilestoneDeadlineApproval {
  id: string;
  milestone_id: string;
  deadline_history_id: string;
  status: DeadlineApprovalStatus;
  requested_by: UserSummarySnake | null;
  reviewed_by: UserSummarySnake | null;
  review_note: string | null;
  requested_at: string;
  reviewed_at: string | null;
  deadline: {
    start_date: string;
    duration_working_days: number;
    due_date: string;
    change_reason: string | null;
  } | null;
}

export interface ProjectPlanApproval {
  id: string;
  project_id: string;
  project?: {
    id: string;
    name: string;
    customer: string;
    status: ProjectStatus;
  } | null;
  status: ProjectPlanApprovalStatus;
  requested_by: UserSummarySnake | null;
  request_note: string | null;
  reviewed_by: UserSummarySnake | null;
  review_note: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MilestoneInitiationApproval {
  id: string;
  milestone_id: string;
  status: InitiationApprovalStatus;
  requested_by: UserSummarySnake | null;
  reviewed_by: UserSummarySnake | null;
  request_note: string | null;
  review_note: string | null;
  requested_at: string;
  reviewed_at: string | null;
}

export interface MilestoneSubmissionApproval {
  id: string;
  status: MilestoneSubmissionApprovalStatus;
  submission_note: string | null;
  submitted_by: UserSummarySnake | null;
  submitted_at: string;
  review_note: string | null;
  reviewed_by: UserSummarySnake | null;
  reviewed_at: string | null;
}

export interface WorkflowStage {
  id: string;
  name: string;
  orderIndex: number;
  defaultDurationDays: number;
  requiresApproval: boolean;
}

export interface Scenario {
  id: string;
  name: string;
  code?: string;
  description?: string;
  slaWorkingDays?: number;
  workflowTemplate?: {
    name: string;
    code: string;
  };
  stages?: WorkflowStage[];
}

export interface UserSummary {
  id: string;
  fullName: string;
  full_name?: string;
  email: string;
  username?: string;
  phoneNumber?: string;
  role?: string;
}

export interface ProjectMilestone {
  id: string;
  projectId: string;
  workflowStageId?: string;
  name: string;
  orderIndex: number;
  status: MilestoneStatus;
  startDate?: string | null;
  deadline: string;
  actualEndDate?: string | null;
  notes?: string | null;
  pic: UserSummary;
}

export interface ActivityLog {
  id: string;
  userId?: string;
  action: string;
  entityType: string;
  entityId: string;
  description?: string;
  details?: string;
  createdAt: string;
  user?: {
    id: string;
    fullName: string;
    role: string;
  };
}

export interface Project {
  id: string;
  projectCode?: string;
  name: string;
  customer: string;
  clientName?: string;
  scenario_id?: string;
  description?: string;
  scenarioId?: string;
  scenario?: Scenario;
  sales?: UserSummary | null;
  sales_id?: string;
  salesPIC?: UserSummary;
  pic?: UserSummary | null;
  headSaPIC?: UserSummary | null;
  createdBy?: UserSummary;
  status: ProjectStatus;
  startDate?: string;
  targetEndDate?: string;
  actualEndDate?: string | null;
  postponeReason?: string | null;
  milestones?: ProjectMilestone[];
  activityLogs?: ActivityLog[];
  activity_logs?: Array<{ id: string; user_id?: string; action: string; description?: string; details?: string; created_at: string }>;
  totalMilestones?: number;
  completedMilestones?: number;
  progress?: number;
  currentStage?: string | null;
  currentRole?: string | null;
  is_postponed?: boolean;
  postponed_at?: string | null;
  postpone_reason?: string | null;
  created_at?: string;
  updated_at?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectsResponse {
  projects: Project[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export interface ProjectFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: ProjectStatus | "ALL";
  scenarioId?: string;
  salesId?: string;
}
