import { randomUUID } from 'crypto';
import path from 'path';
import { supabaseAdmin } from '../config/supabase';
import {
  buildProjectIntakeStoragePath,
  DocumentStorageService,
  isAllowedDocumentFileName,
  MAX_DOCUMENT_FILE_SIZE_BYTES,
} from '../utils/storage.util';
import { CreateProjectManagementInput, ProjectQuery, UpdateProjectManagementInput } from '../validators/project-management.validator';
import { MilestoneService, resolveWorkflowInitializationMode } from './milestone.service';
import { applyProjectAccessScope, canAccessProject } from './project-access.service';
import { logWorkflowActivityBestEffort } from './workflow-progression.service';

type Actor = { userId: string; role: string; fullName: string };
type ResumeProjectState = { status: string; is_postponed: boolean | null };
export const MAX_PROJECT_CREATION_OPTIONAL_DOCUMENTS = 10;
export const MAX_PROJECT_CREATION_PHOTOS = 10;

export type ProjectCreationFiles = {
  mom: Express.Multer.File[];
  photos: Express.Multer.File[];
  documents: Express.Multer.File[];
};

type CreatedProjectIntakeAttachment = {
  id: string;
  kind: 'MOM' | 'PHOTO' | 'DOCUMENT';
  file_name: string;
  mime_type: string;
  size_bytes: number;
};

type ProjectCreationOperation = {
  projectId: string | null;
  intakeAttachmentIds: string[];
  storagePaths: string[];
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
  scenario: row.scenario || null,
  sales_id: row.sales_id,
  sales: mapUser(row.sales),
  pic: row.pic ? { ...mapUser(row.pic), role: row.pic.role } : null,
  status: row.status,
  is_postponed: row.is_postponed,
  postponed_at: row.postponed_at,
  postponed_by: row.postponed_by,
  postpone_reason: row.postpone_reason,
  created_at: row.created_at,
  updated_at: row.updated_at,
  activity_logs: row.activity_logs || [],
});

const projectSelect = `*, scenario:scenarios!projects_scenario_id_fkey(id,name,workflow_model,workflow_version), sales:users!projects_sales_id_fkey(id,full_name,email), pic:users!projects_pic_id_fkey(id,full_name,email,role)`;

async function withActivity(project: any) {
  const { data: logs, error } = await supabaseAdmin
    .from('activity_logs')
    .select('id,user_id,action,description,created_at')
    .eq('project_id', project.id)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return {
    ...project,
    activity_logs: (logs || []).map((log) => ({
      ...log,
      details: log.description,
    })),
  };
}

async function logProject(actor: Actor, projectId: string, action: string, description: string) {
  await logWorkflowActivityBestEffort(actor, projectId, action, description);
}

export function assertProjectCanResume(project: ResumeProjectState): void {
  if (project.status !== 'POSTPONED' || project.is_postponed !== true) {
    throw new Error('Only POSTPONED projects can be resumed.');
  }
}

export class ProjectManagementService {
  static async list(query: ProjectQuery, actor: Actor) {
    const page = query.page;
    const limit = query.limit;
    let request: any = supabaseAdmin.from('projects').select(projectSelect, { count: 'exact' }).range((page - 1) * limit, page * limit - 1).order('created_at', { ascending: false });
    request = applyProjectAccessScope(request, actor);
    if (!['SALES', 'SA'].includes(actor.role) && query.sales_id) request = request.eq('sales_id', query.sales_id);
    if (query.scenario_id) request = request.eq('scenario_id', query.scenario_id);
    if (query.status) request = request.eq('status', query.status);
    if (query.search) request = request.or(`name.ilike.%${query.search}%,customer.ilike.%${query.search}%`);
    const { data, error, count } = await request;
    if (error) throw new Error(error.message);
    const total = count || 0;
    const projects = (data || []).map(mapProject);
    const projectIds = projects.map((p: any) => p.id);

    if (projectIds.length > 0) {
      const { data: milestonesData } = await supabaseAdmin
        .from('project_milestones')
        .select('id,project_id,step_order,name,status,pic_id,workflow_stage:workflow_stages!project_milestones_workflow_stage_id_fkey(id,default_role),pic:users!project_milestones_pic_id_fkey(id,full_name)')
        .in('project_id', projectIds)
        .order('step_order', { ascending: true });

      const milestonesByProject = new Map<string, any[]>();
      for (const m of (milestonesData || [])) {
        const list = milestonesByProject.get(m.project_id) || [];
        list.push(m);
        milestonesByProject.set(m.project_id, list);
      }

      for (const p of projects as any[]) {
        const pMilestones = milestonesByProject.get(p.id) || [];
        const totalMilestones = pMilestones.length;
        const completedMilestones = p.status === 'COMPLETED'
          ? totalMilestones
          : pMilestones.filter((m) => ['COMPLETED', 'APPROVED'].includes(m.status)).length;
        const progressPct = p.status === 'COMPLETED' ? 100 : totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;

        let currentMilestone = null;
        if (p.status === 'ACTIVE') {
          currentMilestone = pMilestones.find((m) => ['IN_PROGRESS', 'SUBMITTED', 'REJECTED'].includes(m.status))
            || pMilestones.find((m) => !['COMPLETED', 'APPROVED'].includes(m.status))
            || null;
        } else if (p.status === 'DRAFT') {
          currentMilestone = { name: 'Project Plan Setup', workflow_stage: { default_role: 'SALES' } };
        } else if (p.status === 'COMPLETED') {
          currentMilestone = { name: 'Workflow Completed', workflow_stage: null };
        }

        const stageRole = currentMilestone?.workflow_stage?.default_role || (p.status === 'DRAFT' ? 'SALES' : null);
        const stagePic = currentMilestone?.pic?.full_name || (stageRole === 'SA' ? p.pic?.full_name : null);

        p.totalMilestones = totalMilestones;
        p.completedMilestones = completedMilestones;
        p.progress = progressPct;
        p.currentStage = currentMilestone?.name || (p.status === 'COMPLETED' ? 'Workflow Completed' : null);
        p.currentRole = stageRole ? (stagePic ? `${stageRole} (${stagePic})` : stageRole) : null;
      }
    }

    return { projects, pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasNextPage: page * limit < total, hasPrevPage: page > 1 } };
  }

  static async get(id: string, actor: Actor) {
    const { data, error } = await supabaseAdmin.from('projects').select(projectSelect).eq('id', id).single();
    if (error || !data || !canAccessProject(data, actor)) throw new Error('Project not found');
    return mapProject(await withActivity(data));
  }

  private static async activeScenario(scenarioId: string) {
    const { data, error } = await supabaseAdmin
      .from('scenarios')
      .select('id,name,is_active,workflow_model,workflow_version')
      .eq('id', scenarioId)
      .eq('is_active', true)
      .single();
    if (error || !data) throw new ProjectCreationError('Scenario is not active or does not exist');
    try {
      resolveWorkflowInitializationMode(data);
    } catch {
      throw new ProjectCreationError('Scenario workflow model/version is not supported.');
    }
    return data;
  }

  private static async createProjectIntakeAttachment(
    projectId: string,
    file: Express.Multer.File,
    kind: 'MOM' | 'PHOTO' | 'DOCUMENT',
    actor: Actor,
    operation: ProjectCreationOperation
  ): Promise<CreatedProjectIntakeAttachment> {
    const attachmentId = randomUUID();
    const storagePath = buildProjectIntakeStoragePath(projectId, attachmentId, file.originalname);
    operation.storagePaths.push(storagePath);
    await DocumentStorageService.upload(file, storagePath);

    // Track the operation-owned ID before metadata insertion in case the provider response is ambiguous.
    operation.intakeAttachmentIds.push(attachmentId);
    const { data: attachment, error } = await supabaseAdmin
      .from('project_intake_attachments')
      .insert({
        id: attachmentId,
        project_id: projectId,
        kind,
        original_filename: file.originalname,
        mime_type: file.mimetype || 'application/octet-stream',
        size_bytes: file.size,
        storage_path: storagePath,
        created_by: actor.userId,
      })
      .select('id')
      .maybeSingle();
    if (error || !attachment) throw new ProjectCreationError('Failed to save project intake evidence.', 500);

    return {
      id: attachmentId,
      kind,
      file_name: file.originalname,
      mime_type: file.mimetype || 'application/octet-stream',
      size_bytes: file.size,
    };
  }

  private static async rollbackProjectCreation(operation: ProjectCreationOperation): Promise<void> {
    const cleanupFailures: string[] = [];

    try {
      await DocumentStorageService.removeMany(operation.storagePaths);
    } catch {
      cleanupFailures.push('storage');
    }

    if (operation.intakeAttachmentIds.length) {
      const { error } = await supabaseAdmin
        .from('project_intake_attachments')
        .delete()
        .in('id', operation.intakeAttachmentIds);
      if (error) cleanupFailures.push('intakeAttachments');
    }

    if (operation.projectId) {
      const { error: milestonesError } = await supabaseAdmin
        .from('project_milestones')
        .delete()
        .eq('project_id', operation.projectId);
      if (milestonesError) cleanupFailures.push('milestones');

      const { data: deletedProject, error: projectError } = await supabaseAdmin
        .from('projects')
        .delete()
        .eq('id', operation.projectId)
        .select('id')
        .maybeSingle();
      if (projectError || !deletedProject) cleanupFailures.push('project');
    }

    if (cleanupFailures.length) {
      console.error('[ProjectManagement] Project creation rollback did not fully complete.', {
        projectId: operation.projectId,
        cleanupFailures,
      });
    }
  }

  static async create(input: CreateProjectManagementInput, actor: Actor, files: ProjectCreationFiles) {
    if (actor.role !== 'SALES') throw new Error('Forbidden');
    validateProjectCreationFiles(files);
    await this.activeScenario(input.scenario_id);
    const operation: ProjectCreationOperation = { projectId: null, intakeAttachmentIds: [], storagePaths: [] };

    const { data, error } = await supabaseAdmin
      .from('projects')
      .insert({ ...input, sales_id: actor.userId, status: 'DRAFT', is_postponed: false })
      .select(projectSelect)
      .single();
    if (error || !data) throw new ProjectCreationError('Failed to create project.', 500);
    operation.projectId = data.id;

    try {
      await MilestoneService.initialize(data.id, actor);
      const intakeAttachments = [
        await this.createProjectIntakeAttachment(data.id, files.mom[0], 'MOM', actor, operation),
      ];
      for (const file of files.photos) {
        intakeAttachments.push(await this.createProjectIntakeAttachment(data.id, file, 'PHOTO', actor, operation));
      }
      for (const file of files.documents) {
        intakeAttachments.push(await this.createProjectIntakeAttachment(data.id, file, 'DOCUMENT', actor, operation));
      }
      await logProject(actor, data.id, 'PROJECT_CREATED', `${actor.fullName} created project '${data.name}'`);
      const { data: created, error: createdError } = await supabaseAdmin.from('projects').select(projectSelect).eq('id', data.id).single();
      if (createdError || !created) throw new ProjectCreationError('Failed to create project.', 500);
      const milestones = await MilestoneService.list(data.id, actor);
      return { ...mapProject(created), milestones, intake_attachments: intakeAttachments };
    } catch (error) {
      await this.rollbackProjectCreation(operation);
      if (error instanceof ProjectCreationError) throw error;
      throw new ProjectCreationError('Failed to create project.', 500);
    }
  }

  static async update(id: string, input: UpdateProjectManagementInput, actor: Actor) {
    const existing = await this.get(id, actor);
    if (!['SUPER_ADMIN', 'SALES'].includes(actor.role) || (actor.role === 'SALES' && existing.sales_id !== actor.userId)) throw new Error('Forbidden');
    if (input.scenario_id && input.scenario_id !== existing.scenario_id) {
      const { count, error: milestoneError } = await supabaseAdmin.from('project_milestones').select('id', { count: 'exact', head: true }).eq('project_id', id);
      if (milestoneError) throw new Error(milestoneError.message);
      if ((count || 0) > 0) throw new Error('Scenario cannot be changed after workflow milestones exist.');
      await this.activeScenario(input.scenario_id);
    }
    const { data, error } = await supabaseAdmin.from('projects').update(input).eq('id', id).select(projectSelect).single();
    if (error || !data) throw new Error('Project not found');
    await logProject(actor, id, 'UPDATE', `${actor.fullName} updated project '${data.name}'`);
    return mapProject(data);
  }

  static async postpone(id: string, reason: string, actor: Actor) {
    const existing = await this.get(id, actor);
    if (actor.role !== 'SALES' || existing.sales_id !== actor.userId) throw new Error('Forbidden');
    if (existing.status !== 'ACTIVE' || existing.is_postponed) throw new Error('Only ACTIVE projects can be postponed.');
    const { data, error } = await supabaseAdmin.from('projects').update({ status: 'POSTPONED', is_postponed: true, postponed_at: new Date().toISOString(), postponed_by: actor.userId, postpone_reason: reason, updated_at: new Date().toISOString() }).eq('id', id).eq('status', 'ACTIVE').select(projectSelect).single();
    if (error || !data) throw new Error('Project not found');
    await logProject(actor, id, 'PROJECT_POSTPONED', `${actor.fullName} postponed project '${data.name}'. Reason: ${reason}`);
    return mapProject(data);
  }

  static async resume(id: string, actor: Actor) {
    const existing = await this.get(id, actor);
    if (actor.role !== 'SALES' || existing.sales_id !== actor.userId) throw new Error('Forbidden');
    assertProjectCanResume(existing);
    const { data, error } = await supabaseAdmin
      .from('projects')
      .update({ status: 'ACTIVE', is_postponed: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'POSTPONED')
      .eq('is_postponed', true)
      .select(projectSelect)
      .maybeSingle();
    if (error) throw new Error('Failed to resume project.');
    if (!data) throw new Error('Only POSTPONED projects can be resumed.');
    await logProject(actor, id, 'PROJECT_RESUMED', `${actor.fullName} resumed project '${data.name}'`);
    return mapProject(data);
  }
}
