import { translate, translateMilestoneStatus, translateProjectStatus, translateRole, type AppLanguage } from '@/i18n';
import type { Project, ProjectMilestonePhase4 } from '@/types/project';
import { activePhaseMilestones } from './phase-review';
import { calculateProjectMilestoneProgress } from './project-milestone-progress';
import { BUSINESS_TIMEZONE, getLocalDateOnlyKey, toDateOnlyKey } from './dates';

export type ProjectReport = ReturnType<typeof buildProjectReport>;

export function buildProjectReport(project: Project, rows: ProjectMilestonePhase4[], language: AppLanguage, generated = new Date()) {
  const t = (key: Parameters<typeof translate>[0], params = {}) => translate(key, params, language);
  const locale = language === 'id' ? 'id-ID' : 'en-US';
  const missing = t('common.notAvailable');
  const date = (value?: string | null) => {
    if (!value) return missing;
    const key = toDateOnlyKey(value);
    const parsed = new Date(`${key}T12:00:00Z`);
    return Number.isNaN(parsed.getTime()) ? missing : new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(parsed);
  };
  const milestones = activePhaseMilestones(project, rows).slice().sort((a, b) => a.step_order - b.step_order || a.id.localeCompare(b.id));
  const phase = project.phases?.find(item => item.id === project.active_phase_id);
  const phaseName = phase?.phase_key === 'PRA_TENDER' ? 'Pra-Tender' : phase?.phase_key === 'ON_SUBMISSION_TENDER' ? 'On Submission Tender' : (project.active_scenario?.name || project.scenario?.name || missing);
  const progress = calculateProjectMilestoneProgress(milestones);
  const status = project.is_postponed ? translateProjectStatus('POSTPONED', language) : translateProjectStatus(project.status, language);
  const labels = {
    title: t('reportExport.title'), project: t('reportExport.project'), customer: t('projectDetail.customer'),
    scenario: t('projectDetail.scenario'), phase: t('reportExport.phase'), status: t('reportExport.status'),
    sales: t('reportExport.sales'), pic: t('reportExport.pic'), progress: t('reportExport.progress'),
    milestones: t('reportExport.milestones'), generated: t('reportExport.generated'),
    scope: t('reportExport.scope'), note: t('reportExport.snapshot'), empty: t('reportExport.noMilestones'),
    summary: t('reportExport.summary'), page: t('reportExport.page'), of: t('reportExport.of'),
  };
  return {
    projectId: project.id, language, labels, name: project.name,
    generatedDate: getLocalDateOnlyKey(generated),
    generatedAt: new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: BUSINESS_TIMEZONE }).format(generated) + ' WIB',
    progress,
    summary: [
      [labels.project, project.name], [labels.customer, project.customer || missing],
      [labels.scenario, project.active_scenario?.name || project.scenario?.name || missing],
      [labels.phase, phaseName], [labels.status, status],
      [labels.sales, project.sales?.full_name || project.sales?.fullName || missing],
      [labels.pic, project.pic?.full_name || project.pic?.fullName || missing],
      [labels.progress, `${progress.percentage}% (${progress.completed}/${progress.total})`],
    ],
    headers: [t('reportExport.number'), t('reportExport.milestone'), labels.status, t('reportExport.owner'), t('reportExport.start'), t('reportExport.due')],
    rows: milestones.map((item, index) => [String(index + 1), item.name, translateMilestoneStatus(item.status, language),
      item.pic?.full_name || item.pic?.fullName || (item.workflow_stage?.default_role ? t('reportExport.unassignedRole', { role: translateRole(item.workflow_stage.default_role, language) }) : missing),
      date(item.start_date), date(item.due_date)]),
  };
}

export function projectReportFilename(report: Pick<ProjectReport, 'name' | 'projectId' | 'generatedDate'>, extension: 'xlsx' | 'pdf') {
  const name = report.name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 65) || 'project';
  return `WorkflowHub-${name}-${report.projectId.slice(0, 8)}-${report.generatedDate}.${extension}`;
}
