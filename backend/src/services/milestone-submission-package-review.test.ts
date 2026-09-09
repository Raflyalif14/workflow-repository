import { supabaseAdmin } from '../config/supabase';
import { readFileSync } from 'fs';
import { join } from 'path';
import { DocumentStorageService } from '../utils/storage.util';
import {
  MilestoneSubmissionPackageReviewError,
  MilestoneSubmissionPackageReviewService,
} from './milestone-submission-package-review.service';
import { MilestoneApprovalService } from './milestone-approval.service';

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

type Scenario = {
  attachmentCount?: number;
  promotionFailsAt?: number;
  packageClaimFails?: boolean;
  rejectionClaimRestoreFails?: number;
  rejectionFinalizationFails?: number;
  activityLogFails?: boolean;
  packageStatus?: string;
  noPackage?: boolean;
  milestoneFinalizationFails?: boolean;
  hasNextMilestone?: boolean;
};

type State = {
  scenario: Scenario;
  package: Record<string, any> | null;
  attachments: Array<Record<string, any>>;
  documents: Array<Record<string, any>>;
  versions: Array<Record<string, any>>;
  approvals: Array<Record<string, any>>;
  storageDeleted: string[];
  tablesTouched: string[];
  remainingRejectedClaimRestoreFailures: number;
  remainingRejectionFinalizationFailures: number;
  project: { id: string; name: string; sales_id: string; pic_id?: string | null; status: string; is_postponed: boolean };
  milestone: { id: string; project_id: string; name: string; step_order: number; status: string; pic_id: string | null; completed_at: string | null; workflow_stage?: any };
  extraMilestones?: Array<Record<string, any>>;
};

const headSa = { userId: 'headsa-1', role: 'HEAD_SA', fullName: 'Head SA' };
const assignedSa = { userId: 'sa-pic', role: 'SA', fullName: 'SA PIC' };
const otherSa = { userId: 'sa-other', role: 'SA', fullName: 'Other SA' };
const salesOwner = { userId: 'sales-1', role: 'SALES', fullName: 'Sales Owner' };
const salesOther = { userId: 'sales-2', role: 'SALES', fullName: 'Other Sales' };
const superAdmin = { userId: 'admin-1', role: 'SUPER_ADMIN', fullName: 'Admin' };

const makeState = (scenario: Scenario = {}): State => {
  const attachmentCount = scenario.attachmentCount ?? 1;
  const packageId = 'package-1';
  return {
    scenario,
    package: scenario.noPackage ? null : {
      id: packageId,
      project_id: 'project-1',
      milestone_id: 'milestone-1',
      milestone_approval_id: 'approval-1',
      submitted_by: assignedSa.userId,
      status: scenario.packageStatus || 'PENDING_REVIEW',
      attachment_count: attachmentCount,
      cleanup_status: 'NOT_REQUIRED',
      created_at: '2026-09-04T00:00:00.000Z',
      updated_at: '2026-09-04T00:00:00.000Z',
    },
    attachments: Array.from({ length: attachmentCount }, (_, index) => ({
      id: `attachment-${index + 1}`,
      package_id: packageId,
      file_name: `evidence-${index + 1}.pdf`,
      storage_path: `milestone-submissions/project-1/milestone-1/${packageId}/file-${index + 1}.pdf`,
      file_size: 100 + index,
      mime_type: 'application/pdf',
      uploaded_by: assignedSa.userId,
      status: 'PENDING',
      promoted_document_id: null,
    })),
    documents: [],
    versions: [],
    approvals: [{
      id: 'approval-1',
      milestone_id: 'milestone-1',
      submitted_by: assignedSa.userId,
      submission_note: null,
      status: 'PENDING',
      reviewed_by: null,
      review_note: null,
      submitted_at: '2026-09-04T00:00:00.000Z',
      reviewed_at: null,
    }],
    storageDeleted: [],
    tablesTouched: [],
    remainingRejectedClaimRestoreFailures: scenario.rejectionClaimRestoreFails || 0,
    remainingRejectionFinalizationFailures: scenario.rejectionFinalizationFails || 0,
    project: { id: 'project-1', name: 'Project 1', sales_id: salesOwner.userId, pic_id: assignedSa.userId, status: 'ACTIVE', is_postponed: false },
    milestone: {
      id: 'milestone-1',
      project_id: 'project-1',
      name: 'Customer Assessment',
      step_order: 1,
      status: 'SUBMITTED',
      pic_id: assignedSa.userId,
      completed_at: null,
      workflow_stage: { default_role: 'SA' },
    },
    extraMilestones: scenario.hasNextMilestone ? [{
      id: 'milestone-2',
      project_id: 'project-1',
      name: 'Solution Design',
      step_order: 2,
      status: 'CREATED',
      pic_id: assignedSa.userId,
      completed_at: null,
      workflow_stage: { default_role: 'SA' },
    }] : [],
  };
};

class QueryMock {
  private operation: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private payload: any;
  private readonly filters: Array<{ column: string; value: unknown }> = [];
  private readonly inFilters: Array<{ column: string; values: unknown[] }> = [];
  private singleRow = false;

  constructor(private readonly state: State, private readonly table: string) {
    state.tablesTouched.push(table);
  }

  select(): this { return this; }
  insert(payload: any): this { this.operation = 'insert'; this.payload = payload; return this; }
  update(payload: any): this { this.operation = 'update'; this.payload = payload; return this; }
  delete(): this { this.operation = 'delete'; return this; }
  eq(column: string, value: unknown): this { this.filters.push({ column, value }); return this; }
  in(column: string, values: unknown[]): this { this.inFilters.push({ column, values }); return this; }
  is(column: string, value: unknown): this { return this.eq(column, value); }
  order(): this { return this; }
  limit(): this { return this; }
  maybeSingle(): Promise<{ data: any; error: any }> { this.singleRow = true; return Promise.resolve(this.execute()); }
  single(): Promise<{ data: any; error: any }> { this.singleRow = true; return Promise.resolve(this.execute()); }
  then<TResult1 = { data: any; error: any }, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> { return Promise.resolve(this.execute()).then(onfulfilled, onrejected); }

  private value(column: string): unknown { return this.filters.find((filter) => filter.column === column)?.value; }
  private inValues(column: string): unknown[] | undefined { return this.inFilters.find((filter) => filter.column === column)?.values; }

  private execute(): { data: any; error: any } {
    if (this.table === 'milestone_submission_packages') return this.packages();
    if (this.table === 'milestone_submission_attachments') return this.attachments();
    if (this.table === 'documents') return this.documents();
    if (this.table === 'document_versions') return this.versions();
    if (this.table === 'document_version_approvals') return { data: null, error: null };
    if (this.table === 'project_milestones') return this.milestones();
    if (this.table === 'milestone_approvals') return this.approvals();
    if (this.table === 'projects') return this.projects();
    if (this.table === 'activity_logs') {
      return this.state.scenario.activityLogFails
        ? { data: null, error: { code: 'XX001' } }
        : { data: null, error: null };
    }
    if (this.table === 'notifications') return { data: { id: 'notif-1' }, error: null };
    if (this.table === 'users') {
      const users = [
        { id: headSa.userId, full_name: headSa.fullName, email: 'headsa@example.com' },
        { id: assignedSa.userId, full_name: assignedSa.fullName, email: 'sa@example.com' },
      ];
      if (this.singleRow) {
        const id = this.value('id');
        const user = users.find((u) => u.id === id) || users[0];
        return { data: user ? { ...user } : null, error: null };
      }
      return { data: users, error: null };
    }
    return { data: null, error: null };
  }

  private projects(): { data: any; error: any } {
    if (this.operation === 'select') return { data: { ...this.state.project }, error: null };
    if (this.operation === 'update') {
      if (this.value('status') && this.state.project.status !== this.value('status')) return { data: null, error: null };
      this.state.project = { ...this.state.project, ...this.payload };
      return { data: { ...this.state.project }, error: null };
    }
    return { data: null, error: null };
  }

  private packages(): { data: any; error: any } {
    if (!this.state.package) return { data: null, error: null };
    if (this.operation === 'select') return { data: { ...this.state.package }, error: null };
    if (this.operation !== 'update') return { data: null, error: null };
    if (this.value('id') !== this.state.package.id) return { data: null, error: null };
    const expectedStatus = this.value('status');
    if (expectedStatus && this.state.package.status !== expectedStatus) return { data: null, error: null };
    if (this.value('milestone_approval_id') !== this.state.package.milestone_approval_id) return { data: null, error: null };
    if (this.payload.status === 'PROMOTING' && this.state.scenario.packageClaimFails) return { data: null, error: null };
    if (
      this.payload.status === 'PENDING_REVIEW' &&
      expectedStatus === 'REJECTING' &&
      this.state.remainingRejectedClaimRestoreFailures > 0
    ) {
      this.state.remainingRejectedClaimRestoreFailures -= 1;
      return { data: null, error: { code: 'XX001' } };
    }
    if (this.payload.status === 'REJECTED' && this.state.remainingRejectionFinalizationFailures > 0) {
      this.state.remainingRejectionFinalizationFailures -= 1;
      return { data: null, error: { code: 'XX001' } };
    }
    this.state.package = { ...this.state.package, ...this.payload };
    return { data: { ...this.state.package }, error: null };
  }

  private attachments(): { data: any; error: any } {
    const packageId = this.value('package_id');
    const status = this.value('status');
    const ids = this.inValues('id');
    const matching = this.state.attachments.filter((attachment) =>
      (!packageId || attachment.package_id === packageId) &&
      (!status || attachment.status === status) &&
      (!ids || ids.includes(attachment.id)) &&
      (this.value('id') === undefined || attachment.id === this.value('id')) &&
      (this.value('promoted_document_id') === undefined || attachment.promoted_document_id === this.value('promoted_document_id'))
    );
    if (this.operation === 'select') {
      const data = matching.map((attachment) => ({ ...attachment }));
      return { data: this.value('id') ? data[0] || null : data, error: null };
    }
    if (this.operation === 'delete') {
      this.state.attachments = this.state.attachments.filter((attachment) => !matching.includes(attachment));
      return { data: matching.map((attachment) => ({ id: attachment.id })), error: null };
    }
    if (this.operation === 'update') {
      this.state.attachments = this.state.attachments.map((attachment) =>
        matching.includes(attachment) ? { ...attachment, ...this.payload } : attachment
      );
      const data = matching.map((attachment) => ({ id: attachment.id }));
      return { data: this.value('id') ? data[0] || null : data, error: null };
    }
    return { data: null, error: null };
  }

  private documents(): { data: any; error: any } {
    if (this.operation === 'insert') {
      const next = { ...this.payload };
      this.state.documents.push(next);
      return { data: { id: next.id }, error: null };
    }
    if (this.operation === 'delete') {
      const id = this.value('id');
      const document = this.state.documents.find((entry) => entry.id === id);
      if (!document) return { data: null, error: null };
      this.state.documents = this.state.documents.filter((entry) => entry.id !== id);
      this.state.versions = this.state.versions.filter((entry) => entry.document_id !== id);
      return { data: { id }, error: null };
    }
    return { data: null, error: null };
  }

  private versions(): { data: any; error: any } {
    if (this.operation !== 'insert') return { data: null, error: null };
    if (this.state.scenario.promotionFailsAt && this.state.versions.length + 1 === this.state.scenario.promotionFailsAt) {
      return { data: null, error: { code: 'XX001' } };
    }
    this.state.versions.push({ ...this.payload });
    return { data: null, error: null };
  }

  private approvals(): { data: any; error: any } {
    const approval = this.state.approvals.find((entry) => entry.id === this.value('id')) || null;
    if (this.operation === 'select') return { data: approval ? { ...approval } : null, error: null };
    if (this.operation !== 'update' || !approval || (this.value('status') && approval.status !== this.value('status'))) {
      return { data: null, error: null };
    }
    Object.assign(approval, this.payload);
    return { data: { ...approval }, error: null };
  }

  private milestones(): { data: any; error: any } {
    const all = [this.state.milestone, ...(this.state.extraMilestones || [])];
    const id = this.value('id');
    if (this.operation === 'select') {
      if (this.singleRow || id) {
        const target = all.find((m) => m.id === id) || this.state.milestone;
        return {
          data: {
            ...target,
            project: { ...this.state.project },
          },
          error: null,
        };
      }
      return {
        data: all.map((m) => ({
          ...m,
          project: { ...this.state.project },
        })),
        error: null,
      };
    }
    if (this.operation !== 'update') return { data: null, error: null };
    const target = all.find((m) => m.id === id) || this.state.milestone;
    if (this.value('status') && target.status !== this.value('status')) return { data: null, error: null };
    if (this.state.scenario.milestoneFinalizationFails && ['COMPLETED', 'REJECTED'].includes(this.payload.status)) {
      return { data: null, error: null };
    }
    Object.assign(target, this.payload);
    return { data: { ...target }, error: null };
  }
}

async function withScenario<T>(scenario: Scenario, action: (state: State) => Promise<T>): Promise<T> {
  const state = makeState(scenario);
  const originalFrom = supabaseAdmin.from;
  const originalRemove = DocumentStorageService.remove;

  try {
    (supabaseAdmin as any).from = (table: string) => new QueryMock(state, table);
    (DocumentStorageService as any).remove = async (storagePath: string) => {
      state.storageDeleted.push(storagePath);
    };
    return await action(state);
  } finally {
    (supabaseAdmin as any).from = originalFrom;
    (DocumentStorageService as any).remove = originalRemove;
  }
}

async function expectReviewError(action: () => Promise<unknown>, message: string, statusCode: number): Promise<void> {
  try {
    await action();
    throw new Error(`Expected review failure: ${message}`);
  } catch (error) {
    assert(error instanceof MilestoneSubmissionPackageReviewError, `Expected review error: ${message}`);
    assert((error as MilestoneSubmissionPackageReviewError).message === message, `Expected message: ${message}`);
    assert((error as MilestoneSubmissionPackageReviewError).statusCode === statusCode, `Expected HTTP ${statusCode}: ${message}`);
  }
}

async function run(): Promise<void> {
  await withScenario({}, async (state) => {
    const operation = await MilestoneSubmissionPackageReviewService.beginReview('approval-1', 'APPROVED');
    assert(Boolean(operation), 'Test 1: linked package must be claimed');
    await MilestoneSubmissionPackageReviewService.promote(operation!);
    assert(state.documents.length === 1 && state.versions.length === 1, 'Test 1: one pending attachment must create document and version');
    assert(state.documents[0].project_id === 'project-1' && state.documents[0].milestone_id === 'milestone-1', 'Test 1: promoted document must retain project and milestone');
    assert(state.documents[0].category === 'OTHER' && state.documents[0].status === 'APPROVED', 'Test 1: document must use valid approved generic evidence category');
    assert(state.versions[0].status === 'APPROVED' && state.versions[0].version_number === 1, 'Test 1: version one must be approved immediately');
    assert(!state.tablesTouched.includes('document_version_approvals'), 'Test 1: promotion must not create document version approvals');
    assert(state.attachments[0].status === 'PROMOTED' && state.attachments[0].promoted_document_id, 'Test 1: attachment must link promoted document');
    assert(state.package?.status === 'APPROVED', 'Test 1: package must finalize as approved');
    console.log('Test 1 - Approval promotes one pending attachment to an approved official document/version: passed');
  });

  await withScenario({ attachmentCount: 2 }, async (state) => {
    const operation = await MilestoneSubmissionPackageReviewService.beginReview('approval-1', 'APPROVED');
    await MilestoneSubmissionPackageReviewService.promote(operation!);
    assert(state.documents.length === 2 && state.versions.length === 2, 'Test 2: all pending attachments must promote');
    assert(state.attachments.every((attachment) => attachment.status === 'PROMOTED'), 'Test 2: every attachment must be promoted');
    console.log('Test 2 - Approval promotes multiple attachments atomically at package level: passed');
  });

  await withScenario({ attachmentCount: 2, promotionFailsAt: 2 }, async (state) => {
    const operation = await MilestoneSubmissionPackageReviewService.beginReview('approval-1', 'APPROVED');
    await expectReviewError(
      () => MilestoneSubmissionPackageReviewService.promote(operation!),
      'Failed to promote milestone submission attachments.',
      500
    );
    assert(state.documents.length === 0 && state.versions.length === 0, 'Test 3: promotion failure must remove earlier official documents and versions');
    assert(state.attachments.every((attachment) => attachment.status === 'PENDING' && !attachment.promoted_document_id), 'Test 3: rollback must restore pending attachment metadata');
    assert(state.package?.status === 'PENDING_REVIEW', 'Test 3: promotion failure must restore package review state');
    console.log('Test 3 - Promotion failure compensates earlier document/version promotion safely: passed');
  });

  await withScenario({}, async (state) => {
    const operation = await MilestoneSubmissionPackageReviewService.beginReview('approval-1', 'REJECTED');
    await MilestoneSubmissionPackageReviewService.reject(operation!);
    assert(state.storageDeleted.length === 0, 'Test 4: rejection must retain private storage objects');
    assert(state.attachments.length === 1 && state.attachments[0].status === 'REJECTED', 'Test 4: rejection must retain attachment metadata as rejected evidence');
    assert(state.package?.status === 'REJECTED' && state.package.cleanup_status === 'NOT_REQUIRED', 'Test 4: rejection must retain package history without cleanup');
    assert(state.documents.length === 0, 'Test 4: rejected files must never create official documents');
    console.log('Test 4 - Rejection retains private storage and attachment metadata as historical evidence: passed');
  });

  await withScenario({}, async (state) => {
    const operation = await MilestoneSubmissionPackageReviewService.beginReview('approval-1', 'REJECTED');
    await MilestoneSubmissionPackageReviewService.reject(operation!);
    const headSaResult = await MilestoneSubmissionPackageReviewService.getCurrentPackage('milestone-1', headSa);
    assert(headSaResult?.status === 'REJECTED' && headSaResult.attachments[0]?.status === 'REJECTED', 'Test 5: HEAD_SA may read retained rejected attachment metadata');
    const assignedResult = await MilestoneSubmissionPackageReviewService.getCurrentPackage('milestone-1', assignedSa);
    assert(assignedResult?.attachments.length === 1, 'Test 5: assigned PIC may read retained rejected attachment metadata');
    const adminResult = await MilestoneSubmissionPackageReviewService.getCurrentPackage('milestone-1', superAdmin);
    assert(adminResult?.attachments.length === 1, 'Test 5: SUPER_ADMIN may read retained rejected attachment metadata');
    await expectReviewError(
      () => MilestoneSubmissionPackageReviewService.getCurrentPackage('milestone-1', salesOwner),
      'Milestone not found',
      404
    );
    console.log('Test 5 - Rejected attachment metadata remains readable only to reviewers and the assigned PIC: passed');
  });

  await withScenario({}, async (state) => {
    const result = await MilestoneApprovalService.rejectMilestoneApproval('approval-1', { note: 'Please revise.' }, headSa);
    assert(result.status === 'REJECTED' && state.milestone.status === 'REJECTED', 'Test 5b: package-backed rejection must finalize the existing milestone review');
    assert(state.approvals[0].status === 'REJECTED' && state.package?.status === 'REJECTED', 'Test 5b: package-backed rejection must finalize approval and package');
    assert(state.storageDeleted.length === 0 && state.attachments.every((attachment) => attachment.status === 'REJECTED'), 'Test 5b: package-backed rejection must retain rejected files and metadata');
    assert(state.approvals[0].review_note === 'Please revise.', 'Test 5b: rejection note must remain visible with retained evidence');
    assert(state.documents.length === 0, 'Test 5b: package-backed rejection must never create documents');
    console.log('Test 5b - Package-backed rejection completes the existing milestone rejection flow: passed');
  });

  await withScenario({ packageStatus: 'APPROVED' }, async () => {
    await expectReviewError(
      () => MilestoneSubmissionPackageReviewService.beginReview('approval-1', 'APPROVED'),
      'Milestone submission package is no longer pending review.',
      409
    );
    console.log('Test 6 - Double review / approve-reject race is rejected by package CAS: passed');
  });

  await withScenario({}, async (state) => {
    const headSaResult = await MilestoneSubmissionPackageReviewService.getCurrentPackage('milestone-1', headSa);
    assert(headSaResult?.attachments.length === 1, 'Test 7: HEAD_SA may read safe package metadata');
    const result = await MilestoneSubmissionPackageReviewService.getCurrentPackage('milestone-1', assignedSa);
    assert(result?.attachments.length === 1 && result.attachments[0].file_name === 'evidence-1.pdf', 'Test 7: assigned PIC may read safe package metadata');
    const adminResult = await MilestoneSubmissionPackageReviewService.getCurrentPackage('milestone-1', superAdmin);
    assert(adminResult?.id === state.package?.id, 'Test 7: SUPER_ADMIN may read package metadata');
    await expectReviewError(
      () => MilestoneSubmissionPackageReviewService.getCurrentPackage('milestone-1', salesOwner),
      'Milestone not found',
      404
    );
    await expectReviewError(
      () => MilestoneSubmissionPackageReviewService.getCurrentPackage('milestone-1', otherSa),
      'Milestone not found',
      404
    );
    await expectReviewError(
      () => MilestoneSubmissionPackageReviewService.getCurrentPackage('milestone-1', salesOther),
      'Milestone not found',
      404
    );
    console.log('Test 7 - Pending attachment metadata is limited to reviewers and the assigned PIC: passed');
  });

  await withScenario({}, async () => {
    const originalSignedUrl = DocumentStorageService.createSignedDownloadUrl;
    try {
      (DocumentStorageService as any).createSignedDownloadUrl = async (storagePath: string) => {
        assert(storagePath.includes('milestone-submissions/'), 'Test 8: signed URL must derive storage path only from server attachment metadata');
        return 'https://signed.example/temporary';
      };
      const download = await MilestoneSubmissionPackageReviewService.getPendingAttachmentDownloadUrl('milestone-1', 'attachment-1', headSa);
      assert(download.url === 'https://signed.example/temporary' && download.attachment_id === 'attachment-1', 'Test 8: authorized review download must return a short-lived signed URL');
      const assignedDownload = await MilestoneSubmissionPackageReviewService.getPendingAttachmentDownloadUrl('milestone-1', 'attachment-1', assignedSa);
      assert(assignedDownload.url === 'https://signed.example/temporary', 'Test 8: assigned PIC may download a pending attachment');
      const adminDownload = await MilestoneSubmissionPackageReviewService.getPendingAttachmentDownloadUrl('milestone-1', 'attachment-1', superAdmin);
      assert(adminDownload.url === 'https://signed.example/temporary', 'Test 8: SUPER_ADMIN may download a pending attachment');
      await expectReviewError(
        () => MilestoneSubmissionPackageReviewService.getPendingAttachmentDownloadUrl('milestone-1', 'attachment-1', salesOwner),
        'Milestone not found',
        404
      );
    } finally {
      (DocumentStorageService as any).createSignedDownloadUrl = originalSignedUrl;
    }
    console.log('Test 8 - Pending attachment signed download is authorized and server-path-derived: passed');
  });

  await withScenario({}, async (state) => {
    const operation = await MilestoneSubmissionPackageReviewService.beginReview('approval-1', 'REJECTED');
    await MilestoneSubmissionPackageReviewService.reject(operation!);
    const originalSignedUrl = DocumentStorageService.createSignedDownloadUrl;
    try {
      (DocumentStorageService as any).createSignedDownloadUrl = async () => 'https://signed.example/rejected';
      const headSaDownload = await MilestoneSubmissionPackageReviewService.getPendingAttachmentDownloadUrl('milestone-1', 'attachment-1', headSa);
      const assignedDownload = await MilestoneSubmissionPackageReviewService.getPendingAttachmentDownloadUrl('milestone-1', 'attachment-1', assignedSa);
      const adminDownload = await MilestoneSubmissionPackageReviewService.getPendingAttachmentDownloadUrl('milestone-1', 'attachment-1', superAdmin);
      assert(headSaDownload.url === 'https://signed.example/rejected', 'Test 8b: HEAD_SA may download retained rejected evidence');
      assert(assignedDownload.url === 'https://signed.example/rejected', 'Test 8b: assigned PIC may download retained rejected evidence');
      assert(adminDownload.url === 'https://signed.example/rejected', 'Test 8b: SUPER_ADMIN may download retained rejected evidence');
      await expectReviewError(
        () => MilestoneSubmissionPackageReviewService.getPendingAttachmentDownloadUrl('milestone-1', 'attachment-1', salesOwner),
        'Milestone not found',
        404
      );
      await expectReviewError(
        () => MilestoneSubmissionPackageReviewService.getPendingAttachmentDownloadUrl('milestone-1', 'attachment-1', otherSa),
        'Milestone not found',
        404
      );
    } finally {
      (DocumentStorageService as any).createSignedDownloadUrl = originalSignedUrl;
    }
    assert(state.storageDeleted.length === 0, 'Test 8b: rejected evidence download must not trigger storage cleanup');
    console.log('Test 8b - Retained rejected evidence uses the same role-scoped signed download path: passed');
  });

  await withScenario({ milestoneFinalizationFails: true }, async (state) => {
    await expectReviewError(
      () => MilestoneApprovalService.approveMilestoneApproval('approval-1', {}, headSa),
      'Only a SUBMITTED milestone can be reviewed.',
      409
    );
    assert(state.milestone.status === 'SUBMITTED', 'Test 9: failed milestone finalization must keep milestone submitted');
    assert(state.approvals[0].status === 'PENDING', 'Test 9: failed milestone finalization must restore approval pending state');
    assert(state.documents.length === 0 && state.versions.length === 0, 'Test 9: failed milestone finalization must remove promoted documents and versions');
    assert(state.attachments.every((attachment) => attachment.status === 'PENDING' && !attachment.promoted_document_id), 'Test 9: failed milestone finalization must restore attachment metadata');
    assert(state.package?.status === 'PENDING_REVIEW', 'Test 9: failed milestone finalization must restore the package review state');
    console.log('Test 9 - Milestone finalization failure compensates promoted documents and package state: passed');
  });

  await withScenario({ milestoneFinalizationFails: true }, async (state) => {
    await expectReviewError(
      () => MilestoneApprovalService.rejectMilestoneApproval('approval-1', { note: 'Please revise.' }, headSa),
      'Only a SUBMITTED milestone can be reviewed.',
      409
    );
    assert(state.approvals[0].status === 'PENDING' && state.milestone.status === 'SUBMITTED', 'Test 9b: failed rejection must restore approval and milestone to retryable workflow state');
    assert(state.package?.status === 'PENDING_REVIEW', 'Test 9b: failed rejection must restore the package claim');
    assert(state.attachments.every((attachment) => attachment.status === 'PENDING'), 'Test 9b: failed rejection must not mark attachments rejected');
    assert(state.storageDeleted.length === 0, 'Test 9b: failed rejection must not delete retained evidence');
    console.log('Test 9b - Rejection finalizes retained evidence only after durable workflow rejection: passed');
  });

  await withScenario({ milestoneFinalizationFails: true, rejectionClaimRestoreFails: 1 }, async (state) => {
    await expectReviewError(
      () => MilestoneApprovalService.rejectMilestoneApproval('approval-1', { note: 'Please revise.' }, headSa),
      'Only a SUBMITTED milestone can be reviewed.',
      409
    );
    assert(state.package?.status === 'REJECTING', 'Test 9c: a failed rollback can leave the package rejection claim pending recovery');
    assert(state.approvals.length === 1 && state.approvals[0].status === 'PENDING' && state.milestone.status === 'SUBMITTED', 'Test 9c: the pre-durable workflow state must remain retryable');
    assert(state.attachments.every((attachment) => attachment.status === 'PENDING') && state.storageDeleted.length === 0, 'Test 9c: recovery must retain pending attachments and storage');

    state.scenario.milestoneFinalizationFails = false;
    state.package!.updated_at = '2000-01-01T00:00:00.000Z';
    const retry = await MilestoneApprovalService.rejectMilestoneApproval('approval-1', { note: 'Please revise.' }, headSa);
    assert(retry.status === 'REJECTED' && state.package?.status === 'REJECTED', 'Test 9c: stale non-durable rejection claims must recover into a successful retry');
    assert(state.approvals.length === 1 && state.approvals[0].status === 'REJECTED' && state.milestone.status === 'REJECTED', 'Test 9c: recovery must not create duplicate approval or review state');
    assert(state.attachments.every((attachment) => attachment.status === 'REJECTED') && state.storageDeleted.length === 0, 'Test 9c: successful retry must retain rejected evidence');
    console.log('Test 9c - Stale pre-durable REJECTING claim is recovered safely for retry: passed');
  });

  await withScenario({ rejectionFinalizationFails: 1 }, async (state) => {
    await expectReviewError(
      () => MilestoneApprovalService.rejectMilestoneApproval('approval-1', { note: 'Please revise.' }, headSa),
      'Failed to finalize milestone submission rejection.',
      500
    );
    assert(state.approvals[0].status === 'REJECTED' && state.milestone.status === 'REJECTED', 'Test 9d: durable workflow rejection must not be rolled back when package finalization fails');
    assert(state.package?.status === 'REJECTING' && state.attachments.every((attachment) => attachment.status === 'REJECTED'), 'Test 9d: retained evidence waits safely for reconciliation');
    const retry = await MilestoneApprovalService.rejectMilestoneApproval('approval-1', { note: 'ignored on reconciliation' }, headSa);
    assert(retry.status === 'REJECTED' && state.package?.status === 'REJECTED', 'Test 9d: retry must finalize an already durable rejection');
    assert(state.attachments.every((attachment) => attachment.status === 'REJECTED'), 'Test 9d: retry must not rewrite retained evidence');
    assert(state.documents.length === 0 && state.storageDeleted.length === 0, 'Test 9d: retry must not promote or delete rejected evidence');
    console.log('Test 9d - Durable rejection retry reconciles package finalization without duplicate workflow actions: passed');
  });

  await withScenario({ activityLogFails: true }, async (state) => {
    const result = await MilestoneApprovalService.rejectMilestoneApproval('approval-1', { note: 'Please revise.' }, headSa);
    assert(result.status === 'REJECTED' && state.milestone.status === 'REJECTED', 'Test 9e: activity logging failure must not report a durable rejection as failed');
    assert(state.package?.status === 'REJECTED' && state.attachments.every((attachment) => attachment.status === 'REJECTED'), 'Test 9e: activity logging failure must preserve retained rejection evidence');
    console.log('Test 9e - Activity log failure remains best-effort after durable rejection: passed');
  });

  await withScenario({ noPackage: true }, async (state) => {
    const result = await MilestoneApprovalService.rejectMilestoneApproval('approval-1', { note: 'Please revise.' }, headSa);
    assert(result.status === 'REJECTED' && state.milestone.status === 'REJECTED', 'Test 10: legacy package-less rejection must retain existing milestone behavior');
    assert(state.approvals[0].status === 'REJECTED', 'Test 10: legacy package-less approval must still be finalized');
    assert(state.documents.length === 0 && state.versions.length === 0, 'Test 10: legacy review must not invoke package promotion');
    console.log('Test 10 - Legacy package-less milestone approval continues through the existing review flow: passed');
  });

  await withScenario({ hasNextMilestone: true }, async (state) => {
    // 1. Initial normal approval
    const result = await MilestoneApprovalService.approveMilestoneApproval('approval-1', { note: 'Approved evidence.' }, headSa);
    assert(result.status === 'COMPLETED', 'Test 11: milestone review must complete milestone');
    assert(state.approvals[0].status === 'APPROVED', 'Test 11: approval record must be APPROVED');
    assert(state.milestone.status === 'COMPLETED', 'Test 11: milestone must be COMPLETED');
    assert(state.package?.status === 'APPROVED', 'Test 11: package must be APPROVED');
    assert(state.documents.length === 1, 'Test 11: promoted document must be created');
    assert(state.versions.length === 1, 'Test 11: promoted version must be created');
    assert(result.next_milestone?.id === 'milestone-2', 'Test 11: progression must advance to next milestone');
    assert(state.extraMilestones![0].status === 'IN_PROGRESS', 'Test 11: next milestone must be started');

    // 2. Retry of the HEAD_SA approval on the already durable APPROVED/COMPLETED milestone
    const initialReviewedAt = state.approvals[0].reviewed_at;
    const initialCompletedAt = state.milestone.completed_at;
    const initialDocId = state.documents[0].id;

    const retryResult = await MilestoneApprovalService.approveMilestoneApproval('approval-1', {}, headSa);
    assert(retryResult.status === 'COMPLETED', 'Test 11: retry must return completed status');
    assert(retryResult.approval.status === 'APPROVED', 'Test 11: retry approval must be APPROVED');
    assert(state.documents.length === 1, 'Test 11: retry must NOT create duplicate documents');
    assert(state.versions.length === 1, 'Test 11: retry must NOT create duplicate versions');
    assert(state.documents[0].id === initialDocId, 'Test 11: document id must remain identical');
    assert(state.approvals[0].reviewed_at === initialReviewedAt, 'Test 11: retry must NOT rewrite review timestamp');
    assert(state.milestone.completed_at === initialCompletedAt, 'Test 11: retry must NOT rewrite milestone completed_at');
    assert(state.extraMilestones![0].status === 'IN_PROGRESS', 'Test 11: next milestone must remain IN_PROGRESS');
    assert(retryResult.next_milestone?.id === 'milestone-2', 'Test 11: retry progression returns current next milestone');

    // 3. Retry by unauthorized actor must be rejected
    let unauthorizedCaught = false;
    try {
      await MilestoneApprovalService.approveMilestoneApproval('approval-1', {}, assignedSa as any);
    } catch (err: any) {
      if (err.message === 'Forbidden') unauthorizedCaught = true;
    }
    assert(unauthorizedCaught, 'Test 11: non-HEAD_SA retry must be rejected');

    console.log('Test 11 - HEAD_SA approved milestone progression recovery prevents duplicate package promotion, documents, and review writes: passed');
  });

  await withScenario({ hasNextMilestone: true }, async (state) => {
    // Simulate partial failure: package is APPROVED, approval is APPROVED, milestone is COMPLETED,
    // but progression failed previously so next milestone is still CREATED.
    state.package!.status = 'APPROVED';
    state.approvals[0].status = 'APPROVED';
    state.approvals[0].reviewed_by = headSa.userId;
    state.approvals[0].reviewed_at = '2026-09-05T00:00:00.000Z';
    state.milestone.status = 'COMPLETED';
    state.milestone.completed_at = '2026-09-05T00:00:00.000Z';
    state.extraMilestones![0].status = 'CREATED';

    // Promotion already happened in previous run
    state.documents.push({ id: 'doc-existing', project_id: 'project-1', milestone_id: 'milestone-1', category: 'OTHER', status: 'APPROVED' });
    state.versions.push({ id: 'ver-existing', document_id: 'doc-existing', version_number: 1, status: 'APPROVED' });

    // Retry HEAD_SA approval reconciles progression and starts next stage once
    const result = await MilestoneApprovalService.approveMilestoneApproval('approval-1', {}, headSa);
    assert(result.status === 'COMPLETED', 'Test 12: recovery returns completed status');
    assert(state.extraMilestones![0].status === 'IN_PROGRESS', 'Test 12: recovery starts next CREATED milestone');
    assert(result.next_milestone?.id === 'milestone-2', 'Test 12: result includes started next milestone');
    assert(state.documents.length === 1, 'Test 12: no duplicate documents created');
    assert(state.versions.length === 1, 'Test 12: no duplicate versions created');
    console.log('Test 12 - HEAD_SA approval recovery reconciles progression when next stage start previously failed: passed');
  });

  await withScenario({}, async (state) => {
    // Single milestone (final step)
    // Simulate approval already durable, project still ACTIVE (partial failure)
    state.package!.status = 'APPROVED';
    state.approvals[0].status = 'APPROVED';
    state.approvals[0].reviewed_by = headSa.userId;
    state.approvals[0].reviewed_at = '2026-09-05T00:00:00.000Z';
    state.milestone.status = 'COMPLETED';
    state.milestone.completed_at = '2026-09-05T00:00:00.000Z';
    state.project.status = 'ACTIVE';

    const result = await MilestoneApprovalService.approveMilestoneApproval('approval-1', {}, headSa);
    assert(result.project_completed === true, 'Test 13: final milestone recovery completes project');
    assert(state.project.status === 'COMPLETED', 'Test 13: project status becomes COMPLETED');

    // Duplicate call when project already COMPLETED
    const dupResult = await MilestoneApprovalService.approveMilestoneApproval('approval-1', {}, headSa);
    assert(dupResult.project_completed === true, 'Test 13: duplicate call returns project_completed true');
    console.log('Test 13 - HEAD_SA final milestone recovery reconciles project completion and is safe when already COMPLETED: passed');
  });

  const migrationSource = readFileSync(join(__dirname, '../../supabase/phase11n-retain-rejected-submission-attachments.sql'), 'utf8');
  assert(migrationSource.includes("'REJECTED'"), 'Test 14: retention migration must allow rejected submission attachment status');
  assert(migrationSource.includes("'CLEANUP_FAILED'"), 'Test 14: retention migration must preserve existing cleanup statuses');
  console.log('Test 14 - Rejected submission attachment migration is additive and preserves existing statuses: passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
