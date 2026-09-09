import { supabaseAdmin } from '../config/supabase';
import { DocumentStorageService } from '../utils/storage.util';
import {
  MilestoneSubmissionPackageReviewError,
  MilestoneSubmissionPackageReviewService,
} from './milestone-submission-package-review.service';

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

type Row = Record<string, any>;

type HistoryState = {
  packages: Row[];
  attachments: Row[];
  approvals: Row[];
  users: Row[];
  tables: string[];
  signedPaths: string[];
  storageRemovals: string[];
};

const headSa = { userId: 'head-sa-1', role: 'HEAD_SA', fullName: 'Head SA' };
const superAdmin = { userId: 'admin-1', role: 'SUPER_ADMIN', fullName: 'Admin' };
const assignedSa = { userId: 'sa-pic-1', role: 'SA', fullName: 'Assigned SA' };
const unrelatedSa = { userId: 'sa-other-1', role: 'SA', fullName: 'Other SA' };
const salesOwner = { userId: 'sales-1', role: 'SALES', fullName: 'Sales Owner' };

const createState = (): HistoryState => ({
  packages: [
    {
      id: 'package-1',
      project_id: 'project-1',
      milestone_id: 'milestone-1',
      milestone_approval_id: 'approval-1',
      submitted_by: assignedSa.userId,
      status: 'REJECTED',
      attachment_count: 1,
      cleanup_status: 'NOT_REQUIRED',
      created_at: '2026-09-01T08:00:00.000Z',
      updated_at: '2026-09-01T09:00:00.000Z',
    },
    {
      id: 'package-2',
      project_id: 'project-1',
      milestone_id: 'milestone-1',
      milestone_approval_id: 'approval-2',
      submitted_by: assignedSa.userId,
      status: 'PENDING_REVIEW',
      attachment_count: 1,
      cleanup_status: 'NOT_REQUIRED',
      created_at: '2026-09-02T08:00:00.000Z',
      updated_at: '2026-09-02T08:00:00.000Z',
    },
    {
      id: 'package-3',
      project_id: 'project-1',
      milestone_id: 'milestone-1',
      milestone_approval_id: 'approval-3',
      submitted_by: assignedSa.userId,
      status: 'APPROVED',
      attachment_count: 1,
      cleanup_status: 'NOT_REQUIRED',
      created_at: '2026-09-03T08:00:00.000Z',
      updated_at: '2026-09-03T09:00:00.000Z',
    },
  ],
  attachments: [
    {
      id: 'attachment-1', package_id: 'package-1', file_name: 'revision-one.pdf',
      storage_path: 'milestone-submissions/project-1/milestone-1/package-1/revision-one.pdf',
      file_size: 100, mime_type: 'application/pdf', uploaded_by: assignedSa.userId,
      status: 'REJECTED', promoted_document_id: null, created_at: '2026-09-01T08:00:00.000Z',
    },
    {
      id: 'attachment-2', package_id: 'package-2', file_name: 'revision-two.pdf',
      storage_path: 'milestone-submissions/project-1/milestone-1/package-2/revision-two.pdf',
      file_size: 200, mime_type: 'application/pdf', uploaded_by: assignedSa.userId,
      status: 'PENDING', promoted_document_id: null, created_at: '2026-09-02T08:00:00.000Z',
    },
    {
      id: 'attachment-3', package_id: 'package-3', file_name: 'revision-three.pdf',
      storage_path: 'milestone-submissions/project-1/milestone-1/package-3/revision-three.pdf',
      file_size: 300, mime_type: 'application/pdf', uploaded_by: assignedSa.userId,
      status: 'PROMOTED', promoted_document_id: 'document-3', created_at: '2026-09-03T08:00:00.000Z',
    },
  ],
  approvals: [
    {
      id: 'approval-1', milestone_id: 'milestone-1', submitted_by: assignedSa.userId,
      submission_note: 'First revision', status: 'REJECTED', reviewed_by: headSa.userId,
      review_note: 'Please revise the assessment.', submitted_at: '2026-09-01T08:00:00.000Z',
      reviewed_at: '2026-09-01T09:00:00.000Z',
    },
    {
      id: 'approval-2', milestone_id: 'milestone-1', submitted_by: assignedSa.userId,
      submission_note: 'Second revision', status: 'PENDING', reviewed_by: null,
      review_note: null, submitted_at: '2026-09-02T08:00:00.000Z', reviewed_at: null,
    },
    {
      id: 'approval-3', milestone_id: 'milestone-1', submitted_by: assignedSa.userId,
      submission_note: 'Third revision', status: 'APPROVED', reviewed_by: headSa.userId,
      review_note: 'Approved.', submitted_at: '2026-09-03T08:00:00.000Z',
      reviewed_at: '2026-09-03T09:00:00.000Z',
    },
  ],
  users: [
    { id: assignedSa.userId, full_name: assignedSa.fullName },
    { id: headSa.userId, full_name: headSa.fullName },
  ],
  tables: [],
  signedPaths: [],
  storageRemovals: [],
});

class QueryMock {
  private readonly equals: Array<{ column: string; value: unknown }> = [];
  private readonly inFilters: Array<{ column: string; values: unknown[] }> = [];
  private readonly orders: Array<{ column: string; ascending: boolean }> = [];
  private singleRow = false;

  constructor(private readonly state: HistoryState, private readonly table: string) {
    state.tables.push(table);
  }

  select(): this { return this; }
  eq(column: string, value: unknown): this { this.equals.push({ column, value }); return this; }
  in(column: string, values: unknown[]): this { this.inFilters.push({ column, values }); return this; }
  order(column: string, options?: { ascending?: boolean }): this {
    this.orders.push({ column, ascending: options?.ascending !== false });
    return this;
  }
  maybeSingle(): Promise<{ data: Row | null; error: null }> {
    this.singleRow = true;
    return Promise.resolve(this.execute());
  }
  then<TResult1 = { data: Row[] | null; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private matches(row: Row): boolean {
    return this.equals.every(({ column, value }) => row[column] === value) &&
      this.inFilters.every(({ column, values }) => values.includes(row[column]));
  }

  private sorted(rows: Row[]): Row[] {
    return [...rows].sort((left, right) => {
      for (const { column, ascending } of this.orders) {
        const a = left[column] ?? '';
        const b = right[column] ?? '';
        if (a === b) continue;
        const comparison = a < b ? -1 : 1;
        return ascending ? comparison : -comparison;
      }
      return 0;
    });
  }

  private execute(): { data: any; error: null } {
    if (this.table === 'project_milestones') {
      const milestoneId = this.equals.find(({ column }) => column === 'id')?.value;
      const milestone = milestoneId === 'milestone-1' || milestoneId === 'milestone-2'
        ? { id: milestoneId, pic_id: assignedSa.userId, project: { id: 'project-1', sales_id: salesOwner.userId } }
        : null;
      return { data: milestone, error: null };
    }

    const source = this.table === 'milestone_submission_packages'
      ? this.state.packages
      : this.table === 'milestone_submission_attachments'
        ? this.state.attachments
        : this.table === 'milestone_approvals'
          ? this.state.approvals
          : this.table === 'users'
            ? this.state.users
            : [];
    const rows = this.sorted(source.filter((row) => this.matches(row))).map((row) => ({ ...row }));
    return { data: this.singleRow ? rows[0] || null : rows, error: null };
  }
}

async function withState<T>(action: (state: HistoryState) => Promise<T>): Promise<T> {
  const state = createState();
  const originalFrom = supabaseAdmin.from;
  const originalSignedUrl = DocumentStorageService.createSignedDownloadUrl;
  const originalRemove = DocumentStorageService.remove;
  try {
    (supabaseAdmin as any).from = (table: string) => new QueryMock(state, table);
    (DocumentStorageService as any).createSignedDownloadUrl = async (storagePath: string) => {
      state.signedPaths.push(storagePath);
      return `https://signed.example/${storagePath}`;
    };
    (DocumentStorageService as any).remove = async (storagePath: string) => {
      state.storageRemovals.push(storagePath);
    };
    return await action(state);
  } finally {
    (supabaseAdmin as any).from = originalFrom;
    (DocumentStorageService as any).createSignedDownloadUrl = originalSignedUrl;
    (DocumentStorageService as any).remove = originalRemove;
  }
}

async function expectNotFound(action: () => Promise<unknown>, message: string): Promise<void> {
  try {
    await action();
    throw new Error(`Expected 404: ${message}`);
  } catch (error) {
    assert(error instanceof MilestoneSubmissionPackageReviewError, `${message}: expected package review error`);
    assert((error as MilestoneSubmissionPackageReviewError).statusCode === 404, `${message}: expected 404`);
  }
}

async function run(): Promise<void> {
  await withState(async () => {
    const result = await MilestoneSubmissionPackageReviewService.getPackageHistory('milestone-1', headSa);
    assert(result.items.length === 3, 'Test 1: all relevant package revisions must be returned');
    assert(
      result.items.map((item) => `${item.id}:${item.revision}`).join(',') === 'package-3:3,package-2:2,package-1:1',
      'Test 1: revisions must be numbered chronologically and returned newest first'
    );
    assert(result.items[0].submission.approvalId === 'approval-3', 'Test 1: package must use its direct approval FK');
    assert(result.items[0].attachments[0].promotedDocumentId === 'document-3', 'Test 1: promoted official document linkage must be returned');
    assert(result.items[2].review.reviewedBy?.fullName === headSa.fullName, 'Test 1: review actor must be safely summarized');
    console.log('Test 1 - Package history uses exact approval links, chronological revisions, and newest-first presentation: passed');
  });

  await withState(async (state) => {
    state.packages = state.packages.slice(0, 2).map((entry, index) => ({
      ...entry,
      id: index === 0 ? 'package-a' : 'package-b',
      created_at: '2026-09-02T08:00:00.000Z',
      milestone_approval_id: index === 0 ? 'approval-1' : 'approval-2',
      status: index === 0 ? 'REJECTED' : 'PENDING_REVIEW',
    }));
    state.attachments[0].package_id = 'package-a';
    state.attachments[1].package_id = 'package-b';
    state.attachments = state.attachments.slice(0, 2);
    state.approvals = state.approvals.slice(0, 2);

    const result = await MilestoneSubmissionPackageReviewService.getPackageHistory('milestone-1', headSa);
    assert(
      result.items.map((item) => `${item.id}:${item.revision}`).join(',') === 'package-b:2,package-a:1',
      'Test 2: equal timestamps must use package id as a deterministic chronological tie-breaker'
    );
    console.log('Test 2 - Package history uses package id as its chronological tie-breaker: passed');
  });

  await withState(async () => {
    for (const actor of [headSa, superAdmin, assignedSa]) {
      const result = await MilestoneSubmissionPackageReviewService.getPackageHistory('milestone-1', actor);
      assert(result.items.length === 3, `Test 3: ${actor.role} must read authorized package history`);
    }
    await expectNotFound(
      () => MilestoneSubmissionPackageReviewService.getPackageHistory('milestone-1', salesOwner),
      'Test 3: SALES must not discover package metadata'
    );
    await expectNotFound(
      () => MilestoneSubmissionPackageReviewService.getPackageHistory('milestone-1', unrelatedSa),
      'Test 3: unrelated SA must not discover package metadata'
    );
    console.log('Test 3 - Package history is restricted to reviewers and the assigned PIC: passed');
  });

  await withState(async (state) => {
    for (const [packageId, attachmentId] of [
      ['package-1', 'attachment-1'],
      ['package-2', 'attachment-2'],
      ['package-3', 'attachment-3'],
    ]) {
      const result = await MilestoneSubmissionPackageReviewService.getHistoricalAttachmentDownloadUrl(
        'milestone-1', packageId, attachmentId, headSa
      );
      assert(result.expiresInSeconds === 300 && result.attachmentId === attachmentId, 'Test 4: historical download must remain short-lived and exact');
    }
    assert(state.signedPaths.length === 3, 'Test 4: every authorized historical file download must use a DB-derived path');
    await expectNotFound(
      () => MilestoneSubmissionPackageReviewService.getHistoricalAttachmentDownloadUrl('milestone-1', 'package-2', 'attachment-1', headSa),
      'Test 4: attachment must belong to the requested package'
    );
    await expectNotFound(
      () => MilestoneSubmissionPackageReviewService.getHistoricalAttachmentDownloadUrl('milestone-2', 'package-1', 'attachment-1', headSa),
      'Test 4: package must belong to the requested milestone'
    );
    await expectNotFound(
      () => MilestoneSubmissionPackageReviewService.getHistoricalAttachmentDownloadUrl('milestone-1', 'package-1', 'attachment-1', salesOwner),
      'Test 4: SALES must not obtain historical package signed URLs'
    );
    assert(state.storageRemovals.length === 0, 'Test 4: history reads and downloads must not mutate storage');
    console.log('Test 4 - Historical signed downloads validate package, attachment, status, and role access: passed');
  });
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
