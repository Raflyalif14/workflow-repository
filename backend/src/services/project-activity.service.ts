import { supabaseAdmin } from '../config/supabase';
import { ProjectActivityQuery } from '../validators/project-activity.validator';
import { canAccessProject, ProjectAccessActor } from './project-access.service';

type ActivityLogRow = {
  id: string;
  user_id: string | null;
  action: string;
  description: string | null;
  created_at: string;
};

type ActivityActorRow = {
  id: string;
  full_name: string;
  role: string;
};

type ActivityCursor = {
  createdAt: string;
  id: string;
};

export type ProjectActivityItem = {
  id: string;
  action: string;
  description: string | null;
  createdAt: string;
  actor: {
    id: string;
    name: string;
    role: string;
  } | null;
};

export type ProjectActivitiesResponse = {
  items: ProjectActivityItem[];
  nextCursor: string | null;
};

export class ProjectActivityError extends Error {
  constructor(message: string, readonly statusCode = 500) {
    super(message);
    this.name = 'ProjectActivityError';
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function encodeCursor(cursor: ActivityCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function decodeCursor(value?: string): ActivityCursor | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<ActivityCursor>;
    const createdAt = typeof parsed.createdAt === 'string' ? new Date(parsed.createdAt) : null;
    if (!createdAt || Number.isNaN(createdAt.getTime()) || typeof parsed.id !== 'string' || !UUID_PATTERN.test(parsed.id)) {
      throw new Error('Invalid cursor');
    }
    return { createdAt: createdAt.toISOString(), id: parsed.id };
  } catch {
    throw new ProjectActivityError('Invalid activity cursor.', 422);
  }
}

export class ProjectActivityService {
  static async list(projectId: string, query: ProjectActivityQuery, actor: ProjectAccessActor): Promise<ProjectActivitiesResponse> {
    const { data: project, error: projectError } = await supabaseAdmin
      .from('projects')
      .select('id,sales_id,pic_id')
      .eq('id', projectId)
      .maybeSingle();

    if (projectError || !project || !canAccessProject(project, actor)) {
      throw new ProjectActivityError('Project not found.', 404);
    }

    const cursor = decodeCursor(query.cursor);
    let activityRequest: any = supabaseAdmin
      .from('activity_logs')
      .select('id,user_id,action,description,created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(query.limit + 1);

    if (cursor) {
      activityRequest = activityRequest.or(
        `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`
      );
    }

    const { data: activityRows, error: activityError } = await activityRequest;
    if (activityError) throw new ProjectActivityError('Failed to retrieve project activities.');

    const rows = (activityRows || []) as ActivityLogRow[];
    const hasMore = rows.length > query.limit;
    const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
    const actorIds = [...new Set(pageRows.map((row) => row.user_id).filter((id): id is string => Boolean(id)))];
    let actorsById = new Map<string, ActivityActorRow>();

    if (actorIds.length) {
      const { data: actorRows, error: actorError } = await supabaseAdmin
        .from('users')
        .select('id,full_name,role')
        .in('id', actorIds);
      if (actorError) throw new ProjectActivityError('Failed to retrieve project activities.');
      actorsById = new Map(((actorRows || []) as ActivityActorRow[]).map((row) => [row.id, row]));
    }

    const finalRow = pageRows[pageRows.length - 1];
    return {
      items: pageRows.map((row) => {
        const activityActor = row.user_id ? actorsById.get(row.user_id) : undefined;
        return {
          id: row.id,
          action: row.action,
          description: row.description,
          createdAt: row.created_at,
          actor: activityActor
            ? { id: activityActor.id, name: activityActor.full_name, role: activityActor.role }
            : null,
        };
      }),
      nextCursor: hasMore && finalRow ? encodeCursor({ createdAt: finalRow.created_at, id: finalRow.id }) : null,
    };
  }
}
