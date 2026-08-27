import { supabaseAdmin } from '../config/supabase';
import { CreateScenarioInput, UpdateScenarioInput, CreateStageInput, UpdateStageInput } from '../validators/scenario.validator';

const mapScenario = (row: any) => ({ id: row.id, name: row.name, description: row.description, is_active: row.is_active, created_at: row.created_at, updated_at: row.updated_at, total_steps: row.workflow_stages?.[0]?.count ?? row.total_steps ?? 0 });
const mapStage = (row: any) => ({ id: row.id, scenario_id: row.scenario_id, name: row.name, description: row.description, step_order: row.step_order, default_role: row.default_role, default_duration_working_days: row.default_duration_working_days, is_required: row.is_required, is_active: row.is_active, created_at: row.created_at, updated_at: row.updated_at });
const logActivity = async (userId: string | undefined, action: string, entityType: string, entityId: string, details: string) => {
  if (!userId) return;
  try { await supabaseAdmin.from('activity_logs').insert({ user_id: userId, action, entity_type: entityType, entity_id: entityId, details }); } catch { return; }
};

export class ScenarioService {
  static async list(query: { is_active?: string; search?: string }) {
    let request: any = supabaseAdmin.from('scenarios').select('*, workflow_stages(count)').order('created_at', { ascending: false });
    if (query.is_active !== undefined) request = request.eq('is_active', query.is_active === 'true');
    if (query.search) request = request.ilike('name', `%${query.search}%`);
    const { data, error } = await request;
    if (error) throw new Error(error.message);
    return (data || []).map(mapScenario);
  }

  static async get(id: string) {
    const { data, error } = await supabaseAdmin.from('scenarios').select('*, workflow_stages(*)').eq('id', id).single();
    if (error || !data) throw new Error('Scenario not found');
    return { ...mapScenario(data), stages: (data.workflow_stages || []).sort((a: any, b: any) => a.step_order - b.step_order).map(mapStage) };
  }

  static async create(input: CreateScenarioInput, userId?: string) {
    const { data, error } = await supabaseAdmin.from('scenarios').insert({ name: input.name, description: input.description || null }).select().single();
    if (error) throw new Error(error.code === '23505' ? 'Scenario name already exists' : error.message);
    await logActivity(userId, 'CREATE', 'SCENARIO', data.id, `Scenario created: ${data.name}`);
    return mapScenario(data);
  }

  static async update(id: string, input: UpdateScenarioInput, userId?: string) {
    const { data, error } = await supabaseAdmin.from('scenarios').update({ ...input }).eq('id', id).select().single();
    if (error || !data) throw new Error(error?.code === '23505' ? 'Scenario name already exists' : 'Scenario not found');
    await logActivity(userId, 'UPDATE', 'SCENARIO', id, `Scenario updated: ${data.name}`);
    return mapScenario(data);
  }

  static async updateStatus(id: string, is_active: boolean, userId?: string) {
    const { data, error } = await supabaseAdmin.from('scenarios').update({ is_active }).eq('id', id).select().single();
    if (error || !data) throw new Error('Scenario not found');
    await logActivity(userId, is_active ? 'UPDATE' : 'CHANGE_STATUS', 'SCENARIO', id, `Scenario ${is_active ? 'activated' : 'deactivated'}`);
    return mapScenario(data);
  }

  static async workflow(scenarioId: string) {
    const scenario = await this.get(scenarioId);
    return { scenario: { id: scenario.id, name: scenario.name }, stages: scenario.stages };
  }

  static async createStage(scenarioId: string, input: CreateStageInput, userId?: string) {
    const { data: scenario } = await supabaseAdmin.from('scenarios').select('id').eq('id', scenarioId).single();
    if (!scenario) throw new Error('Scenario not found');
    let stepOrder = input.step_order;
    if (!stepOrder) {
      const { data: last } = await supabaseAdmin.from('workflow_stages').select('step_order').eq('scenario_id', scenarioId).order('step_order', { ascending: false }).limit(1).maybeSingle();
      stepOrder = (last?.step_order || 0) + 1;
    }
    const { data, error } = await supabaseAdmin.from('workflow_stages').insert({ scenario_id: scenarioId, ...input, step_order: stepOrder }).select().single();
    if (error) throw new Error(error.code === '23505' ? 'Step order already exists' : error.message);
    await logActivity(userId, 'CREATE', 'WORKFLOW_STAGE', data.id, `Workflow stage created: ${data.name}`);
    return mapStage(data);
  }

  static async updateStage(id: string, input: UpdateStageInput, userId?: string) {
    const { data, error } = await supabaseAdmin.from('workflow_stages').update(input).eq('id', id).select().single();
    if (error || !data) throw new Error('Workflow stage not found');
    await logActivity(userId, 'UPDATE', 'WORKFLOW_STAGE', id, `Workflow stage updated: ${data.name}`);
    return mapStage(data);
  }

  static async deleteStage(id: string, userId?: string) {
    return this.updateStage(id, { is_active: false }, userId);
  }

  static async reorder(scenarioId: string, stages: { id: string; step_order: number }[], userId?: string) {
    const orders = stages.map((stage) => stage.step_order);
    if (new Set(orders).size !== orders.length) throw new Error('Duplicate step_order values are not allowed');
    const { data: existing, error } = await supabaseAdmin.from('workflow_stages').select('id').eq('scenario_id', scenarioId);
    if (error || !existing || existing.length !== stages.length || stages.some((stage) => !existing.some((row) => row.id === stage.id))) throw new Error('All stages must belong to the scenario');
    for (const stage of stages) {
      const { error: temporaryError } = await supabaseAdmin.from('workflow_stages').update({ step_order: -stage.step_order }).eq('id', stage.id);
      if (temporaryError) throw new Error(temporaryError.message);
    }
    for (const stage of stages) {
      const { error: updateError } = await supabaseAdmin.from('workflow_stages').update({ step_order: stage.step_order }).eq('id', stage.id);
      if (updateError) throw new Error(updateError.message);
    }
    await logActivity(userId, 'UPDATE', 'SCENARIO', scenarioId, 'Workflow reordered');
    return this.workflow(scenarioId);
  }
}
