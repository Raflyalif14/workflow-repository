import { strict as assert } from 'assert';
import { supabaseAdmin } from '../config/supabase';
import { DocumentStorageService } from '../utils/storage.util';
import { isValidOutputDraftFileSet, OutputDocumentError, OutputDocumentService } from './output-document.service';
import { OutputNotificationOutboxWorker } from './output-notification-outbox.worker';
import * as workflow from './workflow-progression.service';
import { uploadOutputDocumentFileSchema, removeOutputDocumentFileSchema, submitOutputDocumentsSchema } from '../validators/output-document.validator';

type Row = Record<string, any>;
const projectId = 'project-files';
const key = 'proposal_teknis';
const actor = { userId: 'sa-pic', role: 'SA', fullName: 'SA PIC' };
const head = { userId: 'head', role: 'HEAD_SA', fullName: 'Head SA' };
const sales = { userId: 'sales-owner', role: 'SALES', fullName: 'Sales' };
const uuid = (index: number) => `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const file = (name: string, body = name): Express.Multer.File => ({ originalname: name, mimetype: 'application/pdf',
  size: Buffer.byteLength(body), buffer: Buffer.from(body) } as Express.Multer.File);

async function main() {
  const output: Row = { id: 'output-files', project_id: projectId, document_key: key, milestone_id: 'milestone-files',
    status: 'TO_DO', draft_revision: 0, current_version_id: null, is_required: true, is_selected: true };
  const project: Row = { id: projectId, name: 'Project', customer: 'Customer', scenario_id: 'scenario',
    sales_id: sales.userId, pic_id: actor.userId, status: 'ACTIVE', is_postponed: false,
    selected_document_keys: [], scenario: { name: 'On Submission Tender' } };
  const milestone: Row = { id: 'milestone-files', project_id: projectId, pic_id: actor.userId, status: 'IN_PROGRESS', start_date: null };
  const assets: Row[] = [];
  const drafts: Row[] = [];
  const snapshots: Row[] = [];
  const snapshotFiles: Row[] = [];
  const mutations = new Map<string, Row>();
  const submissions = new Map<string, Row>();
  const cleanups: Row[] = [];
  const uploads: string[] = [];
  const deleted: string[] = [];
  const signed: string[] = [];
  const activity: string[] = [];
  const stored = new Set<string>();
  let storageFailure: 'before' | 'after' | undefined;
  let failTracking = false;
  let concurrentUploads = false;
  let releaseUploads: Array<() => void> = [];
  let deliveries = 0;
  let progression = 0;
  let completion = 0;
  let failMetadata = false;
  let metadataErrorCode = 'XX000';
  let rejectMetadata = false;
  let loseCommittedResponse = false;
  let failCleanup = false;
  let currentRpc: string | undefined;

  class Query {
    private filters: Array<(row: Row) => boolean> = [];
    private offset = 0;
    private end = Infinity;
    private patch: Row | undefined;
    constructor(private table: string) {}
    select() { return this; }
    eq(column: string, value: unknown) { this.filters.push((row) => row[column] === value); return this; }
    in(column: string, values: unknown[]) { this.filters.push((row) => values.includes(row[column])); return this; }
    order() { return this; }
    limit() { return this; }
    range(offset: number, end: number) { this.offset = offset; this.end = end; return this; }
    update(patch: Row) { this.patch = patch; return this; }
    private execute(single: boolean) {
      const source = this.table === 'projects' ? [project] : this.table === 'project_milestones' ? [milestone]
        : this.table === 'project_output_documents' ? [output] : this.table === 'project_output_document_files' ? assets
        : this.table === 'project_output_document_draft_files' ? drafts : this.table === 'project_output_document_versions' ? snapshots
        : this.table === 'project_output_document_version_files' ? snapshotFiles : this.table === 'project_deletion_cleanups' ? cleanups
        : this.table === 'project_output_document_draft_requests' ? [...mutations.values()] : [];
      const rows = source.filter((row) => this.filters.every((filter) => filter(row))).slice(this.offset, this.end + 1);
      if (this.patch) rows.forEach((row) => Object.assign(row, this.patch));
      return { data: single ? rows[0] || null : rows.map((row) => ({ ...row })), error: null };
    }
    single() { return Promise.resolve(this.execute(true)); }
    maybeSingle() { return Promise.resolve(this.execute(true)); }
    then(resolve: (value: any) => unknown, reject?: (reason: unknown) => unknown) { return Promise.resolve(this.execute(false)).then(resolve, reject); }
  }

  const originals = { from: supabaseAdmin.from, rpc: supabaseAdmin.rpc, upload: DocumentStorageService.upload,
    removeMany: DocumentStorageService.removeMany, sign: DocumentStorageService.createSignedDownloadUrl,
    activity: workflow.logWorkflowActivityBestEffort, advance: workflow.advanceToNextMilestone,
    deliver: OutputNotificationOutboxWorker.runOnceBestEffort };
  try {
    (supabaseAdmin as any).from = (table: string) => new Query(table);
    (DocumentStorageService as any).upload = async (_file: unknown, path: string) => {
      uploads.push(path);
      if (storageFailure === 'before') throw new Error('Storage response failed');
      stored.add(path);
      if (storageFailure === 'after') throw new Error('Storage response lost');
      if (concurrentUploads) await new Promise<void>((resolve) => {
        releaseUploads.push(resolve);
        if (releaseUploads.length === 2) releaseUploads.forEach((release) => release());
      });
    };
    (DocumentStorageService as any).removeMany = async (paths: string[]) => {
      if (failCleanup) throw new Error('Storage unavailable');
      deleted.push(...paths);
    };
    (DocumentStorageService as any).createSignedDownloadUrl = async (path: string) => { signed.push(path); return 'signed-url'; };
    (workflow as any).logWorkflowActivityBestEffort = async (_actor: unknown, _project: unknown, event: string) => { activity.push(event); };
    (workflow as any).advanceToNextMilestone = async () => { progression++; };
    (OutputNotificationOutboxWorker as any).runOnceBestEffort = async () => { deliveries++; };
    (supabaseAdmin as any).rpc = async (name: string, input: Row) => {
      currentRpc = name;
      if (name === 'record_output_upload_outcome') {
        if (failTracking) return { data: null, error: { code: 'NETWORK_ERROR' } };
        if (assets.some((asset) => asset.storage_path === input.p_storage_path)) return { data: null, error: null };
        const job = { id: uuid(900 + cleanups.length), status: input.p_uncertain ? 'PENDING' : 'FAILED', storage_paths: [input.p_storage_path] };
        cleanups.push(job);
        return { data: job.id, error: null };
      }
      if (name === 'mutate_project_output_document_draft') {
        assert.equal(input.p_output_document_id, output.id);
        if (rejectMetadata) throw new Error('Transport disconnected');
        if (failMetadata) return { data: null, error: { code: metadataErrorCode } };
        const previous = mutations.get(input.p_request_id);
        const payload = JSON.stringify([input.p_action, input.p_expected_revision, input.p_target_file_id,
          input.p_file_id, input.p_file_name, input.p_file_size, input.p_mime_type, input.p_content_sha256]);
        if (previous) {
          if (previous.actor_id !== input.p_actor_id || previous.payload !== payload) return { data: null, error: { code: '22023' } };
          if (project.pic_id !== input.p_actor_id || milestone.pic_id !== input.p_actor_id) return { data: null, error: { code: '42501' } };
          return { data: [{ draft_revision: output.draft_revision, file_id: previous.fileId, applied: false }], error: null };
        }
        assert.equal(input.p_actor_id, actor.userId);
        if (input.p_expected_revision !== output.draft_revision) return { data: null, error: { code: '40001' } };
        if (!['TO_DO', 'DRAFT', 'REVISION_REQUIRED'].includes(output.status)) return { data: null, error: { code: '22023' } };
        if (input.p_action !== 'ADD') {
          const index = drafts.findIndex((ref) => ref.file_id === input.p_target_file_id);
          if (index < 0) return { data: null, error: { code: '22023' } };
          drafts.splice(index, 1);
        }
        if (input.p_action !== 'REMOVE') {
          assets.push({ id: input.p_file_id, output_document_id: output.id, project_id: projectId,
            file_name: input.p_file_name, file_size: input.p_file_size, mime_type: input.p_mime_type,
            storage_path: input.p_storage_path, uploaded_at: input.p_uploaded_at, content_sha256: input.p_content_sha256 });
          drafts.push({ output_document_id: output.id, file_id: input.p_file_id, project_id: projectId, position: drafts.length });
        }
        output.draft_revision++;
        if (output.status !== 'REVISION_REQUIRED') output.status = 'DRAFT';
        mutations.set(input.p_request_id, { request_id: input.p_request_id, output_document_id: output.id,
          actor_id: input.p_actor_id, payload, fileId: input.p_file_id || input.p_target_file_id });
        if (loseCommittedResponse) return { data: null, error: { code: 'NETWORK_ERROR' } };
        return { data: [{ draft_revision: output.draft_revision, file_id: input.p_file_id || input.p_target_file_id, applied: true }], error: null };
      }
      if (name === 'submit_project_output_document_draft') {
        const previous = submissions.get(input.p_request_id);
        if (previous) {
          if (previous.expectedRevision !== input.p_expected_revision || previous.actor !== input.p_actor_id
            || previous.note !== input.p_submission_note) return { data: null, error: { code: '22023' } };
          return { data: [{ ...previous, new_status: output.status, created: false }], error: null };
        }
        if (input.p_expected_revision !== output.draft_revision || !drafts.length) return { data: null, error: { code: '40001' } };
        const version = { id: uuid(100 + snapshots.length), project_id: projectId, output_document_id: output.id,
          version_number: snapshots.length + 1, status: 'IN_REVIEW', snapshot_kind: 'SUBMITTED', submission_request_id: input.p_request_id };
        snapshots.push(version);
        snapshotFiles.push(...drafts.map((ref) => ({ ...ref, version_id: version.id })));
        output.current_version_id = version.id;
        output.status = 'IN_REVIEW';
        output.draft_revision++;
        const result = { version_id: version.id, draft_revision: output.draft_revision, new_status: 'IN_REVIEW', created: true };
        submissions.set(input.p_request_id, { ...result, expectedRevision: input.p_expected_revision, actor: input.p_actor_id, note: input.p_submission_note });
        return { data: [result], error: null };
      }
      if (name === 'transition_project_output_document_version') {
        assert.equal(input.p_expected_version_id, output.current_version_id);
        output.status = input.p_action === 'APPROVE' ? 'APPROVED' : 'REVISION_REQUIRED';
        snapshots.find((version) => version.id === output.current_version_id)!.status = output.status;
        return { data: null, error: null };
      }
      if (name === 'complete_sa_output_milestone') {
        if (milestone.status === 'COMPLETED') return { data: [{ changed: false }], error: null };
        milestone.status = 'COMPLETED'; completion++;
        return { data: [{ changed: true }], error: null };
      }
      throw new Error(`Unexpected RPC: ${name}`);
    };

    assert(uploadOutputDocumentFileSchema.safeParse({ expected_draft_revision: '0', request_id: uuid(1) }).success);
    for (const revision of [undefined, null, '', '-1', 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      assert(!removeOutputDocumentFileSchema.safeParse({ expected_draft_revision: revision, request_id: uuid(1) }).success);
    }
    assert(!submitOutputDocumentsSchema.safeParse({ items: [{ document_key: key, expected_version_id: uuid(1) }] }).success);
    const metadata = { id: uuid(1), fileName: 'file.pdf', fileSize: 1, mimeType: 'application/pdf', uploadedAt: '2026-10-02T00:00:00Z' };
    assert(isValidOutputDraftFileSet([metadata]));
    assert(!isValidOutputDraftFileSet([]));
    assert(!isValidOutputDraftFileSet([{ ...metadata, fileSize: 0 }]));
    assert(!isValidOutputDraftFileSet(Array.from({ length: 11 }, () => metadata)));
    assert(isValidOutputDraftFileSet(Array.from({ length: 4 }, () => ({ ...metadata, fileSize: 50 * 1024 * 1024 }))));
    assert(!isValidOutputDraftFileSet(Array.from({ length: 5 }, () => ({ ...metadata, fileSize: 50 * 1024 * 1024 }))));

    const add = (index: number, revision: number, replaceId?: string, name = 'same-name.pdf', bytes = name) =>
      OutputDocumentService.upload(projectId, key, file(name, bytes), actor,
        { expected_draft_revision: revision, request_id: uuid(index), ...(replaceId ? { replace_file_id: replaceId } : {}) });
    await assert.rejects(() => add(1, 0, undefined, 'empty.pdf', ''), (error: any) => error.statusCode === 400);
    assert.equal(uploads.length, 0, 'Empty upload is rejected before Storage');
    assert(!(await OutputDocumentService.submitForReview(projectId,
      { items: [{ document_key: key, expected_draft_revision: 0, request_id: uuid(999) }] }, actor)).success,
    'An empty draft cannot be submitted');
    assert.equal(snapshots.length, 0);
    for (let index = 0; index < 10; index++) {
      assets.push({ id: uuid(200 + index), output_document_id: output.id, project_id: projectId, file_name: 'existing.pdf',
        file_size: 1, mime_type: 'application/pdf', storage_path: `retained-${index}`, uploaded_at: metadata.uploadedAt });
      drafts.push({ output_document_id: output.id, project_id: projectId, file_id: uuid(200 + index), position: index });
    }
    await assert.rejects(() => add(99, 0), (error: any) => error.statusCode === 400);
    assert.equal(uploads.length, 0, 'Count limit is enforced before uploading');
    assets.length = 4; drafts.length = 4;
    assets.forEach((asset) => { asset.file_size = 50 * 1024 * 1024; });
    await assert.rejects(() => add(99, 0), (error: any) => error.statusCode === 400);
    assert.equal(uploads.length, 0, 'Total-size limit is enforced before uploading');
    assets.length = 0; drafts.length = 0;
    await add(1, 0);
    await add(2, 1);
    assert.equal(drafts.length, 2, 'Identical filenames add distinct files, never replace implicitly');
    assert.equal(snapshots.length, 0, 'Draft uploads create no review version');
    assert.equal(currentRpc, 'mutate_project_output_document_draft');
    await add(1, 0);
    assert.equal(uploads.length, 2, 'Idempotent committed retry skips Storage upload');
    assert.equal(drafts.length, 2);
    await assert.rejects(() => add(1, 0, undefined, 'same-name.pdf', 'changed bytes'), OutputDocumentError);
    await assert.rejects(() => add(3, 0), (error: any) => error.statusCode === 409);
    assert.equal(uploads.length, 2, 'Stale CAS is rejected before uploading');
    await add(3, 2, uuid(1));
    await OutputDocumentService.removeDraftFile(projectId, key, uuid(2), { expected_draft_revision: 3, request_id: uuid(4) }, actor);
    assert.deepEqual(drafts.map((ref) => ref.file_id), [uuid(3)]);
    assert.equal(assets.length, 3, 'Removing a draft reference retains immutable bytes');
    assert.equal(snapshots.length, 0);
    assert.equal(deleted.length, 0);

    const submit = { items: [{ document_key: key, expected_draft_revision: 4, request_id: uuid(5) }] };
    assert((await OutputDocumentService.submitForReview(projectId, submit, actor)).success);
    assert.equal(snapshots.length, 1);
    const originalSnapshot = snapshotFiles.filter((ref) => ref.version_id === snapshots[0].id).map((ref) => ref.file_id);
    assert.deepEqual(originalSnapshot, [uuid(3)]);
    await OutputDocumentService.submitForReview(projectId, submit, actor);
    assert.equal(snapshots.length, 1);
    assert.equal(deliveries, 1, 'Submit replay does not dispatch twice');
    assert.equal(activity.filter((event) => event === 'OUTPUT_DOCUMENTS_SUBMITTED').length, 1);
    assert.equal(output.draft_revision, 5, 'Submit consumes the draft revision token');
    await assert.rejects(() => add(6, 5), (error: any) => error.statusCode === 409);
    await assert.rejects(() => OutputDocumentService.getFileDownloadUrl(projectId, key, uuid(3), sales), (error: any) => error.statusCode === 404);
    await OutputDocumentService.getFileDownloadUrl(projectId, key, uuid(3), head, snapshots[0].id);
    await assert.rejects(() => OutputDocumentService.getFileDownloadUrl(projectId, key, uuid(1), head, snapshots[0].id), OutputDocumentError);

    await OutputDocumentService.review(projectId, { decision: 'REVISE', feedback: 'Update the attachment.',
      items: [{ document_key: key, expected_version_id: snapshots[0].id }] }, head);
    await add(6, 5, uuid(3), 'revision.pdf');
    await add(7, 6, undefined, 'supporting.pdf');
    assert.equal(snapshots.length, 1);
    assert.deepEqual(snapshotFiles.filter((ref) => ref.version_id === snapshots[0].id).map((ref) => ref.file_id), originalSnapshot);
    await OutputDocumentService.getFileDownloadUrl(projectId, key, uuid(3), head, snapshots[0].id);
    await OutputDocumentService.submitForReview(projectId, { items: [{ document_key: key, expected_draft_revision: 7, request_id: uuid(8) }] }, actor);
    assert.equal(snapshots.length, 2);
    assert.deepEqual(snapshotFiles.filter((ref) => ref.version_id === snapshots[1].id).map((ref) => ref.file_id), [uuid(6), uuid(7)]);
    await OutputDocumentService.review(projectId, { decision: 'APPROVE', items: [{ document_key: key, expected_version_id: snapshots[1].id }] }, head);
    assert.equal(completion, 1);
    assert.equal(progression, 1);
    await OutputDocumentService.review(projectId, { decision: 'APPROVE', items: [{ document_key: key, expected_version_id: snapshots[1].id }] }, head);
    assert.equal(progression, 1, 'Approval retry must not progress twice');
    const submissionRetry = await OutputDocumentService.submitForReview(projectId,
      { items: [{ document_key: key, expected_draft_revision: 7, request_id: uuid(8) }] }, actor);
    assert(submissionRetry.success, 'Submit receipt remains replayable after milestone completion');
    assert.equal(snapshots.length, 2);
    project.is_postponed = true;
    const unchanged = [uploads.length, drafts.length, assets.length, snapshots.length, activity.length, deliveries, output.draft_revision];
    assert.equal((await add(6, 5, uuid(3), 'revision.pdf')).status, 'APPROVED', 'Upload replay returns the actual output status');
    assert.equal((await OutputDocumentService.removeDraftFile(projectId, key, uuid(2),
      { expected_draft_revision: 3, request_id: uuid(4) }, actor)).status, 'APPROVED');
    assert.deepEqual([uploads.length, drafts.length, assets.length, snapshots.length, activity.length, deliveries, output.draft_revision], unchanged,
      'Replay after completion/postponement performs no new mutation, upload, activity or notification');
    await assert.rejects(() => add(6, 4, uuid(3), 'revision.pdf'), OutputDocumentError);
    await assert.rejects(() => add(6, 5, undefined, 'revision.pdf'), OutputDocumentError);
    await assert.rejects(() => OutputDocumentService.removeDraftFile(projectId, key, uuid(3),
      { expected_draft_revision: 3, request_id: uuid(4) }, actor), OutputDocumentError);
    await assert.rejects(() => OutputDocumentService.upload(projectId, key, file('revision.pdf'), { ...actor, userId: 'other-sa' },
      { expected_draft_revision: 5, request_id: uuid(6), replace_file_id: uuid(3) }), OutputDocumentError);
    project.pic_id = 'other-sa'; milestone.pic_id = 'other-sa';
    await assert.rejects(() => OutputDocumentService.upload(projectId, key, file('revision.pdf'), { ...actor, userId: 'other-sa' },
      { expected_draft_revision: 5, request_id: uuid(6), replace_file_id: uuid(3) }), OutputDocumentError,
    'Even the new authorized PIC cannot reuse another actor receipt');
    project.pic_id = actor.userId; milestone.pic_id = actor.userId;
    project.status = 'WON';
    assert.equal((await add(6, 5, uuid(3), 'revision.pdf')).status, 'APPROVED');
    await assert.rejects(() => add(90, 8), (error: any) => error.statusCode === 403);
    project.status = 'ACTIVE';
    assert((await OutputDocumentService.submitForReview(projectId,
      { items: [{ document_key: key, expected_draft_revision: 7, request_id: uuid(8) }] }, actor)).success,
    'An existing submit receipt remains readable while postponed');
    assert(!(await OutputDocumentService.submitForReview(projectId,
      { items: [{ document_key: key, expected_draft_revision: 999, request_id: uuid(8) }] }, actor)).success,
    'A replay with a different revision is rejected');
    assert(!(await OutputDocumentService.submitForReview(projectId,
      { items: [{ document_key: key, expected_draft_revision: 7, request_id: uuid(8) }], note: 'Different note' }, actor)).success,
    'A replay with a different note is rejected');
    await assert.rejects(() => OutputDocumentService.submitForReview(projectId,
      { items: [{ document_key: key, expected_draft_revision: 8, request_id: uuid(99) }] }, actor), (error: any) => error.statusCode === 403);
    project.is_postponed = false;
    await OutputDocumentService.getFileDownloadUrl(projectId, key, uuid(6), sales, snapshots[1].id);
    await OutputDocumentService.getFileDownloadUrl(projectId, key, uuid(7), sales, snapshots[1].id);
    await assert.rejects(() => OutputDocumentService.getFileDownloadUrl(projectId, key, uuid(3), sales, snapshots[0].id), OutputDocumentError);
    await assert.rejects(() => OutputDocumentService.getFileDownloadUrl(projectId, 'timeline_proyek', uuid(6), head, snapshots[1].id), OutputDocumentError);
    await assert.rejects(() => OutputDocumentService.getFileDownloadUrl(projectId, key, uuid(6), { ...actor, userId: 'other-sa' }), OutputDocumentError);
    assert.equal(signed.length, 4, 'Only authorized output/snapshot/file combinations are signed, including the intact old snapshot');
    await assert.rejects(() => add(90, 8), (error: any) => error.statusCode === 403);
    await assert.rejects(() => OutputDocumentService.removeDraftFile(projectId, key, uuid(6),
      { expected_draft_revision: 8, request_id: uuid(90) }, actor), (error: any) => error.statusCode === 403);

    output.status = 'DRAFT'; milestone.status = 'IN_PROGRESS';
    failMetadata = true; failCleanup = true;
    await assert.rejects(() => add(20, 8), OutputDocumentError);
    assert.equal(cleanups.length, 1, 'Unreferenced failed metadata upload has durable exact-path cleanup');
    assert.equal(cleanups[0].status, 'FAILED');
    assert.equal(cleanups[0].storage_paths.length, 1);
    assert.equal(deleted.length, 0);
    metadataErrorCode = 'ABORT';
    await assert.rejects(() => add(24, 8), OutputDocumentError);
    assert.equal(cleanups[1].status, 'PENDING', 'A five-character transport error is not proof of PostgreSQL rollback');
    failMetadata = false; rejectMetadata = true;
    await assert.rejects(() => add(23, 8), OutputDocumentError);
    assert.equal(cleanups.length, 3, 'Rejected RPC Promise also captures exact unreferenced bytes durably');
    assert.equal(cleanups[2].status, 'PENDING', 'An uncertain transaction cannot be retried for deletion');
    rejectMetadata = false; failCleanup = false; loseCommittedResponse = true;
    await assert.rejects(() => add(21, 8), OutputDocumentError);
    const count = uploads.length;
    assert.equal(cleanups.length, 3, 'Ambiguous committed metadata is never scheduled for cleanup');
    loseCommittedResponse = false;
    await add(21, 8);
    assert.equal(uploads.length, count, 'Lost response retry reuses committed immutable file');
    assert.equal(drafts.filter((ref) => ref.file_id === uuid(21)).length, 1);
    for (const outcome of ['before', 'after'] as const) {
      storageFailure = outcome;
      const priorJobs: number = cleanups.length;
      await assert.rejects(() => add(outcome === 'before' ? 30 : 31, 9), OutputDocumentError);
      const exact: string = uploads[uploads.length - 1];
      assert.deepEqual(cleanups[priorJobs].storage_paths, [exact]);
      assert.equal(cleanups[priorJobs].status, 'PENDING');
      assert.equal(stored.has(exact), outcome === 'after');
      assert.equal(deleted.length, 0, 'Storage errors never cause immediate deletion');
    }
    storageFailure = undefined;
    concurrentUploads = true;
    const beforeRace = activity.length;
    const race = await Promise.all([add(32, 9), add(32, 9)]);
    concurrentUploads = false;
    assert.equal(race[0].fileId, race[1].fileId);
    assert.equal(drafts.filter((ref) => ref.file_id === uuid(32)).length, 1);
    assert.equal(activity.length, beforeRace + 1);
    const successfulPath = assets.find((asset) => asset.id === uuid(32))!.storage_path;
    assert(stored.has(successfulPath));
    assert(!cleanups.some((job) => job.storage_paths.includes(successfulPath)), 'Concurrent receipt preserves the referenced winning object');
    assert.equal(deleted.length, 0);
    failTracking = true; storageFailure = 'after';
    const originalError = console.error;
    const safeLogs: unknown[][] = [];
    console.error = (...args: unknown[]) => { safeLogs.push(args); };
    try { await assert.rejects(() => add(33, 10), OutputDocumentError); }
    finally { console.error = originalError; }
    assert.equal(safeLogs.length, 1);
    const logged = JSON.stringify(safeLogs);
    assert(!logged.includes(uploads[uploads.length - 1]) && !logged.includes('same-name.pdf'));
    assert(logged.includes('uploadAttemptId'));
    failTracking = false; storageFailure = undefined;
    project.is_postponed = true;
    await assert.rejects(() => add(22, 10), (error: any) => error.statusCode === 403);
    project.is_postponed = false; milestone.start_date = '2999-01-01';
    await assert.rejects(() => add(22, 9), (error: any) => error.statusCode === 409);
    console.log('Output draft files: CAS, immutable snapshots, retry, permissions, signed file ownership and exact cleanup passed');
  } finally {
    supabaseAdmin.from = originals.from; supabaseAdmin.rpc = originals.rpc;
    DocumentStorageService.upload = originals.upload; DocumentStorageService.removeMany = originals.removeMany;
    DocumentStorageService.createSignedDownloadUrl = originals.sign;
    (workflow as any).logWorkflowActivityBestEffort = originals.activity;
    (workflow as any).advanceToNextMilestone = originals.advance;
    OutputNotificationOutboxWorker.runOnceBestEffort = originals.deliver;
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
