import { supabaseAdmin } from '../config/supabase';
import { GlobalSearchQuery } from '../validators/search.validator';
import { applyProjectAccessScope, getAccessibleProjectIds, ProjectAccessActor } from './project-access.service';

type Actor = ProjectAccessActor & { fullName?: string };
type ProjectSearchRow = { id: string; name: string; customer: string; status: string };
type DocumentSearchRow = { id: string; project_id: string; title: string; category: string };
type MilestoneSearchRow = { id: string; project_id: string; name: string; step_order: number; status: string };

export type GlobalSearchResult = {
  type: 'PROJECT' | 'DOCUMENT' | 'MILESTONE';
  id: string;
  projectId: string;
  title: string;
  subtitle: string;
  status?: string;
};

export type GlobalSearchResponse = {
  projects: GlobalSearchResult[];
  documents: GlobalSearchResult[];
  milestones: GlobalSearchResult[];
};

export class GlobalSearchError extends Error {
  constructor(message: string, readonly statusCode = 500) {
    super(message);
    this.name = 'GlobalSearchError';
  }
}

const RESULT_LIMIT = 5;

// Escape values that have meaning inside a PostgREST OR filter before interpolation.
const escapeFilterValue = (value: string) => value.replace(/[\\,().]/g, '\\$&').replace(/[%_]/g, '\\$&');

export class GlobalSearchService {
  static async search(query: GlobalSearchQuery, actor: Actor): Promise<GlobalSearchResponse> {
    const term = query.q.trim();
    const pattern = `%${escapeFilterValue(term)}%`;
    const accessibleProjectIds = await getAccessibleProjectIds(actor);
    if (accessibleProjectIds && !accessibleProjectIds.length) {
      return { projects: [], documents: [], milestones: [] };
    }

    let projectRequest: any = supabaseAdmin
      .from('projects')
      .select('id,name,customer,status')
      .or(`name.ilike.${pattern},customer.ilike.${pattern}`)
      .order('updated_at', { ascending: false })
      .limit(RESULT_LIMIT);
    projectRequest = applyProjectAccessScope(projectRequest, actor);

    let documentRequest: any = supabaseAdmin
      .from('documents')
      .select('id,project_id,title,category')
      .ilike('title', pattern)
      .order('updated_at', { ascending: false })
      .limit(RESULT_LIMIT);
    let milestoneRequest: any = supabaseAdmin
      .from('project_milestones')
      .select('id,project_id,name,step_order,status')
      .ilike('name', pattern)
      .order('step_order', { ascending: true })
      .limit(RESULT_LIMIT);

    if (accessibleProjectIds) {
      documentRequest = documentRequest.in('project_id', accessibleProjectIds);
      milestoneRequest = milestoneRequest.in('project_id', accessibleProjectIds);
    }

    const [projectsResult, documentsResult, milestonesResult] = await Promise.all([
      projectRequest,
      documentRequest,
      milestoneRequest,
    ]);

    if (projectsResult.error) throw new GlobalSearchError('Failed to search projects.');
    if (documentsResult.error) throw new GlobalSearchError('Failed to search documents.');
    if (milestonesResult.error) throw new GlobalSearchError('Failed to search milestones.');

    return {
      projects: ((projectsResult.data || []) as ProjectSearchRow[]).map((project) => ({
        type: 'PROJECT',
        id: project.id,
        projectId: project.id,
        title: project.name,
        subtitle: project.customer,
        status: project.status,
      })),
      documents: ((documentsResult.data || []) as DocumentSearchRow[]).map((document) => ({
        type: 'DOCUMENT',
        id: document.id,
        projectId: document.project_id,
        title: document.title,
        subtitle: document.category.replace(/_/g, ' '),
      })),
      milestones: ((milestonesResult.data || []) as MilestoneSearchRow[]).map((milestone) => ({
        type: 'MILESTONE',
        id: milestone.id,
        projectId: milestone.project_id,
        title: milestone.name,
        subtitle: `Step ${milestone.step_order}`,
        status: milestone.status,
      })),
    };
  }
}
