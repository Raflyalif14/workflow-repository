import { supabaseAdmin } from '../config/supabase';
import { canAccessProject } from './project-access.service';
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
import { ReviewOutputDocumentsInput, SubmitOutputDocumentsInput } from '../validators/output-document.validator';
import {
  advanceToNextMilestone,
  areSelectedProjectOutputsApproved,
  isMilestoneCompletedLike,
  logWorkflowActivityBestEffort,
} from './workflow-progression.service';
import { NotificationService } from './notification.service';
import { runNotificationBestEffort } from './notification-dispatch.service';
import zlib from 'zlib';

const notificationService = NotificationService;

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
}

type BatchItemResult = {
  documentKey: string;
  success: boolean;
  status?: OutputDocumentStatus;
  message?: string;
};

export class OutputDocumentService {
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

  private static async isPlanApproved(projectId: string): Promise<boolean> {
    const { data } = await supabaseAdmin
      .from('project_plan_approvals')
      .select('id, status')
      .eq('project_id', projectId)
      .eq('status', 'APPROVED')
      .maybeSingle();

    return Boolean(data);
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

    const rows = definitions.map((def) => {
      const isSelected = selectedKeySet.has(def.key);
      const status: OutputDocumentStatus = def.isRequired || isSelected ? 'TO_DO' : 'NOT_REQUIRED';
      return {
        project_id: projectId,
        document_key: def.key,
        title: def.name,
        is_required: def.isRequired,
        is_selected: isSelected,
        status,
      };
    });

    const { error } = await supabaseAdmin.from('project_output_documents').upsert(rows, {
      onConflict: 'project_id,document_key',
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
          id, project_id, document_key, title, is_required, is_selected, status,
          file_name, storage_path, file_size, mime_type, uploaded_at, review_feedback, reviewed_at, current_version_id,
          uploaded_by_user:users!project_output_documents_uploaded_by_fkey(id, full_name, role),
          reviewed_by_user:users!project_output_documents_reviewed_by_fkey(id, full_name, role)
        `)
        .eq('project_id', projectId)
        .order('created_at', { ascending: true });
      if (error) throw new OutputDocumentError('Failed to retrieve output documents.', 500);
      return data || [];
    };

    let existingRows = await loadRows();

    // If no rows existed, initialize rows
    if (existingRows.length < definitions.length) {
      await this.initializeForProject(projectId, scenarioName, storedSelectedKeys);
      existingRows = await loadRows();
    }

    const rowByKey = new Map<string, any>(existingRows.map((row) => [row.document_key, row]));
    const outputDocumentIds = existingRows.map((row) => row.id);
    const versionCounts = new Map<string, number>();
    if (outputDocumentIds.length > 0) {
      const { data: versionRows, error: versionError } = await supabaseAdmin
        .from('project_output_document_versions')
        .select('output_document_id')
        .in('output_document_id', outputDocumentIds);
      if (versionError) {
        throw new OutputDocumentError('Output document version history is unavailable. Please contact an administrator.', 500);
      }
      for (const version of versionRows || []) {
        versionCounts.set(version.output_document_id, (versionCounts.get(version.output_document_id) || 0) + 1);
      }
    }

    const isScopeLocked = project.status !== 'DRAFT' || (await this.isPlanApproved(projectId));
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
        const isSelected = row ? row.is_selected : activeSelectedKeys.has(def.key);
        const rawStatus = row?.status || (def.isRequired || isSelected ? 'TO_DO' : 'NOT_REQUIRED');

        const uploadedByUser = row?.uploaded_by_user;
        const reviewedByUser = row?.reviewed_by_user;

        return {
          id: row?.id || `${projectId}-${def.key}`,
          projectId,
          key: def.key,
          name: def.name,
          group: def.group,
          isRequired: def.isRequired,
          isSelected,
          status: rawStatus,
          fileName: row?.file_name || null,
          fileSize: row?.file_size ? Number(row.file_size) : null,
          mimeType: row?.mime_type || null,
          uploadedAt: row?.uploaded_at || null,
          uploadedBy: uploadedByUser ? { id: uploadedByUser.id, fullName: uploadedByUser.full_name, role: uploadedByUser.role } : null,
          downloadUrl: null,
          reviewedAt: row?.reviewed_at || null,
          reviewedBy: reviewedByUser ? { id: reviewedByUser.id, fullName: reviewedByUser.full_name, role: reviewedByUser.role } : null,
          reviewFeedback: row?.review_feedback || null,
          currentVersionId: row?.current_version_id || null,
          versionCount: row ? (versionCounts.get(row.id) || 0) : 0,
        };
      });

    // A selected optional output becomes part of the agreed checklist too.
    const selectedItems = items.filter((item) => item.isRequired || item.isSelected);
    const missingMandatoryKeys = selectedItems.filter((item) => !item.fileName).map((item) => item.name);
    const canSubmit = selectedItems.some((item) => isOutputReadyForSubmission(item.status, Boolean(item.fileName)));

    const canReadNonFinal = canReadNonFinalOutput(project as OutputProject, actor);
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
            })
        : items.filter((item) => item.status === 'APPROVED').map((item) => ({ ...item, currentVersionId: null, versionCount: 0 }));

    return {
      scenarioKey,
      isScopeLocked,
      canSubmit: canReadNonFinal && canSubmit,
      missingMandatoryCount: missingMandatoryKeys.length,
      missingMandatoryNames: missingMandatoryKeys,
      canRetryCompletion,
      documents: visibleItems,
    };
  }

  static async upload(
    projectId: string,
    documentKey: string,
    file: Express.Multer.File,
    actor: Actor
  ) {
    return this.uploadOutputDocument(projectId, documentKey, file, actor);
  }

  static async uploadOutputDocument(
    projectId: string,
    documentKey: string,
    file: Express.Multer.File,
    actor: Actor
  ) {
    const project = await this.getProject(projectId, actor);
    if (!canUploadOutput(project as OutputProject, actor)) {
      throw new OutputDocumentError('Only the assigned PIC can upload output documents for an active project.', 403);
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

    const { data: current } = await supabaseAdmin
      .from('project_output_documents')
      .select('id,status,current_version_id')
      .eq('project_id', projectId)
      .eq('document_key', documentKey)
      .maybeSingle();
    if (!current) {
      throw new OutputDocumentError('Output document was not initialized.', 409);
    }
    if (!['TO_DO', 'DRAFT', 'REVISION_REQUIRED'].includes(current.status)) {
      throw new OutputDocumentError('This output document cannot be replaced in its current state.', 409);
    }

    const storagePath = buildOutputDocumentStoragePath(projectId, documentKey, file.originalname);
    await DocumentStorageService.upload(file, storagePath);

    const now = new Date().toISOString();
    const { data: versionResult, error } = await supabaseAdmin.rpc('create_project_output_document_version', {
      p_output_document_id: current.id,
      p_expected_version_id: current.current_version_id || null,
      p_file_name: file.originalname,
      p_storage_path: storagePath,
      p_file_size: file.size,
      p_mime_type: file.mimetype || 'application/octet-stream',
      p_uploaded_by: actor.userId,
      p_uploaded_at: now,
    });

    if (error) {
      await DocumentStorageService.removeMany([storagePath]).catch(() => undefined);
      if (error.code === '40001' || error.code === 'P0001') {
        throw new OutputDocumentError('This output document changed. Refresh and try again.', 409);
      }
      throw new OutputDocumentError('Failed to record uploaded document in database.', 500);
    }

    await logWorkflowActivityBestEffort(
      actor,
      projectId,
      'OUTPUT_DOCUMENT_UPLOADED',
      `${actor.fullName} uploaded output document '${def.name}' (${file.originalname})`
    );

    const result = Array.isArray(versionResult) ? versionResult[0] : versionResult;
    return { documentKey, versionId: result?.version_id, versionNumber: result?.version_number, status: 'DRAFT' };
  }

  static async submitForReview(projectId: string, input: SubmitOutputDocumentsInput, actor: Actor) {
    return this.submitOutputDocuments(projectId, input, actor);
  }

  static async submitOutputDocuments(projectId: string, input: SubmitOutputDocumentsInput, actor: Actor) {
    const project = await this.getProject(projectId, actor);
    if (!canUploadOutput(project as OutputProject, actor)) {
      throw new OutputDocumentError('Only the assigned PIC can submit output documents.', 403);
    }

    const scenarioName = (project.scenario as any)?.name || project.scenario_id;
    const scenarioKey = resolveScenarioKey(scenarioName);
    const selectedKeys = new Set([...(project.selected_document_keys || []), ...getMandatoryDocumentKeys(scenarioKey)]);
    const results: BatchItemResult[] = [];

    for (const item of input.items) {
      if (!selectedKeys.has(item.document_key)) {
        results.push({ documentKey: item.document_key, success: false, message: 'This output is not selected for the project.' });
        continue;
      }

      const { data: row, error: rowError } = await supabaseAdmin
        .from('project_output_documents')
        .select('id,document_key,status,file_name,current_version_id')
        .eq('project_id', projectId)
        .eq('document_key', item.document_key)
        .maybeSingle();
      if (rowError || !row) {
        results.push({ documentKey: item.document_key, success: false, message: 'Output document not found.' });
        continue;
      }
      if (!isOutputReadyForSubmission(row.status, Boolean(row.file_name)) || !row.current_version_id) {
        results.push({ documentKey: item.document_key, success: false, message: 'Only uploaded draft or revision documents can be submitted.' });
        continue;
      }
      if (!isCurrentOutputVersion(item.expected_version_id, row.current_version_id)) {
        results.push({ documentKey: item.document_key, success: false, message: 'The file changed. Refresh before submitting.' });
        continue;
      }

      const { error: transitionError } = await supabaseAdmin.rpc('transition_project_output_document_version', {
        p_output_document_id: row.id,
        p_expected_version_id: item.expected_version_id,
        p_action: 'SUBMIT',
        p_actor_id: actor.userId,
        p_feedback: null,
        p_submission_note: input.note?.trim() || null,
      });
      if (transitionError) {
        results.push({ documentKey: item.document_key, success: false, message: 'The document changed or could not be submitted.' });
        continue;
      }
      results.push({ documentKey: item.document_key, success: true, status: 'IN_REVIEW' });
    }

    const submittedKeys = results.filter((result) => result.success).map((result) => result.documentKey);

    if (submittedKeys.length > 0) {
      await logWorkflowActivityBestEffort(
        actor,
        projectId,
        'OUTPUT_DOCUMENTS_SUBMITTED',
        `${actor.fullName} submitted ${submittedKeys.length} Output Document(s) for review.${input.note ? ` Note: ${input.note}` : ''}`
      );

      await runNotificationBestEffort('submit output documents notification', async () => {
        const { data: headSaUsers } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('role', 'HEAD_SA')
          .eq('is_active', true);

        await Promise.all((headSaUsers || []).map((user) => notificationService.createNotification({
          userId: user.id,
          type: 'OUTPUT_DOCUMENTS_SUBMITTED',
          title: 'Output Documents Submitted',
          message: `${submittedKeys.length} output document(s) for project '${project.name}' are ready for review.`,
          projectId: project.id,
          actionUrl: `/projects/${project.id}`,
        })));
      });
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

    const isApproval = input.decision === 'APPROVE';
    const newStatus: OutputDocumentStatus = isApproval ? 'APPROVED' : 'REVISION_REQUIRED';
    const results: BatchItemResult[] = [];
    let completionRetryRequired = false;

    for (const item of input.items) {
      const { data: row, error: rowError } = await supabaseAdmin
        .from('project_output_documents')
        .select('id,document_key,status,current_version_id')
        .eq('project_id', projectId)
        .eq('document_key', item.document_key)
        .maybeSingle();
      if (rowError || !row) {
        results.push({ documentKey: item.document_key, success: false, message: 'Output document not found.' });
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

      await runNotificationBestEffort('review output documents notification', async () => {
        const recipients = new Set<string>();
        if (project.pic_id) recipients.add(project.pic_id);
        if (isApproval && project.sales_id) recipients.add(project.sales_id);
        recipients.delete(actor.userId);

        const notifType = isApproval ? 'OUTPUT_DOCUMENTS_APPROVED' : 'OUTPUT_DOCUMENTS_REVISION_REQUIRED';
        const notifTitle = isApproval ? 'Output Documents Approved' : 'Output Documents Revision Required';
        const notifMessage = isApproval
          ? `Dokumen output proyek '${project.name}' telah disetujui oleh ${actor.fullName}.`
          : `Dokumen output proyek '${project.name}' memerlukan revisi dari ${actor.fullName}.${input.feedback ? ` Catatan: ${input.feedback}` : ''}`;

        await Promise.all(Array.from(recipients).map((userId) => notificationService.createNotification({
          userId,
          type: notifType,
          title: notifTitle,
          message: notifMessage,
          projectId: project.id,
          actionUrl: `/projects/${project.id}`,
        })));
      });

      if (isApproval) {
        const { data: milestones, error: milestoneError } = await supabaseAdmin
          .from('project_milestones')
          .select('id,status,step_order')
          .eq('project_id', projectId)
          .order('step_order', { ascending: false });
        if (!milestoneError && milestones?.length
          && milestones.every((milestone) => ['COMPLETED', 'APPROVED'].includes(milestone.status))) {
          try {
            await advanceToNextMilestone(projectId, milestones[0].id, actor);
          } catch {
            console.error('[OutputDocumentService] Failed to reconcile project completion after output approval.', {
              projectId,
            });
            completionRetryRequired = true;
          }
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

    // Enforce Scope Lock: Locked if project plan is approved or status is active
    const isLocked = project.status !== 'DRAFT' || (await this.isPlanApproved(projectId));
    if (isLocked) {
      throw new OutputDocumentError(
        'Checklist is locked because Project Plan has been approved (Scope Lock).',
        403
      );
    }

    const scenarioName = (project.scenario as any)?.name || project.scenario_id;
    const scenarioKey = resolveScenarioKey(scenarioName);
    const definitions = getScenarioDocuments(scenarioKey);
    const mandatoryKeys = new Set(getMandatoryDocumentKeys(scenarioKey));
    const allowedKeys = new Set(definitions.map((definition) => definition.key));
    if (selectedKeys.some((key) => !allowedKeys.has(key))) {
      throw new OutputDocumentError('One or more selected output documents are invalid.', 400);
    }

    // Ensure mandatory keys are always included
    const finalSelectedKeys = Array.from(new Set([...selectedKeys, ...mandatoryKeys]));

    // Update projects table
    const { error: projectUpdateError } = await supabaseAdmin
      .from('projects')
      .update({ selected_document_keys: finalSelectedKeys, updated_at: new Date().toISOString() })
      .eq('id', projectId);
    if (projectUpdateError) {
      throw new OutputDocumentError('Failed to update the output documents checklist.', 500);
    }

    // Update project_output_documents
    for (const def of definitions) {
      const isSelected = finalSelectedKeys.includes(def.key);
      const isRequired = def.isRequired;

      const { data: existing } = await supabaseAdmin
        .from('project_output_documents')
        .select('id, status, file_name')
        .eq('project_id', projectId)
        .eq('document_key', def.key)
        .maybeSingle();

      if (existing) {
        if (!existing.file_name) {
          const newStatus = isRequired || isSelected ? 'TO_DO' : 'NOT_REQUIRED';
          await supabaseAdmin
            .from('project_output_documents')
            .update({ is_selected: isSelected, status: newStatus, updated_at: new Date().toISOString() })
            .eq('id', existing.id);
        } else {
          await supabaseAdmin
            .from('project_output_documents')
            .update({ is_selected: isSelected, updated_at: new Date().toISOString() })
            .eq('id', existing.id);
        }
      } else {
        await supabaseAdmin
          .from('project_output_documents')
          .insert({
            project_id: projectId,
            document_key: def.key,
            title: def.name,
            is_required: isRequired,
            is_selected: isSelected,
            status: isRequired || isSelected ? 'TO_DO' : 'NOT_REQUIRED',
          });
      }
    }

    await logWorkflowActivityBestEffort(
      actor,
      projectId,
      'OUTPUT_CHECKLIST_UPDATED',
      `${actor.fullName} updated the Output Documents Checklist`
    );

    return { success: true, selectedDocumentKeys: finalSelectedKeys };
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

    const { data: versions, error } = await supabaseAdmin
      .from('project_output_document_versions')
      .select(`
        id, version_number, status, file_name, file_size, mime_type, uploaded_at,
        submitted_at, submission_note, reviewed_at, review_feedback,
        uploaded_by_user:users!project_output_document_versions_uploaded_by_fkey(id, full_name, role),
        reviewed_by_user:users!project_output_document_versions_reviewed_by_fkey(id, full_name, role)
      `)
      .eq('output_document_id', document.id)
      .order('version_number', { ascending: false });
    if (error) throw new OutputDocumentError('Failed to retrieve output document history.', 500);

    return {
      documentKey,
      versions: (versions || []).map((version: any) => ({
        id: version.id,
        versionNumber: version.version_number,
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

    const { data: version, error } = await supabaseAdmin
      .from('project_output_document_versions')
      .select('file_name,storage_path,output_document:project_output_documents!project_output_document_versions_output_document_id_fkey(project_id,document_key)')
      .eq('id', versionId)
      .maybeSingle();
    const outputDocument = Array.isArray(version?.output_document) ? version.output_document[0] : version?.output_document;
    if (error || !version || !version.storage_path || !outputDocument
      || outputDocument.project_id !== projectId || outputDocument.document_key !== documentKey) {
      throw new OutputDocumentError('Output document version not found', 404);
    }

    return {
      fileName: version.file_name,
      url: await DocumentStorageService.createSignedDownloadUrl(version.storage_path, 300),
      expiresInSeconds: 300,
    };
  }

  static async getDownloadUrl(projectId: string, documentKey: string, actor: Actor) {
    const project = await this.getProject(projectId, actor);

    const { data: row, error } = await supabaseAdmin
      .from('project_output_documents')
      .select('file_name, storage_path, status')
      .eq('project_id', projectId)
      .eq('document_key', documentKey)
      .maybeSingle();

    if (error || !row || !row.storage_path) {
      throw new OutputDocumentError('Output document file not found', 404);
    }
    if (row.status !== 'APPROVED' && !canReadNonFinalOutput(project as OutputProject, actor)) {
      throw new OutputDocumentError('Output document file not found', 404);
    }

    const url = await DocumentStorageService.createSignedDownloadUrl(row.storage_path, 300);
    return {
      fileName: row.file_name,
      url,
      expiresInSeconds: 300,
    };
  }

  static async downloadAllApproved(
    projectId: string,
    actor: Actor
  ): Promise<{ zipBuffer: Buffer; fileName: string }> {
    const project = await this.getProject(projectId, actor);

    const { data: approvedDocs, error } = await supabaseAdmin
      .from('project_output_documents')
      .select('id, document_key, title, file_name, storage_path, status')
      .eq('project_id', projectId)
      .eq('status', 'APPROVED');

    if (error) {
      throw new OutputDocumentError('Failed to fetch approved documents.', 500);
    }

    const validDocs = (approvedDocs || []).filter((doc: any) => doc.file_name && doc.storage_path);
    if (validDocs.length === 0) {
      throw new OutputDocumentError('Tidak ada dokumen berstatus APPROVED untuk diunduh.', 400);
    }

    const entries: ZipEntry[] = [];
    const usedFileNames = new Set<string>();

    for (const doc of validDocs) {
      try {
        const signedUrl = await DocumentStorageService.createSignedDownloadUrl(doc.storage_path, 300);
        const response = await fetch(signedUrl);
        if (!response.ok) {
          continue;
        }
        const arrayBuf = await response.arrayBuffer();
        const fileBuf = Buffer.from(arrayBuf);

        let targetName = doc.file_name || `${doc.document_key}.bin`;
        if (usedFileNames.has(targetName)) {
          targetName = `${doc.document_key}_${targetName}`;
        }
        usedFileNames.add(targetName);

        entries.push({
          name: targetName,
          data: fileBuf,
        });
      } catch (fetchErr) {
        console.error(`Failed to download file for document ${doc.document_key}`, fetchErr);
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
