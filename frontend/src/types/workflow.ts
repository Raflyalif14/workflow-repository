export type Role =
  | "SUPER_ADMIN"
  | "SALES"
  | "HEAD_SOLUTION_ARCHITECT"
  | "SOLUTION_ARCHITECT";

export type WorkflowStatus = "DRAFT" | "ACTIVE" | "DEPRECATED" | "ARCHIVED";

export type TriggerType =
  | "MANUAL"
  | "SCHEDULED"
  | "WEBHOOK"
  | "EVENT_DRIVEN"
  | "PIPELINE_TRIGGER";

export interface User {
  id: string;
  email: string;
  username: string;
  fullName?: string;
  avatarUrl?: string;
  role: Role;
}

export interface Repository {
  id: string;
  name: string;
  slug: string;
  description?: string;
}

export interface WorkflowVersion {
  id: string;
  workflowId: string;
  versionNumber: string;
  changelog?: string;
  triggerType: TriggerType;
  definitionJson: Record<string, any>;
  isLatest: boolean;
  createdAt: string;
}

export interface Workflow {
  id: string;
  name: string;
  slug: string;
  description?: string;
  category?: string;
  tags: string[];
  status: WorkflowStatus;
  repositoryId: string;
  repository?: Repository;
  authorId: string;
  author?: User;
  versions?: WorkflowVersion[];
  createdAt: string;
  updatedAt: string;
}
