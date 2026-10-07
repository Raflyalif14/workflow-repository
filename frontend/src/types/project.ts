export type ProjectStatus =
  | "DRAFT"
  | "ACTIVE"
  | "POSTPONED"
  | "IN_PROGRESS"
  | "ON_HOLD"
  | "COMPLETED"
  | "CANCELLED"
  | "WAITING_RESULT"
  | "WON"
  | "LOST";

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
  phase_id?: string | null;
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
  phase_id?: string | null;
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

export interface MilestoneContributionAttachment {
  id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  promotion_status: "NOT_PROMOTED" | "PROMOTING" | "PROMOTED";
  promoted_document_id: string | null;
  created_at: string;
}

export interface MilestoneContribution {
  id: string;
  milestone_id: string;
  note: string | null;
  contributed_by: { id: string; full_name: string; role?: string } | null;
  created_at: string;
  attachments: MilestoneContributionAttachment[];
}

export interface MilestoneContributionAttachmentDownload {
  attachment_id: string;
  file_name: string;
  url: string;
  expires_in_seconds: number;
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
  workflow_model?: string;
  workflow_version?: number;
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

export interface ProjectActivityTimelineItem {
  businessChange?: { objectKey?: string; objectType: string; objectId: string; changedFields: string[];
    before: Record<string, unknown>; after: Record<string, unknown> };
  picAssignmentChange?: { before: { id: string; name: string } | null; after: { id: string; name: string } | null };
  estimatedValueChange?: { before: string | null; after: string };
  id: string;
  action: string;
  description: string | null;
  createdAt: string;
  actor: {
    id: string;
    name: string;
    role: string;
  } | null;
}

export interface ProjectActivityPage {
  items: ProjectActivityTimelineItem[];
  nextCursor: string | null;
}

export interface ProjectPhase {
  id: string;
  project_id: string;
  scenario_id: string;
  phase_key: "PRA_TENDER" | "ON_SUBMISSION_TENDER";
  sales_decision?: "CONTINUE_TENDER" | "CLOSE_PRA_TENDER" | null;
  sales_decided_by?: string | null;
  sales_decided_at?: string | null;
  status: "DRAFT" | "ACTIVE" | "COMPLETED";
  selected_document_keys: string[];
  pic_id?: string | null;
  completed_at?: string | null;
}

export interface Project {
  pic_revision?: string;
  active_phase_id?: string | null;
  current_scenario_id?: string | null;
  active_scenario?: Scenario | null;
  phases?: ProjectPhase[];
  phase_migration_state?: "READY" | "LEGACY_REVIEW";
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
  currentMilestone?: {
    id: string;
    name: string;
    step_order: number;
    status: MilestoneStatus;
    default_role: string | null;
    start_date?: string | null;
    due_date?: string | null;
  } | null;
  selected_document_keys?: string[];
  selectedDocumentKeys?: string[];
  estimated_revenue?: number | null;
  estimated_revenue_exact?: string | null;
  final_contract_value?: number | null;
  loss_reason?: string | null;
  outcome_decided_by?: string | null;
  outcome_decided_at?: string | null;
  output_documents?: ProjectOutputDocumentItem[];
  is_postponed?: boolean;
  postponed_at?: string | null;
  postpone_reason?: string | null;
  created_at?: string;
  updated_at?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectOutputDocumentItem {
  id: string;
  projectId: string;
  key: string;
  milestoneId: string;
  name: string;
  group: "PRA_TENDER" | "ON_SUBMISSION_TENDER";
  isRequired: boolean;
  isSelected: boolean;
  status: "NOT_REQUIRED" | "TO_DO" | "DRAFT" | "IN_REVIEW" | "REVISION_REQUIRED" | "APPROVED";
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  uploadedAt?: string | null;
  uploadedBy?: { id: string; fullName: string; role: string } | null;
  downloadUrl?: string | null;
  reviewedAt?: string | null;
  reviewedBy?: { id: string; fullName: string; role: string } | null;
  reviewFeedback?: string | null;
  fileRevisions?: { fileId: string; feedback: string }[];
  currentVersionId?: string | null;
  currentVersionNumber?: number | null;
  versionCount?: number;
  legacyVersionCount?: number;
  draftRevision?: number;
  draftFiles?: ProjectOutputDocumentFile[];
  files?: ProjectOutputDocumentFile[];
}

export interface ProjectOutputDocumentFile {
  id: string;
  fileName: string;
  fileSize?: number | null;
  mimeType?: string | null;
  uploadedAt?: string | null;
  uploadedBy?: { id: string; fullName: string; role: string } | null;
}

export interface ProjectOutputDocumentVersion {
  id: string;
  versionNumber: number;
  status: "DRAFT" | "IN_REVIEW" | "REVISION_REQUIRED" | "APPROVED";
  fileName: string;
  fileSize?: number | null;
  mimeType?: string | null;
  uploadedAt: string;
  uploadedBy?: { id: string; fullName: string; role: string } | null;
  submittedAt?: string | null;
  submissionNote?: string | null;
  reviewedAt?: string | null;
  reviewedBy?: { id: string; fullName: string; role: string } | null;
  reviewFeedback?: string | null;
  fileRevisions?: { fileId: string; feedback: string }[];
  files?: ProjectOutputDocumentFile[];
  versionKind?: "SUBMITTED" | "LEGACY_SUBMITTED" | "LEGACY_UPLOAD_UNCONFIRMED";
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

export interface ProjectDeletionPreview {
  project_id: string;
  project_name: string;
  scenario: { id: string; name: string } | null;
  status: ProjectStatus;
  milestone_count: number;
  document_count: number;
  document_version_count: number;
  project_output_document_count: number;
  project_output_document_version_count: number;
  milestone_contribution_count: number;
  milestone_contribution_attachment_count: number;
  project_intake_attachment_count: number;
  approvals: { deadline: number; deadline_history: number; project_plan: number; document_version: number };
  assignment_count: number;
  activity_log_count: number;
  notification_count: number;
  notification_delivery_count: number;
  document_comment_count: number;
  storage_object_count: number;
}

export interface ProjectDeletionResult {
  project_id: string;
  cleanup: { id: string; status: "PENDING" | "COMPLETED" | "FAILED"; storage_object_count: number };
}
