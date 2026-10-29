import { translate, translateProjectStatus, type AppLanguage } from '@/i18n';
import { resolveScenarioKey } from '@/constants/scenarios';
import type { Project } from '@/types/project';
export function projectDisplayStatus(project: Pick<Project,'status'|'scenario'|'active_scenario'|'phases'|'active_phase_id'>, language?: AppLanguage) {
  const phase = project.phases?.find(phase => phase.id === project.active_phase_id)?.phase_key;
  const submission = phase === 'ON_SUBMISSION_TENDER' || !phase && resolveScenarioKey(project.active_scenario?.name || project.scenario?.name) === 'ON_SUBMISSION_TENDER';
  return project.status === 'ACTIVE' && submission ? translate('workflowUpdate.onProgressTender', {}, language) : translateProjectStatus(project.status, language);
}
