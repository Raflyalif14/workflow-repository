import { strict as assert } from 'assert';
import { readFileSync } from 'fs';
import path from 'path';
import {
  canReadNonFinalOutput,
  canUploadOutput,
  formatOutputDocumentNames,
  isCurrentOutputVersion,
  isOutputReadyForReview,
  isOutputReadyForSubmission,
} from './output-document.service';
import { areSelectedProjectOutputsApproved } from './workflow-progression.service';
import { canAccessProject } from './project-access.service';
import {
  getScenarioDocuments,
  resolveScenarioKey,
} from '../constants/scenarios';
import { reviewOutputDocumentsSchema, submitOutputDocumentsSchema } from '../validators/output-document.validator';

const project = {
  id: 'project-1',
  name: 'Tender Project',
  customer: 'Customer',
  scenario_id: 'scenario-1',
  sales_id: 'sales-1',
  pic_id: 'sa-pic-1',
  status: 'ACTIVE',
  is_postponed: false,
};

const actor = (userId: string, role: string) => ({ userId, role, fullName: role });

assert.equal(resolveScenarioKey('Pra-Tender'), 'PRA_TENDER');
assert.equal(resolveScenarioKey('On Submission Tender'), 'ON_SUBMISSION_TENDER');
assert.equal(resolveScenarioKey('Existing TOR'), 'ON_SUBMISSION_TENDER');
assert.equal(resolveScenarioKey('Assessment'), 'PRA_TENDER');
assert.equal(resolveScenarioKey('Pre-submission discovery'), 'PRA_TENDER');
const praTenderKeys = new Set(getScenarioDocuments('Pra-Tender').map((document) => document.key));
const submissionKeys = new Set(getScenarioDocuments('On Submission Tender').map((document) => document.key));
assert(praTenderKeys.has('proposal_deck_solusi'), 'Pra-Tender must include its pre-tender checklist.');
assert(praTenderKeys.has('proposal_teknis'), 'Pra-Tender must also include the submission-tender checklist.');
assert(!submissionKeys.has('proposal_deck_solusi'), 'On Submission Tender must not inherit pre-tender-only output items.');
assert(submissionKeys.has('proposal_teknis'), 'On Submission Tender must include its own checklist.');
console.log('Test 1 - Scenario output checklist mapping: passed');

assert(canReadNonFinalOutput(project, actor('head-1', 'HEAD_SA')));
assert(canReadNonFinalOutput(project, actor('sa-pic-1', 'SA')));
assert(!canReadNonFinalOutput(project, actor('sa-other-1', 'SA')));
assert(!canReadNonFinalOutput(project, actor('sales-1', 'SALES')));
assert(!canReadNonFinalOutput(project, actor('admin-1', 'SUPER_ADMIN')));
console.log('Test 2 - Pending and revision output metadata is limited to Head SA and the assigned PIC: passed');

assert(canAccessProject(project, actor('sales-1', 'SALES')));
assert(canAccessProject(project, actor('sa-pic-1', 'SA')));
assert(canAccessProject(project, actor('head-1', 'HEAD_SA')));
assert(canAccessProject(project, actor('admin-1', 'SUPER_ADMIN')));
assert(!canAccessProject(project, actor('sales-other-1', 'SALES')));
assert(!canAccessProject(project, actor('sa-other-1', 'SA')));
console.log('Test 3 - Approved output stays behind canonical project access for owner Sales, assigned SA, Head SA, and Super Admin: passed');

assert(canUploadOutput(project, actor('sa-pic-1', 'SA')));
assert(!canUploadOutput(project, actor('head-1', 'HEAD_SA')));
assert(!canUploadOutput(project, actor('sales-1', 'SALES')));
assert(!canUploadOutput({ ...project, is_postponed: true }, actor('sa-pic-1', 'SA')));
assert(!canUploadOutput({ ...project, status: 'DRAFT' }, actor('sa-pic-1', 'SA')));
console.log('Test 4 - Upload and submit require an active, non-postponed project and assigned PIC: passed');

const versionOne = { document_key: 'proposal_teknis', expected_version_id: '11111111-1111-4111-8111-111111111111' };
const versionTwo = { document_key: 'timeline_proyek', expected_version_id: '22222222-2222-4222-8222-222222222222' };
assert(submitOutputDocumentsSchema.safeParse({ items: [versionOne] }).success);
assert(submitOutputDocumentsSchema.safeParse({ items: [versionOne, versionTwo] }).success);
assert(!submitOutputDocumentsSchema.safeParse({ items: [{ document_key: 'proposal_teknis', expected_version_id: null }] }).success);
assert(!submitOutputDocumentsSchema.safeParse({ items: [{ document_key: 'proposal_teknis' }] }).success);
assert(!submitOutputDocumentsSchema.safeParse({ items: [] }).success);
assert(!submitOutputDocumentsSchema.safeParse({ items: [versionOne, versionOne] }).success);
assert(isCurrentOutputVersion(versionOne.expected_version_id, versionOne.expected_version_id));
assert(!isCurrentOutputVersion(versionOne.expected_version_id, versionTwo.expected_version_id));
assert(!isCurrentOutputVersion(versionOne.expected_version_id, null));
assert(isOutputReadyForSubmission('DRAFT', true));
assert(isOutputReadyForSubmission('REVISION_REQUIRED', true));
assert(!isOutputReadyForSubmission('APPROVED', true));
assert(!isOutputReadyForSubmission('DRAFT', false));
console.log('Test 5 - Partial submission accepts selected ready documents and rejects duplicates or stale states: passed');

assert(reviewOutputDocumentsSchema.safeParse({ decision: 'APPROVE', items: [versionOne, versionTwo] }).success);
assert(!reviewOutputDocumentsSchema.safeParse({ decision: 'REVISE', items: [versionOne] }).success);
assert(reviewOutputDocumentsSchema.safeParse({ decision: 'REVISE', feedback: 'Please revise the budget.', items: [versionOne] }).success);
assert(!reviewOutputDocumentsSchema.safeParse({ decision: 'REVISE', feedback: 'Revise both.', items: [versionOne, versionTwo] }).success);
assert(isOutputReadyForReview('IN_REVIEW') && !isOutputReadyForReview('APPROVED'));
console.log('Test 6 - Batch approval and per-document revision validation are enforced: passed');

const notificationNames = formatOutputDocumentNames(
  ['proposal_teknis', 'timeline_proyek', 'identitas_barang_produk', 'spesifikasi_teknis_toc'],
  getScenarioDocuments('On Submission Tender')
);
assert(notificationNames.includes('Proposal Teknis') && notificationNames.includes('and 1 more'));
console.log('Test 7 - Output notification names are capped to three visible entries: passed');

assert(!areSelectedProjectOutputsApproved([
  { is_required: true, is_selected: true, status: 'APPROVED' },
  { is_required: false, is_selected: true, status: 'DRAFT' },
]));
assert(areSelectedProjectOutputsApproved([
  { is_required: true, is_selected: true, status: 'APPROVED' },
  { is_required: false, is_selected: false, status: 'DRAFT' },
]));
console.log('Test 8 - Partial submission does not satisfy project output completion: passed');

const migrationPath = path.resolve(__dirname, '../../supabase/phase12-project-output-documents.sql');
const migration = readFileSync(migrationPath, 'utf8');
assert(migration.includes("update public.scenarios set name = 'Pra-Tender'"));
assert(migration.includes("update public.scenarios set name = 'On Submission Tender'"));
assert(migration.includes("'WAITING_RESULT', 'WON', 'LOST'"));
assert(migration.includes("select od.storage_path as path"));
assert(!migration.includes('update public.workflow_stages'));
assert(!migration.includes('update public.project_milestones'));
assert(migration.includes('estimated_revenue') && migration.includes('final_contract_value') && migration.includes('loss_reason'));
assert(migration.includes("projects_outcome_details_check"));
console.log('Test 9 - Phase 12 preserves milestones, captures output storage paths, and stores distinct commercial outcomes: passed');

const revisionMigrationPath = path.resolve(__dirname, '../../supabase/phase13-output-document-revisions.sql');
const revisionMigration = readFileSync(revisionMigrationPath, 'utf8');
assert(revisionMigration.includes('create table if not exists public.project_output_document_versions'));
assert(revisionMigration.includes('create_project_output_document_version'));
assert(revisionMigration.includes('transition_project_output_document_version'));
assert(revisionMigration.includes('p_expected_version_id'));
assert(revisionMigration.includes('select version.storage_path as path'));
assert(revisionMigration.includes('update public.project_output_documents set current_version_id = null'));
assert(!revisionMigration.includes('update public.project_milestones'));
const outputDocumentService = readFileSync(path.resolve(__dirname, './output-document.service.ts'), 'utf8');
assert(outputDocumentService.includes('current_version_id'));
assert(outputDocumentService.includes("if (versionError) {"));
assert(outputDocumentService.includes('Output document version history is unavailable'));
console.log('Test 10 - Version history, CAS transitions, and exact-path deletion cleanup are migration-backed: passed');

assert(revisionMigration.includes('\nbegin;'));
assert(revisionMigration.trimEnd().endsWith('select count(*) from public.project_output_documents where storage_path is not null and current_version_id is null;'));
assert(revisionMigration.includes('lock table public.projects, public.project_output_documents in share row exclusive mode;'));
assert(revisionMigration.includes("when od.status in ('DRAFT', 'IN_REVIEW', 'REVISION_REQUIRED', 'APPROVED') then od.status"));
assert(revisionMigration.includes('and od.current_version_id is null'));
assert(revisionMigration.includes('foreign key (current_version_id, id)'));
assert(revisionMigration.includes('v_document.current_version_id is distinct from p_expected_version_id'));
assert(revisionMigration.includes("where id = p_expected_version_id\n    and output_document_id = v_document.id\n    and status = v_document.status;"));
assert(revisionMigration.includes('\ncommit;'));
console.log('Test 11 - Phase 13 is transactional, backfills existing file state, and enforces version CAS: passed');

assert(outputDocumentService.includes("'OUTPUT_DOCUMENT_UPLOADED'"));
assert(outputDocumentService.includes("'OUTPUT_DOCUMENTS_SUBMITTED'"));
assert(outputDocumentService.includes("'OUTPUT_DOCUMENTS_APPROVED'"));
assert(outputDocumentService.includes("'OUTPUT_DOCUMENTS_REVISION_REQUESTED'"));
assert(outputDocumentService.includes("runNotificationBestEffort('submit output documents notification'"));
assert(outputDocumentService.includes("runNotificationBestEffort('review output documents notification'"));
assert(outputDocumentService.includes('actionUrl: `/projects/${project.id}#output-documents`'));
console.log('Test 12 - Output actions retain activity timeline events and best-effort deep-linked notifications: passed');
