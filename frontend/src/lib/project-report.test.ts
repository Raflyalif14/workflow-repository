import assert from 'node:assert/strict';
import { buildProjectReport, projectReportFilename } from './project-report';
import { projectReportPdf, projectReportSheet } from './project-report-files';
import { translate } from '../i18n';
import type { Project, ProjectMilestonePhase4 } from '../types/project';

const project = { id: 'project-a', name: '=HYPERLINK("https://example.invalid")', customer: 'Café & Pelabuhan', status: 'ACTIVE',
  active_phase_id: 'phase-a', phases: [{ id: 'phase-a', phase_key: 'PRA_TENDER' }],
  scenario: { name: 'Legacy scenario' }, active_scenario: { name: 'Current scenario' },
  sales: { fullName: 'Sales name', email: 'private@example.invalid' }, pic: { full_name: 'PIC name' },
} as Project;
const row = (id: string, step: number, status = 'IN_PROGRESS', phase = 'phase-a') => ({ id, project_id: 'project-a', phase_id: phase,
  name: `Milestone ${id}`, step_order: step, status, start_date: '2026-10-01', due_date: '2026-10-31',
  workflow_stage: { default_role: 'SA' },
} as ProjectMilestonePhase4);
const rows = [row('third', 3), row('old-phase', 1, 'COMPLETED', 'phase-old'), row('first', 1, 'COMPLETED'), row('second', 2, 'APPROVED')];
for (const language of ['en', 'id'] as const) {
  const report = buildProjectReport(project, rows, language, new Date('2026-10-20T18:15:00Z'));
  const tender = buildProjectReport({ ...project, phases: [{ ...project.phases![0], phase_key: 'ON_SUBMISSION_TENDER' }] }, rows, language);
  assert(tender.summary.some(row => row[0] === tender.labels.status && row[1] === 'On Progress Tender'));
  assert.deepEqual(report.progress, { completed: 2, total: 3, percentage: 67 });
  assert.deepEqual(report.rows.map(row => row[1]), ['Milestone first', 'Milestone second', 'Milestone third']);
  assert(report.summary.some(row => row[1] === 'Current scenario'));
  assert.equal(report.generatedDate, '2026-10-21', 'Export date follows the business timezone');
  assert(report.generatedAt.endsWith('WIB'));
  assert.equal(report.labels.title, translate('reportExport.title', {}, language));
  assert(!JSON.stringify(report).includes('private@'), 'Report projects only names, not contact details');
  const sheet = projectReportSheet(report);
  const cells = sheet.flat().filter(cell => cell && typeof cell === 'object' && 'value' in cell) as Array<{ value: unknown; type: unknown }>;
  assert(cells.some(cell => cell.value === project.name && cell.type === String), 'Formula-looking names remain strings');
  assert(cells.every(cell => cell.type === String || cell.type === Number));
  const pdf = projectReportPdf(report);
  assert.equal(pdf.pageOrientation, 'landscape'); assert.equal(pdf.pageSize, 'A4');
  assert.equal(typeof pdf.footer, 'function');
  assert(!projectReportFilename(report, 'pdf').includes('/'));
  assert(projectReportFilename(report, 'xlsx').endsWith('-2026-10-21.xlsx'));
  const empty = buildProjectReport({ ...project, is_postponed: true }, [], language);
  assert.equal(empty.progress.percentage, 0); assert.equal(empty.rows.length, 0);
  assert(JSON.stringify(projectReportPdf(empty)).includes(empty.labels.empty));
  const missing = buildProjectReport(project, [{ ...rows[0], start_date: null, due_date: null }], language);
  assert.equal(missing.rows[0][4], translate('common.notAvailable', {}, language));
  assert(missing.rows[0][3].includes(translate('role.SA', {}, language)));
  // Summary metadata labels should not carry trailing colons (consistent with Project, Phase, Status, etc.).
  assert(!report.labels.customer.endsWith(':'), 'Customer summary label has no trailing colon');
  assert(!report.labels.scenario.endsWith(':'), 'Scenario summary label has no trailing colon');
  // SALES milestones without pic_id fall back to project Sales owner name in both PDF & Excel.
  const salesMilestone = { id: 'tender', project_id: 'project-a', phase_id: 'phase-a', name: 'Tender Process',
    step_order: 4, status: 'CREATED', start_date: '2026-10-01', due_date: '2026-10-31',
    workflow_stage: { default_role: 'SALES' } } as ProjectMilestonePhase4;
  const salesReport = buildProjectReport(project, [salesMilestone], language);
  assert.equal(salesReport.rows[0][3], 'Sales name');
  assert(JSON.stringify(projectReportSheet(salesReport)).includes('Sales name'));
  assert(JSON.stringify(projectReportPdf(salesReport)).includes('Sales name'));
  const noSalesReport = buildProjectReport({ ...project, sales: null }, [salesMilestone], language);
  assert.equal(noSalesReport.rows[0][3], translate('reportExport.unassignedRole', { role: translate('role.SALES', {}, language) }, language));
}
console.log('Project report: phase/progress parity, ordered rows, localization, business dates, missing values, safe text and filenames passed.');
