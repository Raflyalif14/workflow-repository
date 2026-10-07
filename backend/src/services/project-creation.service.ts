import { createHash } from 'crypto';
import { z } from 'zod';
import { supabaseAdmin } from '../config/supabase';
import { ENV } from '../config/env';
import { DocumentStorageService } from '../utils/storage.util';
import { buildInitialMilestoneRows, resolveWorkflowInitializationMode } from './milestone.service';
import { getScenarioDocuments, getMandatoryDocumentKeys, resolveScenarioKey } from '../constants/scenarios';
import type { CreateProjectManagementInput } from '../validators/project-management.validator';
import type { ProjectCreationFiles } from './project-management.service';

type Actor = { userId: string; role: string; fullName: string };
export type CreationCode = 'CREATE_REQUEST_REQUIRED' | 'CREATE_PAYLOAD_CONFLICT' | 'CREATE_IN_PROGRESS'
  | 'CREATE_RETRYABLE' | 'CREATE_STORAGE_UNCERTAIN' | 'CREATE_ACCESS_INVALID' | 'CREATE_PROJECT_DELETED' | 'CREATE_REVIEW_REQUIRED';
export class ProjectCreationRequestError extends Error {
  constructor(readonly code: CreationCode, readonly statusCode: number) { super('Unable to confirm project creation.'); }
}
export function projectCreationRequestId(value: unknown): string {
  const parsed = z.string().uuid().safeParse(value);
  if (!parsed.success) throw new ProjectCreationRequestError('CREATE_REQUEST_REQUIRED', 422);
  return parsed.data;
}
export function projectCreationPayload(input: CreateProjectManagementInput, files: ProjectCreationFiles) {
  // Uploaded bytes are verified on the server, never a client-supplied content hash.
  const attachments = (['mom','photos','documents'] as const).flatMap((group) => files[group].map(file => {
    if (!Buffer.isBuffer(file.buffer) || file.buffer.length !== file.size) throw new ProjectCreationRequestError('CREATE_REVIEW_REQUIRED',422);
    return { kind: group === 'mom' ? 'MOM' : group === 'photos' ? 'PHOTO' : 'DOCUMENT',
      name: file.originalname, size: file.buffer.length, mime: file.mimetype || 'application/octet-stream',
      sha256: createHash('sha256').update(file.buffer).digest('hex') };
  }));
  const payload = { name: input.name.trim(), customer: input.customer.trim(), scenario_id: input.scenario_id,
    estimated_revenue: String(input.estimated_revenue),
    selected_keys: [...new Set(input.selectedDocumentKeys || input.selected_document_keys || [])].sort(), attachments };
  return { payload, fingerprint: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
    files: [...files.mom,...files.photos,...files.documents] };
}
type Receipt = { status: 'NONE' | 'BUSY' | 'PROCESSING' | 'COMMITTED'; project_id?: string; lease?: string;
  files?: Array<{ ordinal: number; state: 'PENDING' | 'UPLOADING' | 'STORED'; storage_path: string }> };
async function operation(actor: Actor, requestId: string, fingerprint: string, action: string,
  options: { payload?: unknown; plan?: unknown; lease?: string; ordinal?: number } = {}): Promise<Receipt> {
  const { data, error } = await supabaseAdmin.rpc('project_creation_operation', {
    p_actor_id: actor.userId, p_request_id: requestId, p_fingerprint: fingerprint, p_operation: action,
    p_payload: options.payload ?? null, p_plan: options.plan ?? null,
    p_lease: options.lease ?? null, p_ordinal: options.ordinal ?? null,
  });
  if (error) {
    const errors: Record<string,[CreationCode,number]> = { '42501':['CREATE_ACCESS_INVALID',403],
      '40001':['CREATE_PAYLOAD_CONFLICT',409], 'P0002':['CREATE_PROJECT_DELETED',410],
      '55000':['CREATE_REVIEW_REQUIRED',409], '55P03':['CREATE_IN_PROGRESS',409], '22023':['CREATE_REVIEW_REQUIRED',422] };
    const [code,status] = errors[error.code] || ['CREATE_RETRYABLE',503];
    throw new ProjectCreationRequestError(code,status);
  }
  if (!data || !['NONE','BUSY','PROCESSING','COMMITTED'].includes(data.status)
    || (data.status==='COMMITTED' && typeof data.project_id!=='string')) throw new ProjectCreationRequestError('CREATE_RETRYABLE',503);
  if (data.status === 'BUSY') throw new ProjectCreationRequestError('CREATE_IN_PROGRESS',409);
  return data;
}
export async function prepareProjectCreationPlan(input: CreateProjectManagementInput) {
  const { data: scenario, error } = await supabaseAdmin.from('scenarios')
    .select('id,name,is_active,workflow_model,workflow_version').eq('id',input.scenario_id).single();
  if (error) throw new ProjectCreationRequestError('CREATE_RETRYABLE',503);
  if (!scenario?.is_active) throw new ProjectCreationRequestError('CREATE_REVIEW_REQUIRED',422);
  let mode: ReturnType<typeof resolveWorkflowInitializationMode>;
  try { mode = resolveWorkflowInitializationMode(scenario); } catch { throw new ProjectCreationRequestError("CREATE_REVIEW_REQUIRED",422); }
  const key = resolveScenarioKey(scenario.name);
  const definitions = getScenarioDocuments(key);
  const raw = input.selectedDocumentKeys || input.selected_document_keys || [];
  if (raw.some(k => !definitions.some(d => d.key === k))) throw new ProjectCreationRequestError('CREATE_REVIEW_REQUIRED',422);
  const selected = [...new Set([...raw,...getMandatoryDocumentKeys(key)])].sort();
  const outputs = definitions.filter(d => selected.includes(d.key)).map(d => ({document_key:d.key,stage_key:d.stageKey,title:d.name,is_required:d.isRequired}));
  const { data, error: stageError } = await supabaseAdmin.from('workflow_stages')
    .select('id,name,description,step_order,stage_key,default_role').eq('scenario_id',scenario.id).eq('is_active',true).order('step_order',{ascending:true});
  if (stageError) throw new ProjectCreationRequestError('CREATE_RETRYABLE',503);
  const stages = data || [];
  const selectedStages = new Set(outputs.map(d => d.stage_key));
  if (!stages.length || outputs.some(d => stages.filter(s => s.stage_key === d.stage_key && s.default_role === 'SA').length !== 1)
    || (mode === 'OPERATIONAL_V2' && (stages.some(s => !s.stage_key || !['SA','SALES'].includes(s.default_role || ''))
      || stages.filter(s => s.default_role === 'SALES').length !== 1))) throw new ProjectCreationRequestError('CREATE_REVIEW_REQUIRED',422);
  const included = mode === 'OPERATIONAL_V2' && key === 'PRA_TENDER' ? stages.filter(s => s.default_role !== 'SALES') : stages;
  const rows = buildInitialMilestoneRows('reserved',included,'server-time',scenario,mode === 'OPERATIONAL_V2' ? selectedStages : undefined);
  return { scenario: {id:scenario.id,name:scenario.name,workflow_model:scenario.workflow_model,workflow_version:scenario.workflow_version},
    stages, selected_keys:selected, milestones:rows.map(r=>({workflow_stage_id:r.workflow_stage_id,step_order:r.step_order,status:r.status})), outputs };
}
async function verifyStoredFile(storagePath: string, sha256: string, size: number): Promise<void> {
  // Exact immutable object only. Absence, provider error, and content mismatch never authorize re-upload/delete.
  const { data, error } = await supabaseAdmin.storage.from(ENV.SUPABASE_DOCUMENT_BUCKET).download(storagePath);
  if (error || !data) throw new ProjectCreationRequestError('CREATE_STORAGE_UNCERTAIN',503);
  const bytes = Buffer.from(await data.arrayBuffer());
  if (bytes.length !== size || createHash('sha256').update(bytes).digest('hex') !== sha256)
    throw new ProjectCreationRequestError('CREATE_STORAGE_UNCERTAIN',503);
}
export class ProjectCreationService {
  static async create(input: CreateProjectManagementInput, actor: Actor, files: ProjectCreationFiles, requestId: string): Promise<string> {
    if (actor.role !== 'SALES') throw new ProjectCreationRequestError('CREATE_ACCESS_INVALID',403);
    requestId = projectCreationRequestId(requestId);
    const prepared = projectCreationPayload(input,files);
    let receipt = await operation(actor,requestId,prepared.fingerprint,'LOOKUP',{payload:prepared.payload});
    if (receipt.status === 'COMMITTED') return receipt.project_id!;
    const plan = receipt.status === 'NONE' ? await prepareProjectCreationPlan(input) : undefined;
    receipt = await operation(actor,requestId,prepared.fingerprint,'CLAIM',{payload:prepared.payload,plan});
    if (receipt.status === 'COMMITTED') return receipt.project_id!;
    if (!receipt.lease || !receipt.project_id || !Array.isArray(receipt.files) || receipt.files.length!==prepared.files.length)
      throw new ProjectCreationRequestError('CREATE_RETRYABLE',503);
    const lease = receipt.lease;
    try {
      for (const attachment of receipt.files || []) {
        if (attachment.state === 'STORED') continue;
        const file = prepared.files[attachment.ordinal];
        const expected = prepared.payload.attachments[attachment.ordinal];
        if (attachment.state === 'PENDING') {
          const started = await operation(actor,requestId,prepared.fingerprint,'START_FILE',{lease,ordinal:attachment.ordinal});
          if (started.status === 'COMMITTED') return started.project_id!;
          try { await DocumentStorageService.upload(file,attachment.storage_path); }
          catch { await verifyStoredFile(attachment.storage_path,expected.sha256,expected.size); }
        } else await verifyStoredFile(attachment.storage_path,expected.sha256,expected.size);
        const stored = await operation(actor,requestId,prepared.fingerprint,'STORED_FILE',{lease,ordinal:attachment.ordinal});
        // A replacement lease may already have committed while this upload response was delayed.
        // Stop before any remaining stale PENDING descriptors can trigger another transfer.
        if (stored.status === 'COMMITTED') return stored.project_id!;
      }
      const committed = await operation(actor,requestId,prepared.fingerprint,'COMMIT',{lease});
      return committed.project_id!;
    } catch (error) {
      // No compensation: COMMIT response may be lost, or Storage bytes may arrive late.
      // Release is fenced, cannot undo COMMITTED, and preserves every exact path for reconciliation.
      try { await operation(actor,requestId,prepared.fingerprint,'RELEASE',{lease}); } catch { /* lease expiry permits a later fenced retry */ }
      if (error instanceof ProjectCreationRequestError) throw error;
      throw new ProjectCreationRequestError('CREATE_RETRYABLE',503);
    }
  }
}
