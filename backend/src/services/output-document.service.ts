import { supabaseAdmin } from '../config/supabase';
import { canAccessProject, getAccessibleProjectIds } from './project-access.service';
import {
  buildOutputDocumentStoragePath,
  DocumentStorageService,
  isAllowedDocumentFileName,
  MAX_DOCUMENT_FILE_SIZE_BYTES,
} from '../utils/storage.util';
import {
  getMandatoryDocumentKeys,
  getScenarioDocuments,
  OutputDocumentStatus,
  resolveScenarioKey,
  ScenarioDocumentDefinition,
} from '../constants/scenarios';
import {
  ReviewOutputDocumentsInput, SubmitOutputDocumentsInput,
  UploadOutputDocumentFileInput, RemoveOutputDocumentFileInput,
} from '../validators/output-document.validator';
import {
  advanceToNextMilestone,
  areSelectedProjectOutputsApproved,
  isMilestoneCompletedLike,
  logWorkflowActivityBestEffort,
} from './workflow-progression.service';
import { OutputNotificationOutboxWorker } from './output-notification-outbox.worker';
import zlib from 'zlib';
import { getDateOnlyKeyInTimeZone } from '../utils/dates';
import { createHash } from 'crypto';

export const MAX_OUTPUT_DOCUMENT_FILES = 10;
export const MAX_OUTPUT_DOCUMENT_TOTAL_SIZE_BYTES = 200 * 1024 * 1024;
// Bound source buffers, compressed copies and the final ZIP per request.
export const MAX_OUTPUT_ARCHIVE_SOURCE_BYTES = 100 * 1024 * 1024;
// Only known PostgreSQL transaction failures establish an unused upload.
// A transport/provider code (even five characters long) remains uncertain.
const CONFIRMED_DRAFT_TRANSACTION_FAILURES = new Set([
  '40001', '42501', '22023', 'P0001', 'P0002', '23502', '23503', '23505', '23514', 'XX000',
]);


function makeCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  return table;
}

const crc32Table = makeCrc32Table();

function calculateCrc32(buf: Buffer): number {
  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crc32Table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ (-1)) >>> 0;
}

interface ZipEntry {
  name: string;
  data: Buffer;
}

function createZipBuffer(entries: ZipEntry[]): Buffer {
  const localHeaders: Buffer[] = [];
  const centralHeaders: Buffer[] = [];
  let offset = 0;

  const now = new Date();
  const dosTime =
    ((now.getHours() & 0x1f) << 11) |
    ((now.getMinutes() & 0x3f) << 5) |
    ((now.getSeconds() >> 1) & 0x1f);
  const dosDate =
    (((now.getFullYear() - 1980) & 0x7f) << 9) |
    (((now.getMonth() + 1) & 0x0f) << 5) |
    (now.getDate() & 0x1f);

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name, 'utf8');
    const crc = calculateCrc32(entry.data);
    const compressedData = zlib.deflateRawSync(entry.data);
    const uncompressedSize = entry.data.length;
    const compressedSize = compressedData.length;

    const localHeader = Buffer.alloc(30 + nameBuffer.length);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressedSize, 18);
    localHeader.writeUInt32LE(uncompressedSize, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);
    nameBuffer.copy(localHeader, 30);

    localHeaders.push(localHeader, compressedData);

    const centralHeader = Buffer.alloc(46 + nameBuffer.length);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressedSize, 20);
    centralHeader.writeUInt32LE(uncompressedSize, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    nameBuffer.copy(centralHeader, 46);

    centralHeaders.push(centralHeader);

    offset += localHeader.length + compressedData.length;
  }

  const centralDirectoryOffset = offset;
  const centralDirectorySize = centralHeaders.reduce((acc, b) => acc + b.length, 0);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectorySize, 12);
  eocd.writeUInt32LE(centralDirectoryOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
}

type Actor = { userId: string; role: string; fullName: string };
type OutputProject = {
  id: string;
  name: string;
  customer: string;
  scenario_id: string;
  sales_id: string | null;
  pic_id: string | null;
  status: string;
  is_postponed?: boolean | null;
  selected_document_keys?: string[] | null;
  scenario?: unknown;
};

export const canReadNonFinalOutput = (project: OutputProject, actor: Actor): boolean =>
  actor.role === 'HEAD_SA'
  || (project.pic_id === actor.userId && (actor.role === 'SA' || actor.role === 'HEAD_SA'));

export const canUploadOutput = (project: OutputProject, actor: Actor): boolean =>
  project.status === 'ACTIVE'
  && !project.is_postponed
  && project.pic_id === actor.userId
  && (actor.role === 'SA' || actor.role === 'HEAD_SA');

export const isOutputReadyForSubmission = (status: string, hasFile: boolean): boolean =>
  hasFile && (status === 'DRAFT' || status === 'REVISION_REQUIRED');

export const isOutputReadyForReview = (status: string): boolean => status === 'IN_REVIEW';

export const isCurrentOutputVersion = (
  expectedVersionId: string,
  currentVersionId: string | null | undefined
): boolean => Boolean(currentVersionId) && expectedVersionId === currentVersionId;

export const formatOutputDocumentNames = (
  documentKeys: string[],
  definitions: ScenarioDocumentDefinition[],
  limit = 3
): string => {
  const names = documentKeys
    .map((key) => definitions.find((definition) => definition.key === key)?.name)
    .filter((name): name is string => Boolean(name));
  const shown = names.slice(0, limit);
  const remainder = names.length - shown.length;
  return remainder > 0 ? `${shown.join(', ')} and ${remainder} more` : shown.join(', ');
};

export class OutputDocumentError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = 'OutputDocumentError';
  }
}

export interface OutputDocumentItem {
  id: string;
  projectId: string;
  key: string;
  milestoneId: string;
  name: string;
  group: 'PRA_TENDER' | 'ON_SUBMISSION_TENDER';
  isRequired: boolean;
  isSelected: boolean;
  status: OutputDocumentStatus;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  uploadedAt?: string | null;
  uploadedBy?: { id: string; fullName: string; role: string } | null;
  downloadUrl?: string | null;
  reviewedAt?: string | null;
  reviewedBy?: { id: string; fullName: string; role: string } | null;
  reviewFeedback?: string | null;
  currentVersionId?: string | null;
  versionCount?: number;
  legacyVersionCount?: number;
  draftRevision: number;
  draftFiles: OutputDocumentFile[];
  files: OutputDocumentFile[];
}

export interface OutputDocumentFile {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string | null;
  uploadedAt: string;
  uploadedBy?: { id: string; fullName: string; role: string } | null;
}

type StoredOutputFile = OutputDocumentFile & { outputDocumentId: string; projectId: string; storagePath: string };

export const isValidOutputDraftFileSet = (files: OutputDocumentFile[]): boolean => files.length > 0
  && files.length <= MAX_OUTPUT_DOCUMENT_FILES
  && files.every((file) => Number.isSafeInteger(file.fileSize) && file.fileSize > 0
    && file.fileSize <= MAX_DOCUMENT_FILE_SIZE_BYTES && isAllowedDocumentFileName(file.fileName))
  && files.reduce((total, file) => total + file.fileSize, 0) <= MAX_OUTPUT_DOCUMENT_TOTAL_SIZE_BYTES;

const safeFile = ({ outputDocumentId: _outputId, projectId: _projectId, storagePath: _path, ...file }: StoredOutputFile): OutputDocumentFile => file;

const firstResult = (data: any): any => Array.isArray(data) ? data[0] : data;

type BatchItemResult = {
  documentKey: string;
  success: boolean;
  status?: OutputDocumentStatus;
  message?: string;
};

export class OutputDocumentService {
  private static async loadFileReferences(table: 'project_output_document_draft_files' | 'project_output_document_version_files', ids: string[]): Promise<Map<string, StoredOutputFile[]>> {
    const map = new Map<string, StoredOutputFile[]>();
    if (!ids.length) return map;
    const key = table === 'project_output_document_draft_files' ? 'output_document_id' : 'version_id';
    const refs: any[] = [];
    const pageSize = 250;
    for (let start = 0; start < ids.length; start += pageSize) {
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabaseAdmin.from(table).select(`${key === 'version_id' ? 'version_id,' : ''}output_document_id,project_id,file_id,position`)
          .in(key, ids.slice(start, start + pageSize)).order(key, { ascending: true })
          .order('position', { ascending: true }).order('file_id', { ascending: true }).range(offset, offset + pageSize - 1);
        if (error) throw new OutputDocumentError('Output document files are unavailable. Please refresh and try again.', 500);
        refs.push(...(data || []));
        if (!data || data.length < pageSize) break;
      }
    }
    const fileIds = [...new Set(refs.map((row) => row.file_id))];
    const files = new Map<string, any>();
    for (let offset = 0; offset < fileIds.length; offset += pageSize) {
      const { data, error } = await supabaseAdmin.from('project_output_document_files')
        .select('id,output_document_id,project_id,file_name,file_size,mime_type,uploaded_at,storage_path,uploaded_by_user:users!project_output_document_files_uploaded_by_fkey(id,full_name,role)')
        .in('id', fileIds.slice(offset, offset + pageSize));
      if (error) throw new OutputDocumentError('Output document files are unavailable. Please refresh and try again.', 500);
      for (const file of data || []) files.set(file.id, file);
    }
    for (const ref of refs) {
      const file = files.get(ref.file_id);
      if (!file || file.output_document_id !== ref.output_document_id || file.project_id !== ref.project_id || !file.storage_path) {
        throw new OutputDocumentError('Output document file reference is invalid.', 500);
      }
      const list = map.get(ref[key]) || [];
      list.push({ id: file.id, outputDocumentId: file.output_document_id, projectId: file.project_id, fileName: file.file_name,
        fileSize: Number(file.file_size) || 0, mimeType: file.mime_type, uploadedAt: file.uploaded_at,
        uploadedBy: file.uploaded_by_user ? { id: file.uploaded_by_user.id, fullName: file.uploaded_by_user.full_name, role: file.uploaded_by_user.role } : null,
        storagePath: file.storage_path });
      map.set(ref[key], list);
    }
    return map;
  }

  private static async assertOutputMilestoneIsActive(projectId: string, milestoneId: string, actor: Actor) {
    const { data: milestone, error } = await supabaseAdmin.from('project_milestones')
      .select('id,project_id,pic_id,status,start_date')
      .eq('id', milestoneId).maybeSingle();
    if (error || !milestone || milestone.project_id !== projectId) {
      throw new OutputDocumentError('Output milestone not found.', 404);
    }
    if (milestone.pic_id !== actor.userId || milestone.status !== 'IN_PROGRESS') {
      throw new OutputDocumentError('Only the active milestone PIC can work on this output.', 403);
    }
    if (milestone.start_date && milestone.start_date.slice(0, 10) > getDateOnlyKeyInTimeZone()) {
      throw new OutputDocumentError('Milestone start date has not arrived.', 409);
    }
  }

  private static async completeApprovedMilestones(projectId: string, actor: Actor, milestoneIds: string[]) {
    for (const milestoneId of [...new Set(milestoneIds)]) {
      const { data: outputs, error: outputError } = await supabaseAdmin.from('project_output_documents')
        .select('is_required,is_selected,status').eq('milestone_id', milestoneId);
      if (outputError) throw new OutputDocumentError('Failed to verify SA milestone outputs.', 500);
      if (!areSelectedProjectOutputsApproved(outputs || [])) continue;
      const { data, error } = await supabaseAdmin.rpc('complete_sa_output_milestone', {
        p_milestone_id: milestoneId,
        p_actor_id: actor.userId,
        p_allow_empty: false,
      });
      if (error) {
        if (error.message === 'Milestone is not in progress') continue;
        throw new OutputDocumentError('Failed to complete approved SA milestone.', 500);
      }
      const result = Array.isArray(data) ? data[0] : data;
      if (result?.changed) await advanceToNextMilestone(projectId, milestoneId, actor);
    }
  }

  static async listAccessibleFiles(actor: Actor, options: { approvedOnly?: boolean } = {}) {
    const approvedOnly = options.approvedOnly !== false || !['SA', 'HEAD_SA'].includes(actor.role);
    const accessibleIds = await getAccessibleProjectIds(actor);
    if (accessibleIds?.length === 0) return [];

    const rows: any[] = [];
    const pageSize = 250;
    const projectScopes = accessibleIds
      ? Array.from({ length: Math.ceil(accessibleIds.length / pageSize) }, (_, index) => accessibleIds.slice(index * pageSize, (index + 1) * pageSize))
      : [null];
    for (const scope of projectScopes) {
      for (let offset = 0; ; offset += pageSize) {
        let query = supabaseAdmin
          .from('project_output_documents')
          .select('id,project_id,document_key,milestone_id,title,is_required,is_selected,status,current_version_id,updated_at')
          .or('is_required.eq.true,is_selected.eq.true')
          .order('updated_at', { ascending: false })
          .order('id', { ascending: true })
          .range(offset, offset + pageSize - 1);
        if (scope) query = query.in('project_id', scope);
        if (approvedOnly) query = query.eq('status', 'APPROVED').not('current_version_id', 'is', null);
        const { data, error } = await query;
        if (error) throw new OutputDocumentError('Unable to list output documents.', 500);
        rows.push(...(data || []));
        if (!data || data.length < pageSize) break;
      }
    }
    if (!rows?.length) return [];

    const projectIds = [...new Set(rows.map((row) => row.project_id))];
    const versionIds = [...new Set(rows.map((row) => row.current_version_id).filter(Boolean))];
    const projectRows: any[] = [];
    const versionRows: any[] = [];
    for (let offset = 0; offset < Math.max(projectIds.length, versionIds.length); offset += pageSize) {
      const [projectsResult, versionsResult] = await Promise.all([
        offset < projectIds.length
          ? supabaseAdmin.from('projects').select('id,name,customer,sales_id,pic_id').in('id', projectIds.slice(offset, offset + pageSize))
          : Promise.resolve({ data: [], error: null }),
        offset < versionIds.length
          ? supabaseAdmin.from('project_output_document_versions').select('id,output_document_id,project_id,version_number,status,snapshot_kind').in('id', versionIds.slice(offset, offset + pageSize))
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (projectsResult.error || versionsResult.error) throw new OutputDocumentError('Unable to list output documents.', 500);
      projectRows.push(...(projectsResult.data || []));
      versionRows.push(...(versionsResult.data || []));
    }
    const projects = new Map(projectRows.map((project) => [project.id, project]));
    const versions = new Map(versionRows.map((version) => [version.id, version]));
    const versionFiles = await this.loadFileReferences('project_output_document_version_files', versionIds);
    const draftFiles = approvedOnly ? new Map<string, StoredOutputFile[]>()
      : await this.loadFileReferences('project_output_document_draft_files', rows.map((row) => row.id));
    const definitions = new Map(getScenarioDocuments('Pra-Tender').map((definition) => [definition.key, definition]));

    return rows.flatMap((row) => {
      const project = projects.get(row.project_id);
      const definition = definitions.get(row.document_key);
      const currentVersion = versions.get(row.current_version_id);
      if (!project || !canAccessProject(project, actor) || !definition || !(row.is_required || row.is_selected)
        || (row.status !== 'APPROVED' && (approvedOnly || !canReadNonFinalOutput(project as OutputProject, actor)))) return [];
      const useDraft = ['TO_DO', 'DRAFT', 'REVISION_REQUIRED'].includes(row.status);
      if (!useDraft && (!currentVersion?.version_number || currentVersion.output_document_id !== row.id
        || currentVersion.project_id !== row.project_id
        || (row.status === 'APPROVED' && currentVersion.status !== 'APPROVED'))) return [];
      const files = useDraft ? draftFiles.get(row.id) || [] : versionFiles.get(currentVersion.id) || [];
      if (!files.length || files.some((file) => file.outputDocumentId !== row.id || file.projectId !== row.project_id)) return [];
      return [{
        projectId: project.id,
        projectName: project.name,
        customer: project.customer,
        documentKey: row.document_key,
        milestoneId: row.milestone_id,
        name: row.title,
        group: definition.group,
        status: row.status,
        fileName: files[0].fileName,
        files: files.map(safeFile),
        approvedVersionId: row.status === 'APPROVED' ? currentVersion.id : null,
        versionNumber: currentVersion?.version_number || 0,
        updatedAt: row.updated_at,
      }];
    });
  }

  private static async getProject(projectId: string, actor: Actor) {
    const { data: project, error } = await supabaseAdmin
      .from('projects')
      .select('id, name, customer, scenario_id, sales_id, pic_id, status, is_postponed, selected_document_keys, scenario:scenarios!projects_scenario_id_fkey(id,name,workflow_model,workflow_version)')
      .eq('id', projectId)
      .single();

    if (error || !project) throw new OutputDocumentError('Project not found', 404);
    if (!canAccessProject(project, actor)) throw new OutputDocumentError('Forbidden', 403);
    return project;
  }

  private static async isPlanScopeLocked(projectId: string): Promise<boolean> {
    const { data, error } = await supabaseAdmin
      .from('project_plan_approvals')
      .select('id')
      .eq('project_id', projectId)
      .in('status', ['PENDING', 'APPROVED'])
      .limit(1);
    if (error) throw new OutputDocumentError('Failed to verify project plan scope lock.', 500);
    return Boolean(data?.length);
  }

  static async initializeForProject(
    projectId: string,
    scenarioIdentifier: string | undefined,
    selectedKeys?: string[]
  ): Promise<void> {
    const scenarioKey = resolveScenarioKey(scenarioIdentifier);
    const definitions = getScenarioDocuments(scenarioKey);
    const mandatoryKeys = new Set(getMandatoryDocumentKeys(scenarioKey));
    const selectedKeySet = new Set([...(selectedKeys || []), ...mandatoryKeys]);

    const { data: milestoneRows, error: milestoneError } = await supabaseAdmin
      .from('project_milestones')
      .select('id,workflow_stage:workflow_stages!project_milestones_workflow_stage_id_fkey(stage_key)')
      .eq('project_id', projectId);
    if (milestoneError) throw new OutputDocumentError('Failed to map output documents to milestones.', 500);
    const milestoneByStageKey = new Map((milestoneRows || []).map((milestone: any) => [
      (Array.isArray(milestone.workflow_stage) ? milestone.workflow_stage[0] : milestone.workflow_stage)?.stage_key,
      milestone.id,
    ]));

    const rows = definitions.filter((def) => selectedKeySet.has(def.key)).map((def) => {
      const milestoneId = milestoneByStageKey.get(def.stageKey);
      if (!milestoneId) throw new OutputDocumentError(`Missing SA milestone for ${def.key}.`, 500);
      const isSelected = selectedKeySet.has(def.key);
      const status: OutputDocumentStatus = def.isRequired || isSelected ? 'TO_DO' : 'NOT_REQUIRED';
      return {
        project_id: projectId,
        document_key: def.key,
        milestone_id: milestoneId,
        title: def.name,
        is_required: def.isRequired,
        is_selected: isSelected,
        status,
      };
    });

    const { error } = await supabaseAdmin.from('project_output_documents').upsert(rows, {
      onConflict: 'project_id,document_key', ignoreDuplicates: true,
    });
    if (error) {
      throw new OutputDocumentError('Failed to initialize project output documents.', 500);
    }
  }

  static async list(projectId: string, actor: Actor) {
    const project = await this.getProject(projectId, actor);
    const scenarioName = (project.scenario as any)?.name || project.scenario_id;
    const scenarioKey = resolveScenarioKey(scenarioName);
    const definitions = getScenarioDocuments(scenarioKey);
    const mandatoryKeys = new Set(getMandatoryDocumentKeys(scenarioKey));

    // Determine stored selected keys
    const storedSelectedKeys: string[] = Array.isArray(project.selected_document_keys)
      ? project.selected_document_keys
      : [];
    const activeSelectedKeys = new Set([...storedSelectedKeys, ...mandatoryKeys]);

    const loadRows = async (): Promise<any[]> => {
      const { data, error } = await supabaseAdmin
        .from('project_output_documents')
        .select(`
          id, project_id, document_key, milestone_id, title, is_required, is_selected, status,
          file_name, file_size, mime_type, uploaded_at, review_feedback, reviewed_at, current_version_id, draft_revision,
          uploaded_by_user:users!project_output_documents_uploaded_by_fkey(id, full_name, role),
          reviewed_by_user:users!project_output_documents_reviewed_by_fkey(id, full_name, role)
        `)
        .eq('project_id', projectId)
        .order('created_at', { ascending: true });
      if (error) throw new OutputDocumentError('Failed to retrieve output documents.', 500);
      return data || [];
    };

    const existingRows = await loadRows();

    const rowByKey = new Map<string, any>(existingRows.map((row) => [row.document_key, row]));
    const { data: milestoneRows, error: milestoneError } = await supabaseAdmin.from('project_milestones')
      .select('id,workflow_stage:workflow_stages!project_milestones_workflow_stage_id_fkey(stage_key,default_role,scenario_id)')
      .eq('project_id', projectId);
    if (milestoneError) throw new OutputDocumentError('Failed to verify output milestones.', 500);
    const milestoneById = new Map((milestoneRows || []).map((milestone: any) => [milestone.id,
      Array.isArray(milestone.workflow_stage) ? milestone.workflow_stage[0] : milestone.workflow_stage]));
    if (definitions.some((def) => {
      if (!activeSelectedKeys.has(def.key)) return false;
      const row = rowByKey.get(def.key);
      const stage: any = row && milestoneById.get(row.milestone_id);
      return !row || !stage || row.is_required !== def.isRequired || !row.is_selected
        || stage.stage_key !== def.stageKey || stage.default_role !== 'SA'
        || stage.scenario_id !== project.scenario_id || row.status === 'NOT_REQUIRED';
    })) throw new OutputDocumentError('Selected output is missing or mapped to the wrong SA milestone.', 409);
    const outputDocumentIds = existingRows.map((row) => row.id);
    const versionCounts = new Map<string, number>();
    const legacyVersionCounts = new Map<string, number>();
    if (outputDocumentIds.length > 0) {
      for (let offset = 0; ; offset += 250) {
        const { data: versionRows, error: versionError } = await supabaseAdmin
          .from('project_output_document_versions')
          .select('id,output_document_id,status,snapshot_kind')
          .in('output_document_id', outputDocumentIds).order('id', { ascending: true }).range(offset, offset + 249);
        if (versionError) {
          throw new OutputDocumentError('Output document version history is unavailable. Please contact an administrator.', 500);
        }
        for (const version of versionRows || []) {
          if (version.snapshot_kind !== 'LEGACY_UPLOAD_UNCONFIRMED') {
            versionCounts.set(version.output_document_id, (versionCounts.get(version.output_document_id) || 0) + 1);
          } else legacyVersionCounts.set(version.output_document_id, (legacyVersionCounts.get(version.output_document_id) || 0) + 1);
        }
        if (!versionRows || versionRows.length < 250) break;
      }
    }
    const canReadNonFinal = canReadNonFinalOutput(project as OutputProject, actor);
    const visibleOutputRows = canReadNonFinal ? existingRows : existingRows.filter((row) => row.status === 'APPROVED');
    const [draftFiles, snapshotFiles] = await Promise.all([
      canReadNonFinal ? this.loadFileReferences('project_output_document_draft_files', outputDocumentIds) : Promise.resolve(new Map<string, StoredOutputFile[]>()),
      this.loadFileReferences('project_output_document_version_files', visibleOutputRows.map((row) => row.current_version_id).filter(Boolean)),
    ]);

    const isScopeLocked = project.status !== 'DRAFT' || (await this.isPlanScopeLocked(projectId));
    let canRetryCompletion = false;
    if ((actor.role === 'HEAD_SA' || (actor.role === 'SALES' && project.sales_id === actor.userId))
      && project.status === 'ACTIVE'
      && !project.is_postponed
      && areSelectedProjectOutputsApproved(existingRows)) {
      const { data: milestones, error: milestoneError } = await supabaseAdmin
        .from('project_milestones')
        .select('status')
        .eq('project_id', projectId);
      if (milestoneError) {
        console.error('[OutputDocumentService] Failed to evaluate completion retry eligibility.', { projectId });
      } else {
        canRetryCompletion = Boolean(milestones?.length)
          && milestones.every((milestone) => isMilestoneCompletedLike(milestone.status));
      }
    }

    const items: OutputDocumentItem[] = definitions.map((def: ScenarioDocumentDefinition) => {
        const row = rowByKey.get(def.key);
        const isSelected = activeSelectedKeys.has(def.key);
        const rawStatus = row?.status || (def.isRequired || isSelected ? 'TO_DO' : 'NOT_REQUIRED');

        const uploadedByUser = row?.uploaded_by_user;
        const reviewedByUser = row?.reviewed_by_user;
        const workingFiles = row ? (draftFiles.get(row.id) || []).filter((file) => file.projectId === projectId).map(safeFile) : [];
        const reviewedFiles = row ? (snapshotFiles.get(row.current_version_id) || [])
          .filter((file) => file.outputDocumentId === row.id && file.projectId === projectId).map(safeFile) : [];
        const displayFile = (['TO_DO', 'DRAFT', 'REVISION_REQUIRED'].includes(rawStatus) ? workingFiles : reviewedFiles)[0];

        return {
          id: row?.id || `${projectId}-${def.key}`,
          projectId,
          key: def.key,
          milestoneId: row?.milestone_id || '',
          name: def.name,
          group: def.group,
          isRequired: def.isRequired,
          isSelected,
          status: rawStatus,
          fileName: displayFile?.fileName || null,
          fileSize: displayFile?.fileSize ?? null,
          mimeType: displayFile?.mimeType || null,
          uploadedAt: displayFile?.uploadedAt || null,
          uploadedBy: uploadedByUser ? { id: uploadedByUser.id, fullName: uploadedByUser.full_name, role: uploadedByUser.role } : null,
          downloadUrl: null,
          reviewedAt: row?.reviewed_at || null,
          reviewedBy: reviewedByUser ? { id: reviewedByUser.id, fullName: reviewedByUser.full_name, role: reviewedByUser.role } : null,
          reviewFeedback: row?.review_feedback || null,
          currentVersionId: row?.current_version_id || null,
          versionCount: row ? (versionCounts.get(row.id) || 0) : 0,
          legacyVersionCount: row ? (legacyVersionCounts.get(row.id) || 0) : 0,
          draftRevision: Number(row?.draft_revision) || 0,
          draftFiles: workingFiles,
          files: reviewedFiles,
        };
      });

    // A selected optional output becomes part of the agreed checklist too.
    const selectedItems = items.filter((item) => item.isRequired || item.isSelected);
    const missingMandatoryKeys = selectedItems.filter((item) => !(item.draftFiles.length || item.files.length)).map((item) => item.name);
    const canSubmit = selectedItems.some((item) => isOutputReadyForSubmission(item.status, isValidOutputDraftFileSet(item.draftFiles)));

    const salesPlanningView = actor.role === 'SALES' && project.sales_id === actor.userId && !isScopeLocked;
    const visibleItems = canReadNonFinal
      ? items
      : salesPlanningView
        ? items.map((item) => item.status === 'APPROVED'
          ? item
          : {
              ...item,
              status: item.isRequired || item.isSelected ? 'TO_DO' as const : 'NOT_REQUIRED' as const,
              fileName: null,
              fileSize: null,
              mimeType: null,
              uploadedAt: null,
              uploadedBy: null,
              reviewedAt: null,
              reviewedBy: null,
              reviewFeedback: null,
              currentVersionId: null,
              versionCount: 0,
              legacyVersionCount: 0,
              draftRevision: 0,
              draftFiles: [],
              files: [],
            })
        : items.filter((item) => item.status === 'APPROVED').map((item) => ({ ...item, draftRevision: 0, draftFiles: [], currentVersionId: null, versionCount: 0, legacyVersionCount: 0 }));

    return {
      scenarioKey,
      isScopeLocked,
      canSubmit: canReadNonFinal && canSubmit,
      missingMandatoryCount: missingMandatoryKeys.length,
      missingMandatoryNames: canReadNonFinal ? missingMandatoryKeys : [],
      unapprovedCount: selectedItems.filter((item) => item.status !== 'APPROVED').length,
      canRetryCompletion,
      documents: visibleItems,
      fileLimits: { maxFiles: MAX_OUTPUT_DOCUMENT_FILES, maxTotalSizeBytes: MAX_OUTPUT_DOCUMENT_TOTAL_SIZE_BYTES, maxFileSizeBytes: MAX_DOCUMENT_FILE_SIZE_BYTES },
    };
  }

  static async upload(
    projectId: string,
    documentKey: string,
    file: Express.Multer.File,
    actor: Actor,
    input: UploadOutputDocumentFileInput
  ) {
    return this.uploadOutputDocument(projectId, documentKey, file, actor, input);
  }

  static async uploadOutputDocument(
    projectId: string,
    documentKey: string,
    file: Express.Multer.File,
    actor: Actor,
    input: UploadOutputDocumentFileInput
  ) {
    const project = await this.getProject(projectId, actor);
    if (project.pic_id !== actor.userId || !['SA', 'HEAD_SA'].includes(actor.role)) {
      throw new OutputDocumentError('Only the assigned PIC can upload output documents.', 403);
    }

    if (!Number.isSafeInteger(file.size) || file.size <= 0 || !Buffer.isBuffer(file.buffer) || file.size !== file.buffer.length) {
      throw new OutputDocumentError('The uploaded file is empty or invalid. Choose a valid file.', 400);
    }
    if (file.size > MAX_DOCUMENT_FILE_SIZE_BYTES) {
      throw new OutputDocumentError('File size exceeds the 50 MB limit.');
    }
    if (!isAllowedDocumentFileName(file.originalname)) {
      throw new OutputDocumentError('File format not supported. Allowed: PDF, DOCX, XLSX, PPTX, Images, ZIP.');
    }

    const scenarioName = (project.scenario as any)?.name || project.scenario_id;
    const scenarioKey = resolveScenarioKey(scenarioName);
    const definitions = getScenarioDocuments(scenarioKey);
    const def = definitions.find((d) => d.key === documentKey);
    if (!def) {
      throw new OutputDocumentError(`Document key '${documentKey}' is not valid for this scenario.`, 404);
    }
    const selectedKeys = new Set([...(project.selected_document_keys || []), ...getMandatoryDocumentKeys(scenarioKey)]);
    if (!selectedKeys.has(documentKey)) {
      throw new OutputDocumentError('This output document is not selected for the project.', 400);
    }

    const { data: current, error: currentError } = await supabaseAdmin
      .from('project_output_documents')
      .select('id,status,draft_revision,milestone_id')
      .eq('project_id', projectId)
      .eq('document_key', documentKey)
      .maybeSingle();
    if (currentError || !current) {
      throw new OutputDocumentError('Output document was not initialized.', 409);
    }
    const contentHash = createHash('sha256').update(file.buffer).digest('hex');
    const replay = await this.hasDraftRequest(current.id, input.request_id);
    // Reuse a committed upload after a lost response, without uploading its bytes again.
    const { data: existingFile, error: existingError } = await supabaseAdmin.from('project_output_document_files')
      .select('id,output_document_id,project_id,file_name,file_size,mime_type,storage_path,uploaded_at,content_sha256')
      .eq('id', input.request_id).maybeSingle();
    if (existingError) throw new OutputDocumentError('Unable to verify this upload. Retry with the same request.', 500);
    if (existingFile && (existingFile.output_document_id !== current.id || existingFile.project_id !== projectId || existingFile.content_sha256 !== contentHash
      || existingFile.file_name !== file.originalname || Number(existingFile.file_size) !== file.size)) {
      throw new OutputDocumentError('The upload request was already used for a different file.', 409);
    }
    if (replay && !existingFile) throw new OutputDocumentError('The upload request does not match a saved file.', 409);
    if (!replay) {
      if (existingFile) throw new OutputDocumentError('The upload request was already used for a different file.', 409);
      if (!canUploadOutput(project as OutputProject, actor)) {
        throw new OutputDocumentError('Only the assigned PIC can upload output documents for an active project.', 403);
      }
      await this.assertOutputMilestoneIsActive(projectId, current.milestone_id, actor);
      if (!['TO_DO', 'DRAFT', 'REVISION_REQUIRED'].includes(current.status)) {
        throw new OutputDocumentError('This output document cannot be edited in its current state.', 409);
      }
      if (Number(current.draft_revision) !== input.expected_draft_revision) {
        throw new OutputDocumentError('This output draft changed. Refresh and try again.', 409);
      }
      const files = (await this.loadFileReferences('project_output_document_draft_files', [current.id])).get(current.id) || [];
      if (input.replace_file_id && !files.some((item) => item.id === input.replace_file_id)) {
        throw new OutputDocumentError('The draft file to replace was not found.', 409);
      }
      const keptFiles = files.filter((item) => item.id !== input.replace_file_id);
      if (keptFiles.length + 1 > MAX_OUTPUT_DOCUMENT_FILES
        || keptFiles.reduce((total, item) => total + item.fileSize, 0) + file.size > MAX_OUTPUT_DOCUMENT_TOTAL_SIZE_BYTES) {
        throw new OutputDocumentError('An output can contain at most 10 files and 200 MB in total.', 400);
      }
    }
    const storagePath = existingFile?.storage_path || buildOutputDocumentStoragePath(projectId, documentKey, file.originalname);
    const now = existingFile?.uploaded_at || new Date().toISOString();
    if (!existingFile) {
      try { await DocumentStorageService.upload(file, storagePath); }
      catch {
        // A rejected Storage response cannot prove that its exact object is absent.
        await this.recordUnusedUpload(projectId, current.id, storagePath, actor, input.request_id, true);
        throw new OutputDocumentError('Unable to confirm this upload. Retry with the same request.', 500);
      }
    }
    let mutationResponse: { data: any; error: any };
    try {
      mutationResponse = await supabaseAdmin.rpc('mutate_project_output_document_draft', {
        p_output_document_id: current.id,
        p_expected_revision: input.expected_draft_revision,
        p_request_id: input.request_id,
        p_action: input.replace_file_id ? 'REPLACE' : 'ADD',
        p_actor_id: actor.userId,
        p_target_file_id: input.replace_file_id || null,
        p_file_id: input.request_id,
        p_file_name: file.originalname,
        p_storage_path: storagePath,
        p_file_size: file.size,
        p_mime_type: file.mimetype || 'application/octet-stream',
        p_uploaded_at: now,
        p_content_sha256: contentHash,
      });
    } catch {
      if (!existingFile) await this.recordUnusedUpload(projectId, current.id, storagePath, actor, input.request_id, true);
      throw new OutputDocumentError('Unable to confirm this upload. Retry with the same request.', 500);
    }
    const { data: mutationResult, error } = mutationResponse;

    if (error) {
      if (!existingFile) await this.recordUnusedUpload(projectId, current.id, storagePath, actor, input.request_id,
        !CONFIRMED_DRAFT_TRANSACTION_FAILURES.has(error.code || ''));
      this.throwDraftMutationError(error);
    }
    const result = firstResult(mutationResult);
    if (!result?.file_id || result.draft_revision === undefined) {
      if (!existingFile) await this.recordUnusedUpload(projectId, current.id, storagePath, actor, input.request_id, true);
      throw new OutputDocumentError('Unable to confirm this upload. Retry with the same request.', 500);
    }
    if (!existingFile && result.applied === false) await this.recordUnusedUpload(projectId, current.id, storagePath, actor, input.request_id, false);
    if (result.applied) await logWorkflowActivityBestEffort(actor, projectId, 'OUTPUT_DOCUMENT_UPLOADED',
      `${actor.fullName} uploaded a file to output document '${def.name}' (${file.originalname})`);
    return this.draftReceipt(current.id, documentKey, result.file_id, Number(result.draft_revision));
  }

  private static throwDraftMutationError(error: { code?: string }): never {
    if (error.code === '40001') throw new OutputDocumentError('This output draft changed. Refresh and try again.', 409);
    if (error.code === '42501') throw new OutputDocumentError('You cannot edit this output draft.', 403);
    if (error.code === '22023' || error.code === 'P0001') throw new OutputDocumentError('This output draft cannot be changed. Refresh and check its files and status.', 409);
    throw new OutputDocumentError('Unable to save this file. Retry with the same request.', 500);
  }

  private static async hasDraftRequest(outputId: string, requestId: string): Promise<boolean> {
    const { data, error } = await supabaseAdmin.from('project_output_document_draft_requests')
      .select('request_id').eq('output_document_id', outputId).eq('request_id', requestId).maybeSingle();
    if (error) throw new OutputDocumentError('Unable to verify this request. Retry with the same request.', 500);
    // The RPC checks actor, complete payload, identity and current permissions again.
    return Boolean(data);
  }

  private static async draftReceipt(outputId: string, documentKey: string, fileId: string, draftRevision: number) {
    const { data, error } = await supabaseAdmin.from('project_output_documents').select('status').eq('id', outputId).maybeSingle();
    if (error || !data) throw new OutputDocumentError('Unable to confirm the draft change. Retry with the same request.', 500);
    return { documentKey, fileId, draftRevision, status: data.status as OutputDocumentStatus };
  }

  private static async recordUnusedUpload(projectId: string, outputId: string, storagePath: string, actor: Actor,
    requestId: string, uncertain: boolean): Promise<void> {
    // Phase 23 serializes reference checks with persistence and records uncertainty.
    // No Storage deletion here: uncertain jobs require investigation, not retry.
    try {
      const { error } = await supabaseAdmin.rpc('record_output_upload_outcome', {
        p_project_id: projectId, p_output_document_id: outputId, p_actor_id: actor.userId, p_storage_path: storagePath,
        p_uncertain: uncertain,
      });
      if (error) throw new Error('tracking failed');
    } catch {
      console.error('[OutputDocumentService] Upload outcome tracking failed.', {
        operation: 'record_output_upload_outcome', projectId, outputId, requestId, uncertain,
        uploadAttemptId: storagePath.split('/').pop()?.slice(0, 36),
      });
    }
  }

  static async removeDraftFile(projectId: string, documentKey: string, fileId: string, input: RemoveOutputDocumentFileInput, actor: Actor) {
    const project = await this.getProject(projectId, actor);
    if (project.pic_id !== actor.userId || !['SA', 'HEAD_SA'].includes(actor.role)) throw new OutputDocumentError('Only the assigned PIC can edit output documents.', 403);
    const { data: output, error } = await supabaseAdmin.from('project_output_documents').select('id,milestone_id')
      .eq('project_id', projectId).eq('document_key', documentKey).maybeSingle();
    if (error || !output) throw new OutputDocumentError('Output document not found.', 404);
    if (!await this.hasDraftRequest(output.id, input.request_id)) {
      if (!canUploadOutput(project as OutputProject, actor)) throw new OutputDocumentError('Only the assigned PIC can edit output documents.', 403);
      await this.assertOutputMilestoneIsActive(projectId, output.milestone_id, actor);
    }
    const { data, error: mutationError } = await supabaseAdmin.rpc('mutate_project_output_document_draft', {
      p_output_document_id: output.id, p_expected_revision: input.expected_draft_revision, p_request_id: input.request_id,
      p_action: 'REMOVE', p_actor_id: actor.userId, p_target_file_id: fileId, p_file_id: null,
      p_file_name: null, p_storage_path: null, p_file_size: null, p_mime_type: null, p_uploaded_at: null, p_content_sha256: null,
    });
    if (mutationError) this.throwDraftMutationError(mutationError);
    const result = firstResult(data);
    if (!result) throw new OutputDocumentError('Unable to confirm the draft change. Retry with the same request.', 500);
    // Only the reference is removed. Immutable Storage bytes remain for previous snapshots.
    return this.draftReceipt(output.id, documentKey, fileId, Number(result.draft_revision));
  }

  static async submitForReview(projectId: string, input: SubmitOutputDocumentsInput, actor: Actor) {
    return this.submitOutputDocuments(projectId, input, actor);
  }

  static async submitOutputDocuments(projectId: string, input: SubmitOutputDocumentsInput, actor: Actor) {
    const project = await this.getProject(projectId, actor);
    if (project.pic_id !== actor.userId || !['SA', 'HEAD_SA'].includes(actor.role)) {
      throw new OutputDocumentError('Only the assigned PIC can submit output documents.', 403);
    }

    const scenarioName = (project.scenario as any)?.name || project.scenario_id;
    const scenarioKey = resolveScenarioKey(scenarioName);
    const selectedKeys = new Set([...(project.selected_document_keys || []), ...getMandatoryDocumentKeys(scenarioKey)]);
    const results: BatchItemResult[] = [];
    const newlySubmittedKeys: string[] = [];

    for (const item of input.items) {
      if (!selectedKeys.has(item.document_key)) {
        results.push({ documentKey: item.document_key, success: false, message: 'This output is not selected for the project.' });
        continue;
      }

      const { data: row, error: rowError } = await supabaseAdmin
        .from('project_output_documents')
        .select('id,document_key,status,draft_revision,milestone_id')
        .eq('project_id', projectId)
        .eq('document_key', item.document_key)
        .maybeSingle();
      if (rowError || !row) {
        results.push({ documentKey: item.document_key, success: false, message: 'Output document not found.' });
        continue;
      }
      const { data: previousSubmission, error: receiptError } = await supabaseAdmin.from('project_output_document_versions')
        .select('id').eq('output_document_id', row.id).eq('submission_request_id', item.request_id).maybeSingle();
      if (receiptError) {
        results.push({ documentKey: item.document_key, success: false, message: 'Unable to verify submission. Retry with the same request.' });
        continue;
      }
      if (!previousSubmission) {
        if (!canUploadOutput(project as OutputProject, actor)) {
          throw new OutputDocumentError('Only the assigned PIC can submit output documents for an active project.', 403);
        }
        await this.assertOutputMilestoneIsActive(projectId, row.milestone_id, actor);
      }

      const { data: snapshot, error: transitionError } = await supabaseAdmin.rpc('submit_project_output_document_draft', {
        p_output_document_id: row.id,
        p_expected_revision: item.expected_draft_revision,
        p_request_id: item.request_id,
        p_actor_id: actor.userId,
        p_submission_note: input.note?.trim() || null,
      });
      if (transitionError) {
        results.push({ documentKey: item.document_key, success: false, message: transitionError.code === '40001'
          ? 'This output draft changed. Refresh and try again.' : 'The draft is empty, changed, or could not be submitted.' });
        continue;
      }
      const result = firstResult(snapshot);
      if (!result?.version_id) {
        results.push({ documentKey: item.document_key, success: false, message: 'Unable to confirm submission. Retry with the same request.' });
        continue;
      }
      if (result.created) newlySubmittedKeys.push(item.document_key);
      results.push({ documentKey: item.document_key, success: true, status: result.new_status || 'IN_REVIEW' });
    }

    const submittedKeys = newlySubmittedKeys;

    if (submittedKeys.length > 0) {
      await logWorkflowActivityBestEffort(
        actor,
        projectId,
        'OUTPUT_DOCUMENTS_SUBMITTED',
        `${actor.fullName} submitted ${submittedKeys.length} Output Document(s) for review.${input.note ? ` Note: ${input.note}` : ''}`
      );

      await OutputNotificationOutboxWorker.runOnceBestEffort();
    }

    return { success: results.every((result) => result.success), results };
  }

  static async review(projectId: string, input: ReviewOutputDocumentsInput, actor: Actor) {
    return this.reviewOutputDocument(projectId, input, actor);
  }

  static async reviewOutputDocument(projectId: string, input: ReviewOutputDocumentsInput, actor: Actor) {
    if (actor.role !== 'HEAD_SA') {
      throw new OutputDocumentError('Only Head SA can review output documents.', 403);
    }

    const project = await this.getProject(projectId, actor);

    if (project.status !== 'ACTIVE' || project.is_postponed) {
      throw new OutputDocumentError('Project is not active for output review.', 409);
    }

    const isApproval = input.decision === 'APPROVE';
    const newStatus: OutputDocumentStatus = isApproval ? 'APPROVED' : 'REVISION_REQUIRED';
    const results: BatchItemResult[] = [];
    let completionRetryRequired = false;

    for (const item of input.items) {
      const { data: row, error: rowError } = await supabaseAdmin
        .from('project_output_documents')
        .select('id,document_key,status,current_version_id,milestone_id')
        .eq('project_id', projectId)
        .eq('document_key', item.document_key)
        .maybeSingle();
      if (rowError || !row) {
        results.push({ documentKey: item.document_key, success: false, message: 'Output document not found.' });
        continue;
      }
      const { data: milestone, error: milestoneError } = await supabaseAdmin.from('project_milestones')
        .select('id,project_id,status').eq('id', row.milestone_id).maybeSingle();
      if (milestoneError || !milestone || milestone.project_id !== projectId || milestone.status !== 'IN_PROGRESS') {
        results.push({ documentKey: item.document_key, success: false, message: 'The output milestone is not active.' });
        continue;
      }
      if (!isOutputReadyForReview(row.status) || !row.current_version_id) {
        results.push({ documentKey: item.document_key, success: false, message: 'This output document is no longer awaiting review.' });
        continue;
      }
      if (!isCurrentOutputVersion(item.expected_version_id, row.current_version_id)) {
        results.push({ documentKey: item.document_key, success: false, message: 'The file changed. Refresh before reviewing.' });
        continue;
      }

      const { error: transitionError } = await supabaseAdmin.rpc('transition_project_output_document_version', {
        p_output_document_id: row.id,
        p_expected_version_id: item.expected_version_id,
        p_action: isApproval ? 'APPROVE' : 'REVISE',
        p_actor_id: actor.userId,
        p_feedback: input.feedback?.trim() || null,
        p_submission_note: null,
      });
      if (transitionError) {
        results.push({ documentKey: item.document_key, success: false, message: 'The document changed or the decision could not be saved.' });
        continue;
      }
      results.push({ documentKey: item.document_key, success: true, status: newStatus });
    }

    const reviewedKeys = results.filter((result) => result.success).map((result) => result.documentKey);

    const actionText = isApproval ? 'approved' : 'requested revision for';
    if (reviewedKeys.length > 0) {
      await logWorkflowActivityBestEffort(
        actor,
        projectId,
        isApproval ? 'OUTPUT_DOCUMENTS_APPROVED' : 'OUTPUT_DOCUMENTS_REVISION_REQUESTED',
        `${actor.fullName} ${actionText} ${reviewedKeys.length} output document(s).${input.feedback ? ` Feedback: ${input.feedback}` : ''}`
      );

      await OutputNotificationOutboxWorker.runOnceBestEffort();

      if (isApproval) {
        const { data: reviewedRows, error: reviewedError } = await supabaseAdmin
          .from('project_output_documents').select('milestone_id')
          .eq('project_id', projectId).in('document_key', reviewedKeys);
        if (reviewedError) throw new OutputDocumentError('Failed to locate reviewed milestone.', 500);
        try {
          await this.completeApprovedMilestones(projectId, actor, (reviewedRows || []).map((row) => row.milestone_id));
        } catch {
          console.error('[OutputDocumentService] Failed to reconcile SA milestone after output approval.', { projectId });
          completionRetryRequired = true;
        }
      }
    }

    return { success: results.every((result) => result.success), results, completionRetryRequired };
  }

  static async updateChecklist(projectId: string, selectedKeys: string[], actor: Actor) {
    const project = await this.getProject(projectId, actor);
    if (actor.role !== 'SALES' || project.sales_id !== actor.userId) {
      throw new OutputDocumentError('Only Sales can modify the output documents checklist.', 403);
    }

    const scenarioName = (project.scenario as any)?.name || project.scenario_id;
    const scenarioKey = resolveScenarioKey(scenarioName);
    const definitions = getScenarioDocuments(scenarioKey);
    const mandatoryKeys = new Set(getMandatoryDocumentKeys(scenarioKey));
    const allowedKeys = new Set(definitions.map((definition) => definition.key));
    if (selectedKeys.some((key) => !allowedKeys.has(key))) {
      throw new OutputDocumentError('One or more selected output documents are invalid.', 400);
    }

    const finalSelectedKeys = Array.from(new Set([...selectedKeys, ...mandatoryKeys]));
    const { data, error } = await supabaseAdmin.rpc('sync_draft_output_scope', {
      p_project_id: projectId, p_sales_id: actor.userId, p_selected_keys: finalSelectedKeys,
    });
    if (error) {
      const safeMessages = new Set([
        'Only the Sales owner may change an unlocked DRAFT scope',
        'Project plan is pending review or locked',
        'Invalid output selection for scenario',
        'DRAFT milestone already contains workflow progress',
        'An output to be removed has work or version history',
        'An output with work has an invalid milestone mapping',
        'An empty milestone has linked work or history',
        'An empty milestone has legacy submissions',
        'An empty milestone has legacy approvals',
        'Selected output has no active SA stage',
        'Final Sales stage is missing',
      ]);
      throw new OutputDocumentError(safeMessages.has(error.message) ? error.message : 'Failed to update output scope.', 409);
    }
    const result = Array.isArray(data) ? data[0] : data;

    await logWorkflowActivityBestEffort(
      actor,
      projectId,
      'OUTPUT_CHECKLIST_UPDATED',
      `${actor.fullName} updated the Output Documents Checklist`
    );

    return { success: true, selectedDocumentKeys: result?.selected_keys || finalSelectedKeys };
  }

  static async listVersions(projectId: string, documentKey: string, actor: Actor) {
    const project = await this.getProject(projectId, actor);
    if (!canReadNonFinalOutput(project as OutputProject, actor)) {
      throw new OutputDocumentError('Output document history not found', 404);
    }

    const { data: document, error: documentError } = await supabaseAdmin
      .from('project_output_documents')
      .select('id,document_key')
      .eq('project_id', projectId)
      .eq('document_key', documentKey)
      .maybeSingle();
    if (documentError || !document) throw new OutputDocumentError('Output document history not found', 404);

    const versions: any[] = [];
    for (let offset = 0; ; offset += 250) {
      const { data, error } = await supabaseAdmin
      .from('project_output_document_versions')
      .select(`
        id, version_number, snapshot_kind, status, file_name, file_size, mime_type, uploaded_at,
        submitted_at, submission_note, reviewed_at, review_feedback,
        uploaded_by_user:users!project_output_document_versions_uploaded_by_fkey(id, full_name, role),
        reviewed_by_user:users!project_output_document_versions_reviewed_by_fkey(id, full_name, role)
      `)
      .eq('output_document_id', document.id)
      .order('version_number', { ascending: false }).range(offset, offset + 249);
      if (error) throw new OutputDocumentError('Failed to retrieve output document history.', 500);
      versions.push(...(data || []));
      if (!data || data.length < 250) break;
    }
    const files = await this.loadFileReferences('project_output_document_version_files', versions.map((version) => version.id));

    return {
      documentKey,
      versions: (versions || []).map((version: any) => ({
        id: version.id,
        versionNumber: version.version_number,
        versionKind: version.snapshot_kind,
        files: (files.get(version.id) || []).filter((file) => file.outputDocumentId === document.id && file.projectId === projectId).map(safeFile),
        status: version.status,
        fileName: version.file_name,
        fileSize: version.file_size === null ? null : Number(version.file_size),
        mimeType: version.mime_type,
        uploadedAt: version.uploaded_at,
        uploadedBy: version.uploaded_by_user ? {
          id: version.uploaded_by_user.id,
          fullName: version.uploaded_by_user.full_name,
          role: version.uploaded_by_user.role,
        } : null,
        submittedAt: version.submitted_at,
        submissionNote: version.submission_note,
        reviewedAt: version.reviewed_at,
        reviewedBy: version.reviewed_by_user ? {
          id: version.reviewed_by_user.id,
          fullName: version.reviewed_by_user.full_name,
          role: version.reviewed_by_user.role,
        } : null,
        reviewFeedback: version.review_feedback,
      })),
    };
  }

  static async getVersionDownloadUrl(projectId: string, documentKey: string, versionId: string, actor: Actor) {
    const project = await this.getProject(projectId, actor);
    if (!canReadNonFinalOutput(project as OutputProject, actor)) {
      throw new OutputDocumentError('Output document version not found', 404);
    }

    const files = (await this.loadFileReferences('project_output_document_version_files', [versionId])).get(versionId) || [];
    if (!files.length) throw new OutputDocumentError('Output document version not found', 404);
    return this.getFileDownloadUrl(projectId, documentKey, files[0].id, actor, versionId);
  }

  static async getDownloadUrl(projectId: string, documentKey: string, actor: Actor) {
    const project = await this.getProject(projectId, actor);

    const { data: row, error } = await supabaseAdmin
      .from('project_output_documents')
      .select('id,current_version_id,status')
      .eq('project_id', projectId)
      .eq('document_key', documentKey)
      .maybeSingle();

    if (error || !row) {
      throw new OutputDocumentError('Output document file not found', 404);
    }
    if (row.status !== 'APPROVED' && !canReadNonFinalOutput(project as OutputProject, actor)) {
      throw new OutputDocumentError('Output document file not found', 404);
    }

    const useDraft = ['TO_DO', 'DRAFT', 'REVISION_REQUIRED'].includes(row.status);
    const map = await this.loadFileReferences(useDraft ? 'project_output_document_draft_files' : 'project_output_document_version_files',
      useDraft ? [row.id] : [row.current_version_id].filter(Boolean));
    const files = map.get(useDraft ? row.id : row.current_version_id) || [];
    if (!files.length) throw new OutputDocumentError('Output document file not found', 404);
    return this.getFileDownloadUrl(projectId, documentKey, files[0].id, actor, useDraft ? undefined : row.current_version_id);
  }

  static async getFileDownloadUrl(projectId: string, documentKey: string, fileId: string, actor: Actor, versionId?: string) {
    const project = await this.getProject(projectId, actor);
    const { data: output, error } = await supabaseAdmin.from('project_output_documents')
      .select('id,status,current_version_id').eq('project_id', projectId).eq('document_key', documentKey).maybeSingle();
    if (error || !output) throw new OutputDocumentError('Output document file not found', 404);
    const canReadWorking = canReadNonFinalOutput(project as OutputProject, actor);
    const snapshotId = versionId || (['IN_REVIEW', 'APPROVED'].includes(output.status) ? output.current_version_id : null);
    if (snapshotId) {
      const { data: version, error: versionError } = await supabaseAdmin.from('project_output_document_versions')
        .select('id,output_document_id,project_id,status').eq('id', snapshotId).maybeSingle();
      if (versionError || !version || version.output_document_id !== output.id || version.project_id !== projectId
        || (!canReadWorking && (output.status !== 'APPROVED' || version.status !== 'APPROVED' || snapshotId !== output.current_version_id))) {
        throw new OutputDocumentError('Output document file not found', 404);
      }
    } else if (!canReadWorking) {
      throw new OutputDocumentError('Output document file not found', 404);
    }
    let refQuery = supabaseAdmin.from(snapshotId ? 'project_output_document_version_files' : 'project_output_document_draft_files')
      .select('file_id').eq('output_document_id', output.id).eq('project_id', projectId).eq('file_id', fileId);
    if (snapshotId) refQuery = refQuery.eq('version_id', snapshotId);
    const { data: reference, error: refError } = await refQuery.maybeSingle();
    if (refError || !reference) throw new OutputDocumentError('Output document file not found', 404);
    const { data: file, error: fileError } = await supabaseAdmin.from('project_output_document_files')
      .select('id,file_name,storage_path').eq('id', fileId).eq('output_document_id', output.id).eq('project_id', projectId).maybeSingle();
    if (fileError || !file?.storage_path) throw new OutputDocumentError('Output document file not found', 404);
    return { fileName: file.file_name, url: await DocumentStorageService.createSignedDownloadUrl(file.storage_path, 300), expiresInSeconds: 300 };
  }

  static async downloadAllApproved(
    projectId: string,
    actor: Actor
  ): Promise<{ zipBuffer: Buffer; fileName: string }> {
    const project = await this.getProject(projectId, actor);

    const { data: approvedDocs, error } = await supabaseAdmin
      .from('project_output_documents')
      .select('id,document_key,current_version_id,status')
      .eq('project_id', projectId)
      .eq('status', 'APPROVED').or('is_required.eq.true,is_selected.eq.true');

    if (error) {
      throw new OutputDocumentError('Failed to fetch approved documents.', 500);
    }

    const versionIds = (approvedDocs || []).map((doc) => doc.current_version_id).filter(Boolean);
    const { data: versions, error: versionError } = versionIds.length
      ? await supabaseAdmin.from('project_output_document_versions').select('id,output_document_id,project_id,status').in('id', versionIds)
      : { data: [], error: null };
    if (versionError) throw new OutputDocumentError('Failed to verify approved documents.', 500);
    const versionById = new Map((versions || []).map((version) => [version.id, version]));
    const files = await this.loadFileReferences('project_output_document_version_files', versionIds);
    if (!approvedDocs?.length) {
      throw new OutputDocumentError('No approved output documents are available.', 400);
    }
    const validDocs = approvedDocs.flatMap((doc) => {
      const version = versionById.get(doc.current_version_id);
      const snapshot = files.get(doc.current_version_id) || [];
      if (!version || version.status !== 'APPROVED' || version.output_document_id !== doc.id || version.project_id !== projectId
        || !snapshot.length || snapshot.some((file) => file.outputDocumentId !== doc.id || file.projectId !== projectId)) {
        throw new OutputDocumentError('The complete archive is unavailable. Download files individually.', 409);
      }
      return snapshot.map((file) => ({ ...file, documentKey: doc.document_key }));
    });
    // Reject unknown legacy sizes and excessive totals before signing/fetching any object.
    if (validDocs.some((file) => !Number.isSafeInteger(file.fileSize) || file.fileSize <= 0
      || file.fileSize > MAX_DOCUMENT_FILE_SIZE_BYTES)) {
      throw new OutputDocumentError('Archive file sizes cannot be verified. Download files individually.', 409);
    }
    if (validDocs.reduce((total, file) => total + file.fileSize, 0) > MAX_OUTPUT_ARCHIVE_SOURCE_BYTES) {
      throw new OutputDocumentError('Download all is limited to 100 MiB. Download files individually.', 413);
    }

    const entries: ZipEntry[] = [];
    const usedFileNames = new Set<string>();

    for (const doc of validDocs) {
      try {
        const signedUrl = await DocumentStorageService.createSignedDownloadUrl(doc.storagePath, 300);
        const response = await fetch(signedUrl);
        if (!response.ok || !response.body) {
          throw new OutputDocumentError('Unable to download an approved file.', 500);
        }
        // Bound the real body too: metadata must not permit an unbounded buffer.
        const chunks: Buffer[] = [];
        let bytes = 0;
        const reader = response.body.getReader();
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            if (bytes > doc.fileSize) {
              await reader.cancel();
              throw new Error('Archive size mismatch');
            }
            chunks.push(Buffer.from(value));
          }
          if (bytes !== doc.fileSize) throw new Error('Archive size mismatch');
        } finally { reader.releaseLock(); }
        const fileBuf = Buffer.concat(chunks, bytes);

        let targetName = doc.fileName || `${doc.documentKey}.bin`;
        if (usedFileNames.has(targetName)) {
          targetName = `${doc.documentKey}_${doc.id}_${targetName}`;
        }
        usedFileNames.add(targetName);

        entries.push({
          name: targetName,
          data: fileBuf,
        });
      } catch {
        throw new OutputDocumentError('The complete archive is unavailable. Download files individually.', 500);
      }
    }

    if (entries.length === 0) {
      throw new OutputDocumentError('Gagal mengunduh berkas dokumen dari penyimpanan.', 500);
    }

    const zipBuffer = createZipBuffer(entries);
    const sanitizedProjectName = (project.name || 'project').replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `${sanitizedProjectName}_approved_output_documents.zip`;

    return {
      zipBuffer,
      fileName,
    };
  }
}
