import { supabaseAdmin } from '../config/supabase';
import { getMandatoryDocumentKeys, getScenarioDocuments } from '../constants/scenarios';

export type PhaseActor = { userId: string; role: string; fullName: string };
export class PhaseDecisionError extends Error {
  constructor(message: string, readonly statusCode: number) { super(message); }
}
export function projectPhaseName(value?: { phase_key: string } | { phase_key: string }[] | null) {
  const phase = Array.isArray(value) ? value[0] : value;
  return phase?.phase_key === 'PRA_TENDER' ? 'Pra-Tender' : phase?.phase_key === 'ON_SUBMISSION_TENDER' ? 'On Submission Tender' : null;
}
export function activePhaseProject<T extends { scenario_id: string; current_scenario_id?: string | null }>(project: T): T {
  return { ...project, scenario_id: project.current_scenario_id || project.scenario_id };
}
export function phaseRows<T extends { phase_id?: string | null }>(rows: T[], phaseId?: string | null): T[] {
  return phaseId ? rows.filter((row) => row.phase_id === phaseId) : rows;
}
export function assertCanContinuePhase(project: any, actor: PhaseActor): void {
  if (actor.role !== 'SALES' || project.sales_id !== actor.userId) throw new Error('Forbidden');
  if (project.is_postponed || !['ACTIVE', 'DRAFT'].includes(project.status)) throw new Error('Project is not active.');
  if (!project.active_phase_id) throw new Error('Legacy phase classification requires manual review.');
}
export class ProjectPhaseService {
  static async continue(projectId: string, selectedKeys: string[], actor: PhaseActor) {
    const { data: project, error } = await supabaseAdmin.from('projects')
      .select('id,sales_id,status,is_postponed,active_phase_id').eq('id', projectId).single();
    if (error || !project) throw new Error('Project not found');
    assertCanContinuePhase(project, actor);
    const allowed = new Set(getScenarioDocuments('ON_SUBMISSION_TENDER').map((item) => item.key));
    if (selectedKeys.some((key) => !allowed.has(key))) throw new Error('Invalid phase output selection.');
    const keys = [...new Set([...selectedKeys, ...getMandatoryDocumentKeys('ON_SUBMISSION_TENDER')])];
    const { data, error: transitionError } = await supabaseAdmin.rpc('continue_project_tender_phase', {
      p_project_id: projectId, p_sales_id: actor.userId, p_selected_keys: keys,
    });
    if (transitionError) {
      if (transitionError.code === '40001') throw new PhaseDecisionError('Pra-Tender decision conflicts with the saved decision.', 409);
      const safe = new Set(['Forbidden', 'Project is not active.', 'Pra-Tender is not completed.',
        'Legacy phase classification requires manual review.', 'Invalid phase output selection.']);
      throw new Error(safe.has(transitionError.message) ? transitionError.message : 'Unable to create the next phase. Please refresh and try again.');
    }
    return Array.isArray(data) ? data[0] : data;
  }

  static async closePraTender(projectId: string, actor: PhaseActor) {
    const { data: project, error } = await supabaseAdmin.from('projects')
      .select('id,sales_id,status,is_postponed,active_phase_id').eq('id', projectId).single();
    if (error || !project) throw new Error('Project not found');
    if (actor.role !== 'SALES' || project.sales_id !== actor.userId) throw new Error('Forbidden');
    if (project.is_postponed || !['ACTIVE', 'DRAFT', 'COMPLETED'].includes(project.status)) throw new Error('Project is not active.');
    if (!project.active_phase_id) throw new Error('Legacy phase classification requires manual review.');
    // COMPLETED is allowed here only for replay; the RPC checks the saved No decision.
    const { data, error: decisionError } = await supabaseAdmin.rpc('close_project_at_pra_tender', {
      p_project_id: projectId, p_sales_id: actor.userId,
    });
    if (decisionError) {
      if (decisionError.code === '40001') throw new PhaseDecisionError('Pra-Tender decision conflicts with the saved decision.', 409);
      const safe = new Set(['Forbidden', 'Project is not active.', 'Pra-Tender is not completed.', 'Legacy phase classification requires manual review.']);
      throw new Error(safe.has(decisionError.message) ? decisionError.message : 'Unable to save the Pra-Tender decision.');
    }
    return Array.isArray(data) ? data[0] : data;
  }
}
