import { mutateBusiness, BusinessRequestContext } from './business-audit.service';
import { phaseRows } from './project-phase.service';
import { ProjectCreationService, projectCreationRequestId, ProjectCreationRequestError } from './project-creation.service';
import { ProjectIntakeService } from './project-intake.service';
import path from 'path';
import { supabaseAdmin } from '../config/supabase';
import {
  isAllowedDocumentFileName,
  MAX_DOCUMENT_FILE_SIZE_BYTES,
} from '../utils/storage.util';
import { CreateProjectManagementInput, ProjectOutcomeInput, ProjectQuery, UpdateProjectManagementInput } from '../validators/project-management.validator';
import { MilestoneService, resolveWorkflowInitializationMode } from './milestone.service';
import { applyProjectAccessScope, canAccessProject } from './project-access.service';
import { RequestTiming, timeOperation } from '../utils/request-timing';

type Actor = { userId: string; role: string; fullName: string };
type ResumeProjectState = { status: string; is_postponed: boolean | null };
type ProjectOutcomeState = { sales_id: string | null; status: string };
export const MAX_PROJECT_CREATION_OPTIONAL_DOCUMENTS = 10;
export const MAX_PROJECT_CREATION_PHOTOS = 10;

export type ProjectCreationFiles = {
  mom: Express.Multer.File[];
  photos: Express.Multer.File[];
  documents: Express.Multer.File[];
};

export class ProjectCreationError extends Error {

  constructor(message: string, readonly statusCode = 400) {

    super(message);

    this.name = 'ProjectCreationError';

  }

}



export function validateProjectCreationFiles(files: ProjectCreationFiles): void {
  if (files.mom.length !== 1) {
    throw new ProjectCreationError('Exactly one MoM file is required to create a project.', 400);
  }
  if (!files.photos.length) {
    throw new ProjectCreationError('At least one project photo is required to create a project.', 400);
  }
  if (files.photos.length > MAX_PROJECT_CREATION_PHOTOS) {
    throw new ProjectCreationError(
      `A maximum of ${MAX_PROJECT_CREATION_PHOTOS} project photos may be uploaded.`,
      400
    );
  }
  if (files.documents.length > MAX_PROJECT_CREATION_OPTIONAL_DOCUMENTS) {
    throw new ProjectCreationError(
      `A maximum of ${MAX_PROJECT_CREATION_OPTIONAL_DOCUMENTS} optional documents may be uploaded.`,
      400
    );
  }

  const mom = files.mom[0];
  const momExtension = path.extname(mom.originalname || '').toLowerCase();
  if (momExtension !== '.pdf' || mom.mimetype?.toLowerCase() !== 'application/pdf') {
    throw new ProjectCreationError('The MoM file must be a PDF.', 400);
  }

  for (const file of files.photos) {
    const extension = path.extname(file.originalname || '').toLowerCase();
    const mimeType = file.mimetype?.toLowerCase();
    if (!['.jpg', '.jpeg', '.png'].includes(extension) || !['image/jpeg', 'image/png'].includes(mimeType)) {
      throw new ProjectCreationError('Project photos must be JPG, JPEG, or PNG images.', 400);
    }
  }

  for (const file of [...files.mom, ...files.photos, ...files.documents]) {
    if (!file.originalname?.trim()) {
      throw new ProjectCreationError('File format not supported. Allowed formats: PDF, DOCX, XLSX, PPTX, Images, ZIP.', 400);
    }
    if (!Number.isFinite(file.size) || file.size < 0 || file.size > MAX_DOCUMENT_FILE_SIZE_BYTES) {
      throw new ProjectCreationError('Each file must be 50 MB or smaller.', 400);
    }
  }

  for (const file of files.documents) {
    if (!file.originalname?.trim() || !isAllowedDocumentFileName(file.originalname)) {
      throw new ProjectCreationError(
        'File format not supported. Allowed formats: PDF, DOCX, XLSX, PPTX, Images, ZIP.',
        400
      );
    }
  }
}

const mapUser = (user: any) => user ? { id: user.id, full_name: user.full_name, email: user.email } : null;
const mapProject = (row: any) => ({
  id: row.id,
  name: row.name,
  customer: row.customer,
  scenario_id: row.scenario_id,
  current_scenario_id: row.current_scenario_id || row.scenario_id,
  active_phase_id: row.active_phase_id || null,
  phases: row.phases || [],
  phase_migration_state: row.phase_migration_state,
  active_scenario: row.active_scenario || row.scenario,
  scenario: row.scenario || null,
  sales_id: row.sales_id,
  sales: mapUser(row.sales),
  pic: row.pic ? { ...mapUser(row.pic), role: row.pic.role } : null,
  pic_revision: row.pic_revision_exact ?? (typeof row.pic_revision === 'string' || Number.isSafeInteger(row.pic_revision) ? String(row.pic_revision) : undefined),
  status: row.status,
  is_postponed: row.is_postponed,
  postponed_at: row.postponed_at,
  postponed_by: row.postponed_by,
  postpone_reason: row.postpone_reason,
  selected_document_keys: row.selected_document_keys || [],
  estimated_revenue: row.estimated_revenue === null || row.estimated_revenue === undefined ? null : Number(row.estimated_revenue),
  ...(row.estimated_revenue_exact !== undefined ? { estimated_revenue_exact: row.estimated_revenue_exact } : {}),
  final_contract_value: row.final_contract_value === null || row.final_contract_value === undefined ? null : Number(row.final_contract_value),
  loss_reason: row.loss_reason || null,
  outcome_decided_by: row.outcome_decided_by || null,
  outcome_decided_at: row.outcome_decided_at || null,
  created_at: row.created_at,
  updated_at: row.updated_at,
  activity_logs: row.activity_logs || [],
});

const projectSelect = `*, pic_revision_exact:pic_revision::text, estimated_revenue_exact:estimated_revenue::text, phases:project_phases!project_phases_project_id_fkey(*), active_scenario:scenarios!projects_current_scenario_id_fkey(id,name,workflow_model,workflow_version), scenario:scenarios!projects_scenario_id_fkey(id,name,workflow_model,workflow_version), sales:users!projects_sales_id_fkey(id,full_name,email), pic:users!projects_pic_id_fkey(id,full_name,email,role)`;

async function withActivity(project: any) {
  let request = supabaseAdmin
    .from('activity_logs')
    .select('id,user_id,action,description,created_at')
    .eq('project_id', project.id)
    .order('created_at', { ascending: false });
  request = request.neq('action', 'DOCUMENT_ACCESS_CHANGED');
  const { data: logs, error } = await request;
  if (error) throw new Error('Failed to retrieve project activities.');
  return {
    ...project,
    activity_logs: (logs || []).map((log) => ({
      ...log,
      details: log.description,
    })),
  };
}



export function assertProjectCanResume(project: ResumeProjectState): void {
  if (project.status !== 'POSTPONED' || project.is_postponed !== true) {
    throw new Error('Only POSTPONED projects can be resumed.');
  }
}

export function assertProjectOutcomeCanBeRecorded(project: ProjectOutcomeState, actor: Actor): void {
  if (actor.role !== 'SALES' || project.sales_id !== actor.userId) throw new Error('Forbidden');
  if (project.status !== 'WAITING_RESULT') {
    throw new Error('Only projects waiting for a result can be marked WON or LOST.');
  }
}

export class ProjectManagementService {
  static async list(query: ProjectQuery, actor: Actor, trace?: RequestTiming) {
    const page = query.page;
    const limit = query.limit;
    let request: any = supabaseAdmin.from('projects').select(projectSelect, { count: 'exact' }).range((page - 1) * limit, page * limit - 1).order('created_at', { ascending: false });
    request = applyProjectAccessScope(request, actor);
    if (!['SALES', 'SA'].includes(actor.role) && query.sales_id) request = request.eq('sales_id', query.sales_id);
    if (query.scenario_id) request = request.eq('scenario_id', query.scenario_id);
    if (query.status) request = request.eq('status', query.status);
    if (query.search) request = request.or(`name.ilike.%${query.search}%,customer.ilike.%${query.search}%`);
    const { data, error, count } = await timeOperation(trace, 'projects.list.rows', () => request);
    if (error) throw new Error(error.message);
    const total = count || 0;
    const projects = (data || []).map(mapProject);
    const projectIds = projects.map((p: any) => p.id);

    if (projectIds.length > 0) {
      const { data: milestonesData } = await timeOperation(trace, 'projects.list.milestones', () => supabaseAdmin
        .from('project_milestones')
        .select('id,project_id,phase_id,step_order,name,status,pic_id,start_date,due_date,workflow_stage:workflow_stages!project_milestones_workflow_stage_id_fkey(id,default_role),pic:users!project_milestones_pic_id_fkey(id,full_name)')
        .in('project_id', projectIds)
        .order('step_order', { ascending: true }));

      const milestonesByProject = new Map<string, any[]>();
      for (const m of (milestonesData || [])) {
        const list = milestonesByProject.get(m.project_id) || [];
        list.push(m);
        milestonesByProject.set(m.project_id, list);
      }

      for (const p of projects as any[]) {
        const pMilestones = phaseRows(milestonesByProject.get(p.id) || [], p.active_phase_id);
        const totalMilestones = pMilestones.length;
        const deliveryFinished = ['COMPLETED', 'WAITING_RESULT', 'WON', 'LOST'].includes(p.status);
        const completedMilestones = deliveryFinished
          ? totalMilestones
          : pMilestones.filter((m) => ['COMPLETED', 'APPROVED'].includes(m.status)).length;
        const progressPct = deliveryFinished ? 100 : totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;

        let currentMilestone = null;
        if (p.status === 'ACTIVE') {
          currentMilestone = pMilestones.find((m) => ['IN_PROGRESS', 'SUBMITTED', 'REJECTED'].includes(m.status))
            || pMilestones.find((m) => !['COMPLETED', 'APPROVED'].includes(m.status))
            || null;
        } else if (p.status === 'DRAFT') {
          currentMilestone = { name: 'Project Plan Setup', workflow_stage: { default_role: 'SALES' } };
        } else if (p.status === 'WAITING_RESULT') {
          currentMilestone = { name: 'Waiting for Sales Result', workflow_stage: { default_role: 'SALES' } };
        } else if (p.status === 'WON' || p.status === 'LOST') {
          currentMilestone = { name: `Result: ${p.status}`, workflow_stage: { default_role: 'SALES' } };
        } else if (p.status === 'COMPLETED') {
          currentMilestone = { name: 'Workflow Completed', workflow_stage: null };
        }

        const stageRole = currentMilestone?.workflow_stage?.default_role || (p.status === 'DRAFT' ? 'SALES' : null);
        const stagePic = currentMilestone?.pic?.full_name || (stageRole === 'SA' ? p.pic?.full_name : null);

        p.totalMilestones = totalMilestones;
        p.completedMilestones = completedMilestones;
        p.progress = progressPct;
        p.currentStage = currentMilestone?.name || (deliveryFinished ? 'Delivery Completed' : null);
        p.currentRole = stageRole ? (stagePic ? `${stageRole} (${stagePic})` : stageRole) : null;
        p.currentMilestone = currentMilestone?.id
          ? {
              id: currentMilestone.id,
              name: currentMilestone.name,
              step_order: currentMilestone.step_order,
              status: currentMilestone.status,
              default_role: stageRole,
              start_date: currentMilestone.start_date || null,
              due_date: currentMilestone.due_date || null,
            }
          : null;
      }
    }

    return { projects, pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasNextPage: page * limit < total, hasPrevPage: page > 1 } };
  }

  static async get(id: string, actor: Actor, options: { includeActivity?: boolean } = {}) {
    const { data, error } = await supabaseAdmin.from('projects').select(projectSelect).eq('id', id).single();
    if (error || !data || !canAccessProject(data, actor)) throw new Error('Project not found');
    const project = mapProject(options.includeActivity === false ? data : await withActivity(data));
    if (options.includeActivity === false) {
      const { activity_logs: _unused, ...withoutActivity } = project;
      return withoutActivity;
    }
    return project;
  }

  static async create(input: CreateProjectManagementInput, actor: Actor, files: ProjectCreationFiles, requestId?: string) {
    if (actor.role !== 'SALES') throw new ProjectCreationRequestError('CREATE_ACCESS_INVALID',403);
    const id = projectCreationRequestId(requestId);
    validateProjectCreationFiles(files);
    const projectId = await ProjectCreationService.create(input,actor,files,id);
    // Read CURRENT state under the native access policy, never cache a historical receipt response.
    try {
      const project = await this.get(projectId,actor,{includeActivity:false});
      const [milestones,intakeAttachments] = await Promise.all([
        MilestoneService.list(projectId,actor), ProjectIntakeService.list(projectId,actor),
      ]);
      return { ...project, activity_logs: [], milestones, intake_attachments:intakeAttachments };
    } catch {
      // Success receipt remains durable even if this read/response fails. No compensation delete.
      throw new ProjectCreationRequestError('CREATE_RETRYABLE',503);
    }
  }

  private static async activeScenario(scenarioId: string) {
    const { data,error } = await supabaseAdmin.from('scenarios').select('id,name,is_active,workflow_model,workflow_version')
      .eq('id',scenarioId).eq('is_active',true).single();
    if (error || !data) throw new ProjectCreationError('Scenario is not active or does not exist');
    try {
      resolveWorkflowInitializationMode(data);
    } catch {
      throw new ProjectCreationError('Scenario workflow model/version is not supported.');
    }
    return data;
  }

  static async update(id: string, input: UpdateProjectManagementInput, actor: Actor, context?: BusinessRequestContext) {
    if (input.estimated_revenue !== undefined) throw new Error("Use the audited estimated value endpoint.");
    const existing = await this.get(id, actor);
    if (!['SUPER_ADMIN', 'SALES'].includes(actor.role) || (actor.role === 'SALES' && existing.sales_id !== actor.userId)) throw new Error('Forbidden');
    if (input.scenario_id && input.scenario_id !== existing.scenario_id) {
      const { count, error: milestoneError } = await supabaseAdmin.from('project_milestones').select('id', { count: 'exact', head: true }).eq('project_id', id);
      if (milestoneError) throw new Error(milestoneError.message);
      if ((count || 0) > 0) throw new Error('Scenario cannot be changed after workflow milestones exist.');
      await this.activeScenario(input.scenario_id);
    }

    const { selectedDocumentKeys, selected_document_keys, ...restInput } = input;
    const updatePayload: Record<string, any> = { ...restInput };

    const keysToUpdate = selectedDocumentKeys || selected_document_keys;
    if (keysToUpdate) {
      updatePayload.selected_keys = keysToUpdate;
    }

    await mutateBusiness(id, actor.userId, 'INFO', updatePayload, context);
    return this.get(id, actor, { includeActivity: false });
  }

  static async postpone(id: string, reason: string, actor: Actor, context?: BusinessRequestContext) {
    const existing = await this.get(id, actor);
    if (actor.role !== 'SALES' || existing.sales_id !== actor.userId) throw new Error('Forbidden');

    await mutateBusiness(id, actor.userId, 'POSTPONE', { reason }, context);
    return this.get(id, actor, { includeActivity: false });
  }

  static async resume(id: string, actor: Actor, context?: BusinessRequestContext) {
    const existing = await this.get(id, actor);
    if (actor.role !== 'SALES' || existing.sales_id !== actor.userId) throw new Error('Forbidden');

    await mutateBusiness(id, actor.userId, 'RESUME', {}, context);
    return this.get(id, actor, { includeActivity: false });
  }

  static async setOutcome(id: string, input: ProjectOutcomeInput, actor: Actor, context?: BusinessRequestContext) {
    const existing = await this.get(id, actor);
    if (actor.role !== 'SALES' || existing.sales_id !== actor.userId) throw new Error('Forbidden');

    await mutateBusiness(id, actor.userId, 'OUTCOME', input, context);
    return this.get(id, actor, { includeActivity: false });
  }
}
