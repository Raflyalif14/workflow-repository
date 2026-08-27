export type DocumentStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "SUPERSEDED";

export type DocumentCategory =
  | "PROPOSAL"
  | "ARCHITECTURE_DESIGN"
  | "SIZING_SHEET"
  | "MOM"
  | "ASSESSMENT_REPORT"
  | "BOQ"
  | "DELIVERABLE"
  | "OTHER";

export interface DocumentUser {
  id: string;
  fullName: string;
  role: string;
  avatarUrl?: string | null;
}

export interface DocumentApproval {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "REVISED";
  actionRole: string;
  feedback?: string | null;
  approvedAt?: string | null;
  approver?: DocumentUser | null;
}

export interface DocumentVersion {
  id: string;
  documentId: string;
  versionNumber: number;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  changelog?: string | null;
  status: DocumentStatus;
  isLatest: boolean;
  uploadedBy: DocumentUser;
  approvals?: DocumentApproval[];
  createdAt: string;
}

export interface DocumentComment {
  id: string;
  documentId: string;
  content: string;
  createdAt: string;
  author: DocumentUser;
}

export interface DocumentItem {
  id: string;
  projectId: string;
  milestoneId?: string | null;
  title: string;
  category: DocumentCategory;
  status: DocumentStatus;
  createdAt: string;
  updatedAt: string;
  project?: {
    id: string;
    name: string;
    projectCode: string;
    clientName: string;
  };
  milestone?: {
    id: string;
    name: string;
    orderIndex: number;
  } | null;
  versions: DocumentVersion[];
  comments?: DocumentComment[];
  _count?: {
    versions: number;
    comments: number;
  };
}

export interface DocumentFilters {
  projectId?: string;
  milestoneId?: string;
  category?: DocumentCategory | "ALL";
  status?: DocumentStatus | "ALL";
  search?: string;
}
