import { supabaseAdmin } from '../config/supabase';
import {
  completeMilestoneStage,
  isMilestoneCompletedLike,
} from './workflow-progression.service';
import { ProjectOutcomeInput } from '../validators/project-management.validator';
import { getMandatoryDocumentKeys, getScenarioDocuments, resolveScenarioKey } from '../constants/scenarios';

type Actor = { userId: string; role: string; fullName: string };
type MilestoneInput = {
  project_id: string;
  workflow_stage_id: string;
  name: string;
  description: string | null;
  step_order: number;
  status: 'CREATED' | 'IN_PROGRESS' | 'COMPLETED';
  completed_at?: string | null;
};
type WorkflowStageMilestoneSource = { id: string; name: string; description: string | null; step_order: number; stage_key?: string | null; default_role?: string | null };
export type ScenarioWorkflowConfiguration = {
  workflow_model: string;
  workflow_version: number;
};
type SupportedWorkflowInitializationMode = 'LEGACY' | 'OPERATIONAL_V2';
export const selectMilestones = 'id, project_id, workflow_stage_id, name, description, step_order, status, pic_id, start_date, duration_working_days, due_date, completed_at, pic:users!project_milestones_pic_id_fkey(id,full_name,email,role), workflow_stage:workflow_stages!project_milestones_workflow_stage_id_fkey(id,default_role), created_at, updated_at';
export const INITIAL_MILESTONE_STATUS = 'CREATED' as const;

export class MilestoneInitializationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MilestoneInitializationError';
  }
}

export function resolveWorkflowInitializationMode(
  scenario: ScenarioWorkflowConfiguration
): SupportedWorkflowInitializationMode {
  if (scenario.workflow_model === 'LEGACY' && scenario.workflow_version === 1) {
    return 'LEGACY';
  }
  if (scenario.workflow_model === 'OPERATIONAL_V2' && scenario.workflow_version === 2) {
    return 'OPERATIONAL_V2';
  }

  throw new MilestoneInitializationError('Unsupported scenario workflow model/version.');
}

export function buildInitialMilestoneRows(
  projectId: string,
  stages: WorkflowStageMilestoneSource[],
  createdAt = new Date().toISOString(),
  scenario: ScenarioWorkflowConfiguration = { workflow_model: 'LEGACY', workflow_version: 1 },
  selectedStageKeys?: ReadonlySet<string>
): MilestoneInput[] {
  const initializationMode = resolveWorkflowInitializationMode(scenario);
  const includedStages = selectedStageKeys
    ? stages.filter((stage) => stage.default_role === 'SALES'
      || (stage.default_role === 'SA' && Boolean(stage.stage_key && selectedStageKeys.has(stage.stage_key))))
    : stages;

  return includedStages.map((stage, index) => {
    const status = initializationMode === 'OPERATIONAL_V2'
      ? INITIAL_MILESTONE_STATUS
      : index === 0
        ? 'COMPLETED'
        : index === 1
          ? 'IN_PROGRESS'
          : INITIAL_MILESTONE_STATUS;

    return {
      project_id: projectId,
      workflow_stage_id: stage.id,
      name: stage.name,
      description: stage.description,
      step_order: index + 1,
      status,
      ...(status === 'COMPLETED' ? { completed_at: createdAt } : {}),
    };
  });
}

export function calculateMilestoneProgress(milestones: Array<{ status: string }>) {
  const completed = milestones.filter((item) => isMilestoneCompletedLike(item.status)).length;
  return {
    completed,
    total: milestones.length,
    percentage: milestones.length ? Math.round((completed / milestones.length) * 100) : 0,
  };
}

export class MilestoneService {
  static async getProject(projectId: string, actor: Actor) {
    const { data, error } = await supabaseAdmin.from('projects').select('id, name, sales_id, pic_id, scenario_id, selected_document_keys').eq('id', projectId).single();
    if (error || !data || (actor.role === 'SALES' && data.sales_id !== actor.userId) || (actor.role === 'SA' && data.pic_id !== actor.userId)) throw new Error('Project not found');
    return data;
  }

  static async list(projectId: string, actor: Actor) {
    await this.getProject(projectId, actor);
    const { data, error } = await supabaseAdmin.from('project_milestones').select(selectMilestones).eq('project_id', projectId).order('step_order', { ascending: true });
    if (error) throw new Error(error.message);
    return data || [];
  }

  static async progress(projectId: string, actor: Actor) {
    const milestones = await this.list(projectId, actor);
    return calculateMilestoneProgress(milestones);
  }

  static async initialize(projectId: string, actor: Actor) {
    const project = await this.getProject(projectId, actor);
    const { count, error: countError } = await supabaseAdmin.from('project_milestones').select('id', { count: 'exact', head: true }).eq('project_id', projectId);
    if (countError) throw new Error(countError.message);
    if ((count || 0) > 0) throw new Error('Workflow has already been initialized for this project.');

    const { data: scenario, error: scenarioError } = await supabaseAdmin
      .from('scenarios')
      .select('workflow_model, workflow_version')
      .eq('id', project.scenario_id)
      .single();
    if (scenarioError || !scenario) throw new MilestoneInitializationError('Project scenario not found.');

    const { data: stages, error: stageError } = await supabaseAdmin.from('workflow_stages').select('id, name, description, step_order, stage_key, default_role').eq('scenario_id', project.scenario_id).eq('is_active', true).order('step_order', { ascending: true });
    if (stageError) throw new Error(stageError.message);
    if (!stages?.length) throw new Error('No active workflow stages found for this scenario.');
    const { data: scenarioIdentity, error: identityError } = await supabaseAdmin.from('scenarios').select('name').eq('id', project.scenario_id).single();
    if (identityError || !scenarioIdentity) throw new MilestoneInitializationError('Project scenario not found.');
    const scenarioKey = resolveScenarioKey(scenarioIdentity.name);
    const selectedKeys = new Set([...(project.selected_document_keys || []), ...getMandatoryDocumentKeys(scenarioKey)]);
    const selectedStageKeys = new Set(getScenarioDocuments(scenarioKey)
      .filter((definition) => selectedKeys.has(definition.key)).map((definition) => definition.stageKey));
    if (scenario.workflow_model === 'OPERATIONAL_V2'
      && (stages.some((stage) => !stage.stage_key || !['SA', 'SALES'].includes(stage.default_role || ''))
        || selectedStageKeys.size === 0 || stages.filter((stage) => stage.default_role === 'SALES').length !== 1
        || [...selectedStageKeys].some((stageKey) => !stages.some((stage) => stage.stage_key === stageKey && stage.default_role === 'SA')))) {
      throw new MilestoneInitializationError('Selected outputs do not match the project workflow stages.');
    }
    const rows = buildInitialMilestoneRows(projectId, stages, new Date().toISOString(), scenario,
      scenario.workflow_model === 'OPERATIONAL_V2' ? selectedStageKeys : undefined);
    const { data, error } = await supabaseAdmin.from('project_milestones').insert(rows).select(selectMilestones).order('step_order', { ascending: true });
    if (error || !data || data.length !== rows.length) {
      await supabaseAdmin.from('project_milestones').delete().eq('project_id', projectId);
      throw new Error(error?.message || 'Workflow initialization failed; no milestones were retained.');
    }
    return data;
  }

  static completeStage(milestoneId: string, actor: Actor, outcome?: ProjectOutcomeInput) {
    return completeMilestoneStage(milestoneId, actor, outcome);
  }

}
