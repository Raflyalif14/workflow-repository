export const projectKeys = {
  all: () => ["projects"] as const,
  list: (filters?: unknown) => ["projects", filters ?? "all"] as const,
  detail: (projectId: string) => ["project", projectId] as const,
  milestones: (projectId: string) => ["project-milestones", projectId] as const,
  progress: (projectId: string) => ["project-progress", projectId] as const,
  planApproval: (projectId: string) => ["project-plan-approval", projectId] as const,
  planApprovalHistory: (projectId: string) => ["project-plan-approval-history", projectId] as const,
  assignmentHistory: (projectId: string) => ["assignment-history", projectId] as const,
};

export const milestoneKeys = {
  workflowState: (milestoneId: string) => ["milestone-workflow-state", milestoneId] as const,
  deadlineStatus: (milestoneId: string) => ["milestone-deadline-status", milestoneId] as const,
  submissionApprovalHistory: (milestoneId: string) => ["milestone-submission-approval-history", milestoneId] as const,
  submissionPackage: (milestoneId: string) => ["milestone-submission-package", milestoneId] as const,
  contributions: (milestoneId: string) => ["milestone-contributions", milestoneId] as const,
};

export const approvalKeys = {
  all: () => ["approvals"] as const,
  list: (filters?: unknown) => ["approvals", filters ?? "all"] as const,
  stats: () => ["approval-stats"] as const,
};

export const assignmentKeys = {
  eligibleSas: () => ["eligible-sas"] as const,
  myAssignedProjects: () => ["my-assigned-projects"] as const,
  myAssignedMilestones: () => ["my-assigned-milestones"] as const,
  solutionArchitects: () => ["solution-architects"] as const,
};

export const dashboardKeys = {
  overview: () => ["dashboard", "overview"] as const,
};

export const notificationKeys = {
  all: () => ["notifications"] as const,
  list: () => ["notifications", "list"] as const,
  unreadCount: () => ["notifications", "unread-count"] as const,
  preferences: () => ["notifications", "preferences"] as const,
  deliveryHealth: () => ["notifications", "admin", "telegram-delivery-health"] as const,
};
