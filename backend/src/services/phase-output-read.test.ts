import { installRestrictedRepositoryFixture } from '../test-utils/repository-access.fixture';
import assert from 'node:assert/strict';
import { supabaseAdmin } from '../config/supabase';
import { ALL_OUTPUT_DEFINITIONS, getMandatoryDocumentKeys } from '../constants/scenarios';
import { OutputDocumentService } from './output-document.service';
import { DocumentStorageService } from '../utils/storage.util';

async function main() {
  const phases = [{ id: 'pra', scenario_id: 's-pra', phase_key: 'PRA_TENDER', selected_document_keys: ['proposal_deck_solusi'] },
    { id: 'tender', scenario_id: 's-tender', phase_key: 'ON_SUBMISSION_TENDER', selected_document_keys: getMandatoryDocumentKeys('ON_SUBMISSION_TENDER') }];
  const project = { id: 'p', name: 'Project', customer: 'Customer', scenario_id: 's-pra', current_scenario_id: 's-tender',
    active_phase_id: 'tender', phases, sales_id: 'sales', pic_id: 'sa', status: 'ACTIVE', is_postponed: false,
    selected_document_keys: phases[1].selected_document_keys, scenario: { name: 'Pra-Tender' }, active_scenario: { name: 'On Submission Tender' } };
  const outputs = ALL_OUTPUT_DEFINITIONS.filter(def => phases.some(phase => phase.selected_document_keys.includes(def.key))).map(def => {
    const phase = phases.find(phase => phase.phase_key === def.group)!;
    return { id: def.key, project_id: 'p', phase_id: phase.id, document_key: def.key, title: def.name,
      milestone_id: `${phase.id}-${def.stageKey}`, is_required: def.isRequired, is_selected: true,
      status: def.group === 'PRA_TENDER' ? 'APPROVED' : def.key === 'timeline_proyek' ? 'IN_REVIEW' : 'TO_DO',
      current_version_id: ['proposal_deck_solusi', 'timeline_proyek'].includes(def.key) ? `version-${def.key}` : null };
  });
  const versions = outputs.filter(output => output.current_version_id).map(output => ({ id: output.current_version_id,
    project_id: 'p', output_document_id: output.id, status: output.status, version_number: 2, snapshot_kind: 'SUBMITTED' }));
  const refs = versions.flatMap(version => [0, 1].map(position => ({ project_id: 'p', output_document_id: version.output_document_id,
    version_id: version.id, file_id: `${version.id}-file-${position}`, position })));
  const files = refs.map(ref => ({ id: ref.file_id, output_document_id: ref.output_document_id, project_id: 'p',
    file_name: `part-${ref.position}.pdf`, file_size: 123, storage_path: `mock/${ref.file_id}`, mime_type: 'application/pdf' }));
  const milestones = outputs.map(output => ({ id: output.milestone_id, project_id: 'p', phase_id: output.phase_id,
    status: output.phase_id === 'pra' ? 'COMPLETED' : 'IN_PROGRESS', workflow_stage: { stage_key: ALL_OUTPUT_DEFINITIONS.find(def => def.key === output.document_key)!.stageKey,
      default_role: 'SA', scenario_id: output.phase_id === 'pra' ? 's-pra' : 's-tender' } }));
  const uniqueMilestones = [...new Map(milestones.map(row => [row.id, row])).values()];
  const tables: Record<string, any[]> = { projects: [project], project_milestones: uniqueMilestones,
    project_output_documents: outputs, project_output_document_versions: versions,
    project_output_document_version_files: refs, project_output_document_files: files,
    project_output_document_draft_files: [], project_output_file_revisions: [] };
  const from = supabaseAdmin.from, sign = DocumentStorageService.createSignedDownloadUrl;
  let signed = 0;
  const restoreAccessFixture = installRestrictedRepositoryFixture({ sales:'SALES',sa:'SA',head:'HEAD_SA',other:'SA' }, () => ({ projects: [project], outputs: tables.project_output_documents }));
  try {
    (supabaseAdmin as any).from = (table: string) => {
      assert(table in tables, table);
      const filters: Array<(row: any) => boolean> = [];
      let bounds: [number, number] | undefined;
      const result = (single = false) => {
        let data = tables[table].filter(row => filters.every(filter => filter(row)));
        if (bounds) data = data.slice(bounds[0], bounds[1] + 1);
        return { data: single ? data[0] || null : data, error: null };
      };
      const query: any = { select: () => query, eq: (key: string, value: any) => { filters.push(row => row[key] === value); return query; },
        in: (key: string, values: any[]) => { filters.push(row => values.includes(row[key])); return query; },
        order: () => query, range: (a: number, b: number) => { bounds = [a, b]; return query; },
        single: async () => result(true), maybeSingle: async () => result(true),
        then: (resolve: any) => Promise.resolve(result()).then(resolve) }; return query;
    };
    (DocumentStorageService as any).createSignedDownloadUrl = async () => { signed++; return 'https://example.invalid/mock'; };
    const head = await OutputDocumentService.list('p', { userId: 'head', role: 'HEAD_SA', fullName: 'Head' });
    assert(head.documents.some(output => output.key === 'proposal_deck_solusi' && output.status === 'APPROVED'));
    assert.equal(head.documents.find(output => output.key === 'timeline_proyek')?.files.length, 2);
    assert.equal(head.documents.find(output => output.key === 'timeline_proyek')?.currentVersionNumber, 2);
    assert.equal(head.unapprovedCount, 4, 'Active tender gate excludes the completed previous phase');
    // Current snapshot feedback is scoped by exact version/file identity; draft changes
    // retain the unmarked file and do not erase the historical review marker.
    const timeline = outputs.find(output => output.document_key === 'timeline_proyek')!;
    timeline.status = 'REVISION_REQUIRED';
    versions.find(version => version.id === timeline.current_version_id)!.status = 'REVISION_REQUIRED';
    const timelineRefs = refs.filter(ref => ref.version_id === timeline.current_version_id);
    tables.project_output_document_draft_files = timelineRefs.map(ref => ({ ...ref }));
    tables.project_output_file_revisions = [{ version_id: timeline.current_version_id, file_id: timelineRefs[0].file_id, feedback: 'Correct the figures.' }];
    let revised = await OutputDocumentService.list('p', { userId: 'head', role: 'HEAD_SA', fullName: 'Head' });
    assert.equal(revised.documents.find(output => output.key === 'timeline_proyek')?.fileRevisions?.[0].fileId, timelineRefs[0].file_id);
    assert.equal(revised.canSubmit, false, 'Original marked file still blocks submit');
    const retained = timelineRefs[1].file_id;
    tables.project_output_document_draft_files = timelineRefs.slice(1).map(ref => ({ ...ref }));
    revised = await OutputDocumentService.list('p', { userId: 'head', role: 'HEAD_SA', fullName: 'Head' });
    assert.equal(revised.canSubmit, true, 'Removing one marked file retains a valid unmarked file');
    assert.deepEqual(revised.documents.find(output => output.key === 'timeline_proyek')?.draftFiles.map(file => file.id), [retained]);
    const revisionHistory = await OutputDocumentService.listVersions('p', 'timeline_proyek', { userId: 'head', role: 'HEAD_SA', fullName: 'Head' });
    assert.equal(revisionHistory.versions[0].fileRevisions.length, 1);
    assert.equal(revisionHistory.versions[0].files.length, 2, 'Historical snapshot is unchanged by draft removal');
    tables.project_output_document_draft_files.push({ ...timelineRefs[0] });
    revised = await OutputDocumentService.list('p', { userId: 'head', role: 'HEAD_SA', fullName: 'Head' });
    assert.equal(revised.canSubmit, false, 'Restoring the original file identity blocks submit again');
    const sales = await OutputDocumentService.list('p', { userId: 'sales', role: 'SALES', fullName: 'Sales' });
    assert.deepEqual(sales.documents.map(output => output.key), ['proposal_deck_solusi']);
    assert.equal(sales.documents[0].files.length, 2);
    const download = await OutputDocumentService.getFileDownloadUrl('p', 'proposal_deck_solusi', refs[0].file_id,
      { userId: 'sales', role: 'SALES', fullName: 'Sales' });
    assert(download.url); assert.equal(signed, 1);
    await assert.rejects(OutputDocumentService.getFileDownloadUrl('p', 'timeline_proyek', refs.at(-1)!.file_id,
      { userId: 'sales', role: 'SALES', fullName: 'Sales' }));
    assert.equal(signed, 1, 'Denied non-final access cannot request a signed URL');
    await assert.rejects(OutputDocumentService.list('p', { userId: 'other', role: 'SA', fullName: 'Other' }));
    outputs[0].phase_id = 'tender';
    await assert.rejects(OutputDocumentService.list('p', { userId: 'head', role: 'HEAD_SA', fullName: 'Head' }));
    // Close at Pra-Tender keeps the exact approved snapshot and file references.
    outputs[0].phase_id = 'pra'; // Undo the deliberate mismatch from the preceding case.
    project.status = 'COMPLETED'; project.active_phase_id = 'pra'; project.current_scenario_id = 's-pra';
    project.selected_document_keys = phases[0].selected_document_keys;
    phases.splice(1); // This independent closure fixture has never created tender.
    project.active_scenario = { name: 'Pra-Tender' };
    tables.project_output_documents = outputs.filter(row => row.phase_id === 'pra');
    tables.project_milestones = uniqueMilestones.filter(row => row.phase_id === 'pra');
    const before = JSON.stringify([versions, refs, files]);
    const closedOutputs = await OutputDocumentService.list('p', { userId: 'sales', role: 'SALES', fullName: 'Sales' });
    assert.equal(closedOutputs.documents[0].status, 'APPROVED');
    assert.equal(closedOutputs.documents[0].files.length, 2);
    const history = await OutputDocumentService.listVersions('p', 'proposal_deck_solusi', { userId: 'head', role: 'HEAD_SA', fullName: 'Head' });
    assert(history.versions.length > 0);
    const historicalDownload = await OutputDocumentService.getVersionDownloadUrl('p', 'proposal_deck_solusi', versions[0].id!, { userId: 'head', role: 'HEAD_SA', fullName: 'Head' });
    assert(historicalDownload.url);
    const closedSalesDownload = await OutputDocumentService.getFileDownloadUrl('p', 'proposal_deck_solusi', refs[0].file_id, { userId: 'sales', role: 'SALES', fullName: 'Sales' });
    assert(closedSalesDownload.url);
    assert.equal(JSON.stringify([versions, refs, files]), before, 'Closure cannot alter files or review history');
    console.log('Both-phase output reads, preserved immutable files, current gate, Sales privacy and historical signed download passed (mocks)');
  } finally { restoreAccessFixture(); (supabaseAdmin as any).from = from; (DocumentStorageService as any).createSignedDownloadUrl = sign; }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
