import { apiClient, SessionChangedError } from './api-client';
import { getAuthSession, isCurrentSession } from './auth';
import { buildProjectReport } from './project-report';
import type { AppLanguage } from '@/i18n';
import type { Project, ProjectMilestonePhase4 } from '@/types/project';

export async function loadProjectReport(projectId: string, language: AppLanguage, signal: AbortSignal) {
  const session = getAuthSession();
  if (!session || !isCurrentSession(session)) throw new SessionChangedError();
  const [project, milestones] = await Promise.all([
    apiClient<Project>(`/projects/${encodeURIComponent(projectId)}?include_activity=false`, { signal }),
    apiClient<ProjectMilestonePhase4[]>(`/projects/${encodeURIComponent(projectId)}/milestones`, { signal }),
  ]);
  if (!isCurrentSession(session)) throw new SessionChangedError();
  signal.throwIfAborted();
  if (!project || project.id !== projectId || !Array.isArray(milestones) || milestones.some(row => row.project_id !== projectId))
    throw new Error('Invalid project report data');
  return { report: buildProjectReport(project, milestones, language), session };
}
