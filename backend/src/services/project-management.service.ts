import { supabaseAdmin } from '../config/supabase';
import { CreateProjectManagementInput, ProjectQuery, UpdateProjectManagementInput } from '../validators/project-management.validator';
import { MilestoneService } from './milestone.service';

type Actor = { userId: string; role: string; fullName: string };
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

const projectSelect = `*, scenario:scenarios!projects_scenario_id_fkey(id,name), sales:users!projects_sales_id_fkey(id,full_name,email), pic:users!projects_pic_id_fkey(id,full_name,email,role)`;

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
  const { error } = await supabaseAdmin
    .from('activity_logs')
    .insert({ user_id: actor.userId, project_id: projectId, action, description });
  if (error) throw new Error(error.message);
}

export class ProjectManagementService {
  private static canAccess(row: any, actor: Actor) {
    return actor.role !== 'SALES' || row.sales_id === actor.userId;
  }

  static async list(query: ProjectQuery, actor: Actor) {
    const page = query.page;
    const limit = query.limit;
    let request: any = supabaseAdmin.from('projects').select(projectSelect, { count: 'exact' }).range((page - 1) * limit, page * limit - 1).order('created_at', { ascending: false });
    if (actor.role === 'SALES') request = request.eq('sales_id', actor.userId);
    else if (actor.role === 'SA') request = request.eq('pic_id', actor.userId);
    else if (query.sales_id) request = request.eq('sales_id', query.sales_id);
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
    if (error || !data || (actor.role === 'SA' && data.pic_id !== actor.userId) || !this.canAccess(data, actor)) throw new Error('Project not found');
    return mapProject(await withActivity(data));
  }

  private static async activeScenario(scenarioId: string) {
    const { data, error } = await supabaseAdmin.from('scenarios').select('id,name,is_active').eq('id', scenarioId).eq('is_active', true).single();
    if (error || !data) throw new Error('Scenario is not active or does not exist');
    return data;
  }

  static async create(input: CreateProjectManagementInput, actor: Actor) {
    if (actor.role !== 'SALES') throw new Error('Forbidden');
    await this.activeScenario(input.scenario_id);
    const { data, error } = await supabaseAdmin
      .from('projects')
      .insert({ ...input, sales_id: actor.userId, status: 'DRAFT', is_postponed: false })
      .select(projectSelect)
      .single();
    if (error || !data) throw new Error(error?.message || 'Failed to create project');
    try {
      await MilestoneService.initialize(data.id, actor);
      await logProject(actor, data.id, 'PROJECT_CREATED', `${actor.fullName} created project '${data.name}'`);
    } catch (error) {
      await supabaseAdmin.from('projects').delete().eq('id', data.id);
      throw error;
    }
    const { data: created } = await supabaseAdmin.from('projects').select(projectSelect).eq('id', data.id).single();
    const milestones = await MilestoneService.list(data.id, actor);
    return { ...mapProject(created || data), milestones };
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
    if (existing.status !== 'POSTPONED' && !existing.is_postponed) throw new Error('Only POSTPONED projects can be resumed.');
    const { data, error } = await supabaseAdmin.from('projects').update({ status: 'ACTIVE', is_postponed: false, updated_at: new Date().toISOString() }).eq('id', id).eq('status', 'POSTPONED').select(projectSelect).single();
    if (error || !data) throw new Error('Project not found');
    await logProject(actor, id, 'PROJECT_RESUMED', `${actor.fullName} resumed project '${data.name}'`);
    return mapProject(data);
  }
}
