export type ApprovalCategory = "ALL" | "DEADLINE" | "MILESTONE" | "DOCUMENT";
export type ApprovalStatus = "ALL" | "PENDING" | "APPROVED" | "REJECTED";

export interface ApprovalItem {
  id: string;
  category: "DEADLINE" | "MILESTONE" | "DOCUMENT";
  title: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
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
}

export interface ApprovalStats {
  totalPending: number;
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
