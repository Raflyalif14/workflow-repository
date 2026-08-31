export type ApprovalCategory = "ALL" | "PROJECT_PLAN" | "DEADLINE" | "SUBMISSION";
export type ApprovalStatus = "ALL" | "PENDING" | "APPROVED" | "REJECTED" | "SUPERSEDED";

export interface ApprovalItem {
  id: string;
  category: "PROJECT_PLAN" | "DEADLINE" | "SUBMISSION";
  title: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "SUPERSEDED";
  isCurrentApproval?: boolean;
  projectId: string;
  projectName: string;
  projectCode: string;
  clientName: string;
  targetEntityId: string;
  documentId?: string;
  submittedBy: string;
  submittedAt: string;
  deadline?: string;
  details?: string;
  feedback?: string | null;
  approvedAt?: string | null;
  approverName?: string | null;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  changelog?: string;
  milestoneId?: string;
  milestoneName?: string;
  stepOrder?: number;
  stageDefaultRole?: string | null;
  requester?: {
    id: string;
    full_name?: string;
    fullName?: string;
    email?: string;
  } | null;
  reviewer?: {
    id: string;
    full_name?: string;
    fullName?: string;
    email?: string;
  } | null;
  pic?: {
    id: string;
    full_name?: string;
    fullName?: string;
    email?: string;
  } | null;
  requestedAt: string;
  requestNote?: string | null;
  reviewNote?: string | null;
  submissionNote?: string | null;
  currentDeadline?: {
    start_date?: string | null;
    duration_working_days?: number | null;
    due_date?: string | null;
  };
  proposedDeadline?: {
    start_date: string;
    duration_working_days: number;
    due_date: string;
    change_reason?: string | null;
  } | null;
}

export interface ApprovalStats {
  totalPending: number;
  pendingProjectPlans: number;
  pendingSubmissions: number;
  pendingMilestones: number;
  pendingDocs: number;
  pendingDeadlines: number;
}

export interface ApprovalFilters {
  type?: ApprovalCategory;
  status?: ApprovalStatus;
  projectId?: string;
  search?: string;
}
