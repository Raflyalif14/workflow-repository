export type ScenarioRole = "SUPER_ADMIN" | "SALES" | "HEAD_SA" | "SA";
export type ScenarioKey = "PRA_TENDER" | "ON_SUBMISSION_TENDER";

export type OutputDocumentStatus =
  | "NOT_REQUIRED"
  | "TO_DO"
  | "DRAFT"
  | "IN_REVIEW"
  | "REVISION_REQUIRED"
  | "APPROVED";

export interface ScenarioDocumentDefinition {
  key: string;
  name: string;
  isRequired: boolean;
  description?: string;
}

export interface ScenarioDefinition {
  key: ScenarioKey;
  name: string;
  label: string;
  description: string;
  documents: ScenarioDocumentDefinition[];
}

export interface WorkflowStage {
  id: string;
  scenario_id: string;
  name: string;
  description?: string | null;
  step_order: number;
  default_role: ScenarioRole;
  default_duration_working_days: number;
  is_required: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Scenario {
  id: string;
  name: string;
  description?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  total_steps: number;
  workflow_model?: string | null;
  workflow_version?: number | null;
  slaWorkingDays?: number;
  stages?: WorkflowStage[];
}

export interface WorkflowResponse {
  scenario: Pick<Scenario, "id" | "name">;
  stages: WorkflowStage[];
}
