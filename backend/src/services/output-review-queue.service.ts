import { ALL_OUTPUT_DEFINITIONS, getProjectDocumentDefinitions } from '../constants/scenarios';
import { canReadNonFinalOutput, isOutputReadyForReview } from './output-document.service';
import { readApprovalRows } from './approval-rows';

const one = (relation: any) => Array.isArray(relation) ? relation[0] : relation;
function invalid(): never { throw new Error('Failed to load approval overview.'); }

export async function outputReviewQueue(projects: any[], milestones: any[], actor: { userId: string; role: string; fullName?: string }) {
  // SUPER_ADMIN has approved-only output access in the existing document policy.
  const visible = projects.filter(project => canReadNonFinalOutput(project, { ...actor, fullName: actor.fullName || '' }));
  if (!visible.length) return [];
  const projectsById = new Map(visible.map(project => [project.id, project]));
  const milestonesById = new Map(milestones.map(milestone => [milestone.id, milestone]));
  const { data: rows } = await readApprovalRows('project_output_documents',
    'id,project_id,phase_id,document_key,milestone_id,is_required,is_selected,status,current_version_id',
    { column: 'project_id', ids: visible.map(project => project.id) }, undefined, { column: 'status', value: 'IN_REVIEW' });
  const selected = rows.filter(row => row.is_required || row.is_selected
    || ALL_OUTPUT_DEFINITIONS.some(definition => definition.key === row.document_key && definition.isRequired));
  if (!selected.length) return [];
  if (selected.some(row => !row.current_version_id)) invalid();
  const { data: versions } = await readApprovalRows('project_output_document_versions',
    'id,project_id,output_document_id,version_number,status,snapshot_kind,submitted_at,submission_actor_id',
    { column: 'id', ids: selected.map(row => row.current_version_id) });
  const versionIds = versions.map(version => version.id);
  const { data: refs } = await readApprovalRows('project_output_document_version_files',
    'version_id,output_document_id,project_id,file_id,position', { column: 'version_id', ids: versionIds },
    undefined, undefined, ['version_id', 'file_id']);
  const [files, users] = await Promise.all([
    readApprovalRows('project_output_document_files', 'id,output_document_id,project_id', { column: 'id', ids: refs.map(ref => ref.file_id) }),
    readApprovalRows('users', 'id,full_name,role', { column: 'id', ids: versions.map(version => version.submission_actor_id).filter(Boolean) }),
  ]);
  const versionMap = new Map(versions.map(row => [row.id, row]));
  const fileMap = new Map(files.data.map(row => [row.id, row]));
  const userMap = new Map(users.data.map(row => [row.id, row]));
  const refMap = new Map<string, any[]>();
  for (const ref of refs) refMap.set(ref.version_id, [...(refMap.get(ref.version_id) || []), ref]);
  return selected.map(row => {
    const project = projectsById.get(row.project_id);
    const milestone = milestonesById.get(row.milestone_id);
    const stage = one(milestone?.workflow_stage);
    const phase = (project?.phases || []).find((value: any) => value.id === row.phase_id);
    const definition = ALL_OUTPUT_DEFINITIONS.find(value => value.key === row.document_key);
    const version = versionMap.get(row.current_version_id);
    const snapshotRefs = refMap.get(row.current_version_id) || [];
    const hasPhases = Boolean(project?.active_phase_id);
    const legacyDefinitions = getProjectDocumentDefinitions(one(project?.scenario)?.name || '', false);
    if (!project || !definition || !milestone || milestone.project_id !== project.id
      || !row.is_selected || row.is_required !== definition.isRequired
      || (hasPhases && !(project.phases || []).some((value: any) => value.id === project.active_phase_id && value.project_id === project.id))
      || (!hasPhases && !one(project.scenario)?.name)
      || !stage || stage.stage_key !== definition.stageKey || stage.default_role !== 'SA'
      || (hasPhases ? (!phase || phase.project_id !== project.id || phase.phase_key !== definition.group
          || phase.scenario_id !== stage.scenario_id || milestone.phase_id !== phase.id)
        : (row.phase_id != null || milestone.phase_id != null || stage.scenario_id !== project.scenario_id
          || !legacyDefinitions.some(value => value.key === row.document_key)))
      || !isOutputReadyForReview(row.status) || !version || version.project_id !== project.id
      || version.output_document_id !== row.id || version.status !== 'IN_REVIEW'
      || !['SUBMITTED', 'LEGACY_SUBMITTED'].includes(version.snapshot_kind)
      || (version.submitted_at != null && !Number.isFinite(Date.parse(version.submitted_at)))
      || !Number.isInteger(version.version_number) || version.version_number < 1
      || snapshotRefs.length < 1 || snapshotRefs.length > 10
      || new Set(snapshotRefs.map(ref => ref.file_id)).size !== snapshotRefs.length
      || new Set(snapshotRefs.map(ref => ref.position)).size !== snapshotRefs.length
      || snapshotRefs.some(ref => ref.output_document_id !== row.id || ref.project_id !== project.id
        || !Number.isInteger(ref.position) || ref.position <= 0
        || fileMap.get(ref.file_id)?.output_document_id !== row.id || fileMap.get(ref.file_id)?.project_id !== project.id)
      || (version.snapshot_kind === 'SUBMITTED' && (!version.submitted_at || !version.submission_actor_id))) invalid();
    const reason = project.is_postponed ? 'POSTPONED'
      : project.status !== 'ACTIVE' ? 'PROJECT_NOT_ACTIVE'
      : project.active_phase_id != null && project.active_phase_id !== row.phase_id ? 'PHASE_NOT_ACTIVE'
      : milestone.status !== 'IN_PROGRESS' ? 'MILESTONE_NOT_ACTIVE' : null;
    const submitter = userMap.get(version.submission_actor_id);
    return {
      id: `output:${row.id}`, category: 'OUTPUT_DOCUMENT' as const, status: 'PENDING' as const, isCurrentApproval: true,
      title: definition.name, projectId: project.id, projectName: project.name, projectCode: project.id.slice(0, 8),
      clientName: project.customer || '-', targetEntityId: row.id, outputId: row.id, documentKey: row.document_key,
      milestoneId: milestone.id, milestoneName: milestone.name, stepOrder: milestone.step_order,
      phaseId: row.phase_id || null, phaseKey: phase?.phase_key || definition.group,
      phaseName: phase?.phase_key === 'ON_SUBMISSION_TENDER' ? 'On Submission Tender'
        : phase ? 'Pra-Tender' : one(project.scenario)?.name || null,
      snapshotId: version.id, versionNumber: version.version_number, fileCount: snapshotRefs.length,
      submittedBy: submitter?.full_name || '', submittedAt: version.submitted_at || '', requestedAt: version.submitted_at || '',
      canReview: actor.role === 'HEAD_SA' && reason === null, reviewBlockedReason: reason,
    };
  });
}
