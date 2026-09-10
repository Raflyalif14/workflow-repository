import { supabaseAdmin } from '../config/supabase';
import { DocumentStorageService } from '../utils/storage.util';
import {
  MilestoneSubmissionPackageError,
  MilestoneSubmissionPackageService,
} from './milestone-submission-package.service';

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

type Scenario = {
  milestoneStatus?: string;
  projectStatus?: string;
  projectPostponed?: boolean;
  picId?: string;
  activePackage?: boolean;
  uploadFailsAt?: number;
  attachmentMetadataFails?: boolean;
  approvalFails?: boolean;
  milestoneTransitionFails?: boolean;
  cleanupFails?: boolean;
  rejectedPackage?: boolean;
  activityLogFails?: boolean;
};

type State = {
  scenario: Scenario;
  milestone: { id: string; project_id: string; name: string; status: string; pic_id: string | null };
  project: { id: string; name: string; status: string; is_postponed: boolean };
  package: Record<string, any> | null;
  historicalPackage: Record<string, any> | null;
  attachments: Array<Record<string, any>>;
  approvals: Array<Record<string, any>>;
  uploadedPaths: string[];
  cleanupPaths: string[];
  tablesTouched: string[];
  uploadCount: number;
};

const saPic = { userId: 'sa-pic', role: 'SA', fullName: 'SA PIC' };
const saOther = { userId: 'sa-other', role: 'SA', fullName: 'Other SA' };
const headSaPic = { userId: 'headsa-pic', role: 'HEAD_SA', fullName: 'Head SA PIC' };
const headSaOther = { userId: 'headsa-other', role: 'HEAD_SA', fullName: 'Other Head SA' };

const makeFile = (name: string): Express.Multer.File =>
  ({
    fieldname: 'files',
    originalname: name,
    encoding: '7bit',
    mimetype: 'application/pdf',
    size: 32,
    buffer: Buffer.from('test file'),
  } as Express.Multer.File);

const makeState = (scenario: Scenario = {}): State => ({
  scenario,
  milestone: {
    id: 'milestone-1',
    project_id: 'project-1',
    name: 'Customer Assessment',
    status: scenario.milestoneStatus || 'IN_PROGRESS',
    pic_id: scenario.picId === undefined ? saPic.userId : scenario.picId,
  },
  project: {
    id: 'project-1',
    name: 'Enterprise Assessment',
    status: scenario.projectStatus || 'ACTIVE',
    is_postponed: scenario.projectPostponed || false,
  },
  package: null,
  historicalPackage: scenario.rejectedPackage
    ? { id: 'package-v1', milestone_id: 'milestone-1', status: 'REJECTED', attachment_count: 1 }
    : null,
  attachments: scenario.rejectedPackage
    ? [{
        id: 'attachment-v1',
        package_id: 'package-v1',
        file_name: 'rejected-evidence.pdf',
        storage_path: 'milestone-submissions/project-1/milestone-1/package-v1/rejected-evidence.pdf',
        status: 'REJECTED',
      }]
    : [],
  approvals: [],
  uploadedPaths: [],
  cleanupPaths: [],
  tablesTouched: [],
  uploadCount: 0,
});

class QueryMock {
  private operation: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private payload: any;
  private readonly filters: Array<{ column: string; value: unknown }> = [];

  constructor(private readonly state: State, private readonly table: string) {
    state.tablesTouched.push(table);
  }

  select(): this {
    return this;
  }

  insert(payload: any): this {
    this.operation = 'insert';
    this.payload = payload;
    return this;
  }

  update(payload: any): this {
    this.operation = 'update';
    this.payload = payload;
    return this;
  }

  delete(): this {
    this.operation = 'delete';
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ column, value });
    return this;
  }

  order(): this {
    return this;
  }

  maybeSingle(): Promise<{ data: any; error: any }> {
    return Promise.resolve(this.execute());
  }

  single(): Promise<{ data: any; error: any }> {
    return Promise.resolve(this.execute());
  }

  then<TResult1 = { data: any; error: any }, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private filterValue(column: string): unknown {
    return this.filters.find((filter) => filter.column === column)?.value;
  }

  private execute(): { data: any; error: any } {
    if (this.table === 'project_milestones') return this.executeMilestone();
    if (this.table === 'milestone_approvals') return this.executeApprovals();
    if (this.table === 'milestone_submission_packages') return this.executePackages();
    if (this.table === 'milestone_submission_attachments') return this.executeAttachments();
    if (this.table === 'users') return { data: [], error: null };
    if (this.table === 'activity_logs') {
      return this.state.scenario.activityLogFails
        ? { data: null, error: { message: 'raw provider activity-log detail' } }
        : { data: null, error: null };
    }
    return { data: null, error: null };
  }

  private executeMilestone(): { data: any; error: any } {
    if (this.operation === 'select') {
      return {
        data: {
          ...this.state.milestone,
          project: { ...this.state.project },
        },
        error: null,
      };
    }

    if (this.operation !== 'update') return { data: null, error: null };
    const expectedStatus = this.filterValue('status');
    if (expectedStatus !== this.state.milestone.status) return { data: null, error: null };
    if (this.payload.status === 'SUBMITTED' && this.state.scenario.milestoneTransitionFails) {
      return { data: null, error: null };
    }

    this.state.milestone = { ...this.state.milestone, ...this.payload };
    return { data: { id: this.state.milestone.id }, error: null };
  }

  private executeApprovals(): { data: any; error: any } {
    if (this.operation === 'select') {
      const pending = this.state.approvals.find((approval) => approval.status === this.filterValue('status')) || null;
      return { data: pending, error: null };
    }
    if (this.operation === 'insert') {
      if (this.state.scenario.approvalFails) return { data: null, error: { code: 'XX001' } };
      const approval = { ...this.payload, id: `approval-${this.state.approvals.length + 1}` };
      this.state.approvals.push(approval);
      return { data: { id: approval.id }, error: null };
    }
    if (this.operation === 'delete') {
      const id = this.filterValue('id');
      const index = this.state.approvals.findIndex((approval) => approval.id === id && approval.status === 'PENDING');
      if (index < 0) return { data: null, error: null };
      const [approval] = this.state.approvals.splice(index, 1);
      return { data: { id: approval.id }, error: null };
    }
    return { data: null, error: null };
  }

  private executePackages(): { data: any; error: any } {
    if (this.operation === 'insert') {
      if (this.state.scenario.activePackage) return { data: null, error: { code: '23505' } };
      this.state.package = { ...this.payload };
      return { data: this.state.package, error: null };
    }
    if (this.operation === 'update') {
      if (!this.state.package) return { data: null, error: null };
      const expectedStatus = this.filterValue('status');
      if (expectedStatus && this.state.package.status !== expectedStatus) return { data: null, error: null };
      const expectedApprovalId = this.filterValue('milestone_approval_id');
      if (expectedApprovalId && this.state.package.milestone_approval_id !== expectedApprovalId) return { data: null, error: null };
      if (this.payload.status === 'PENDING_REVIEW' && this.state.scenario.milestoneTransitionFails) {
        return { data: null, error: null };
      }
      const updatedPackage = { ...this.state.package, ...this.payload };
      this.state.package = updatedPackage;
      return { data: { id: updatedPackage.id }, error: null };
    }
    if (this.operation === 'delete') {
      if (!this.state.package || this.state.package.status !== this.filterValue('status')) return { data: null, error: null };
      const id = this.state.package.id;
      this.state.package = null;
      this.state.attachments = [];
      return { data: { id }, error: null };
    }
    return { data: this.state.package, error: null };
  }

  private executeAttachments(): { data: any; error: any } {
    if (this.operation === 'insert') {
      if (this.state.scenario.attachmentMetadataFails) return { data: null, error: { code: 'XX001' } };
      this.state.attachments.push(...(Array.isArray(this.payload) ? this.payload : [this.payload]));
      return { data: this.payload, error: null };
    }
    if (this.operation === 'update') {
      this.state.attachments = this.state.attachments.map((attachment) => ({ ...attachment, ...this.payload }));
      return { data: this.state.attachments, error: null };
    }
    return { data: this.state.attachments, error: null };
  }
}

async function withScenario<T>(scenario: Scenario, action: (state: State) => Promise<T>): Promise<T> {
  const state = makeState(scenario);
  const originalFrom = supabaseAdmin.from;
  const originalUpload = DocumentStorageService.upload;
  const originalRemoveMany = DocumentStorageService.removeMany;

  try {
    (supabaseAdmin as any).from = (table: string) => new QueryMock(state, table);
    (DocumentStorageService as any).upload = async (_file: Express.Multer.File, storagePath: string) => {
      state.uploadCount += 1;
      state.uploadedPaths.push(storagePath);
      if (state.scenario.uploadFailsAt === state.uploadCount) {
        throw new Error('simulated storage upload failure');
      }
    };
    (DocumentStorageService as any).removeMany = async (storagePaths: string[]) => {
      state.cleanupPaths.push(...storagePaths);
      if (state.scenario.cleanupFails) throw new Error('simulated storage cleanup failure');
    };
    return await action(state);
  } finally {
    (supabaseAdmin as any).from = originalFrom;
    (DocumentStorageService as any).upload = originalUpload;
    (DocumentStorageService as any).removeMany = originalRemoveMany;
  }
}

async function expectSubmissionError(
  action: () => Promise<unknown>,
  message: string,
  statusCode: number
): Promise<void> {
  try {
    await action();
    throw new Error(`Expected submission failure: ${message}`);
  } catch (error) {
    assert(error instanceof MilestoneSubmissionPackageError, `Expected MilestoneSubmissionPackageError: ${message}`);
    assert((error as MilestoneSubmissionPackageError).message === message, `Expected message: ${message}`);
    assert((error as MilestoneSubmissionPackageError).statusCode === statusCode, `Expected HTTP ${statusCode}: ${message}`);
  }
}

async function run(): Promise<void> {
  await withScenario({}, async (state) => {
    const result = await MilestoneSubmissionPackageService.submit('milestone-1', saPic, [makeFile('assessment.pdf')], 'Ready for review');
    assert(result.status === 'SUBMITTED', 'Test 1: milestone must be submitted');
    assert(result.approval.status === 'PENDING', 'Test 1: approval must be pending');
    assert(result.package.status === 'PENDING_REVIEW' && result.package.attachment_count === 1, 'Test 1: package must be finalized with one attachment');
    assert(state.milestone.status === 'SUBMITTED', 'Test 1: persisted milestone must be submitted');
    assert(state.approvals.length === 1 && state.approvals[0].status === 'PENDING', 'Test 1: one pending approval must exist');
    assert(state.approvals[0].submission_note === 'Ready for review', 'Test 1: optional submission note must be retained');
    assert(state.package?.status === 'PENDING_REVIEW', 'Test 1: persisted package must be pending review');
    assert(!state.tablesTouched.includes('documents'), 'Test 1: pending submission must not create official documents');
    console.log('Test 1 - Assigned SA PIC stages one file and finalizes SUBMITTED/PENDING/PENDING_REVIEW: passed');
  });

  await withScenario({}, async (state) => {
    const result = await MilestoneSubmissionPackageService.submit('milestone-1', saPic, [makeFile('one.pdf'), makeFile('two.pdf')]);
    assert(result.package.attachment_count === 2 && state.attachments.length === 2, 'Test 2: multiple files must be staged');
    console.log('Test 2 - Assigned SA PIC stages multiple files: passed');
  });

  await withScenario({ activityLogFails: true }, async (state) => {
    const originalConsoleError = console.error;
    const activityFailures: unknown[][] = [];
    let result: any;
    console.error = (...args: unknown[]) => {
      activityFailures.push(args);
    };
    try {
      result = await MilestoneSubmissionPackageService.submit('milestone-1', saPic, [makeFile('audit-failure.pdf')]);
    } finally {
      console.error = originalConsoleError;
    }

    assert(result.status === 'SUBMITTED' && result.package.status === 'PENDING_REVIEW', 'Test 2b: activity failure must not change successful submission response');
    assert(state.milestone.status === 'SUBMITTED' && state.approvals[0]?.status === 'PENDING', 'Test 2b: durable milestone and approval state must remain committed');
    assert(state.package?.status === 'PENDING_REVIEW' && state.cleanupPaths.length === 0, 'Test 2b: activity failure must not compensate finalized package evidence');
    assert(activityFailures.length === 1, 'Test 2b: activity failure must be recorded server-side');
    assert(!JSON.stringify(activityFailures).includes('raw provider activity-log detail'), 'Test 2b: activity failure log must not expose provider detail');
    console.log('Test 2b - Activity log failure does not falsify a durable submission: passed');
  });

  await withScenario({ picId: headSaPic.userId }, async () => {
    const result = await MilestoneSubmissionPackageService.submit('milestone-1', headSaPic, [makeFile('headsa.pdf')]);
    assert(result.status === 'SUBMITTED', 'Test 3: assigned HEAD_SA PIC must submit');
    console.log('Test 3 - Assigned HEAD_SA PIC can submit work: passed');
  });

  await withScenario({ picId: headSaPic.userId }, async (state) => {
    await expectSubmissionError(
      () => MilestoneSubmissionPackageService.submit('milestone-1', headSaOther, [makeFile('other.pdf')]),
      'Forbidden',
      403
    );
    assert(state.uploadCount === 0, 'Test 4: unassigned HEAD_SA must fail before upload');
    console.log('Test 4 - Unassigned HEAD_SA is rejected before upload: passed');
  });

  await withScenario({}, async (state) => {
    await expectSubmissionError(
      () => MilestoneSubmissionPackageService.submit('milestone-1', saOther, [makeFile('other.pdf')]),
      'Forbidden',
      403
    );
    assert(state.uploadCount === 0, 'Test 5: unassigned SA must fail before upload');
    console.log('Test 5 - Unassigned SA is rejected before upload: passed');
  });

  await expectSubmissionError(
    () => MilestoneSubmissionPackageService.submit('milestone-1', saPic, []),
    'At least one file is required to submit milestone work.',
    400
  );
  console.log('Test 6 - Zero-file submission is rejected: passed');

  await withScenario({ projectStatus: 'POSTPONED', projectPostponed: true }, async (state) => {
    await expectSubmissionError(
      () => MilestoneSubmissionPackageService.submit('milestone-1', saPic, [makeFile('blocked.pdf')]),
      'Project is postponed.',
      409
    );
    assert(state.uploadCount === 0, 'Test 7: postponed project must fail before upload');
    console.log('Test 7 - Postponed project is rejected before upload: passed');
  });

  await withScenario({ milestoneStatus: 'CREATED' }, async (state) => {
    await expectSubmissionError(
      () => MilestoneSubmissionPackageService.submit('milestone-1', saPic, [makeFile('blocked.pdf')]),
      'Only an IN_PROGRESS milestone can be submitted.',
      409
    );
    assert(state.uploadCount === 0, 'Test 8: wrong milestone status must fail before upload');
    console.log('Test 8 - Non-IN_PROGRESS milestone is rejected before upload: passed');
  });

  await withScenario({ projectStatus: 'DRAFT' }, async (state) => {
    await expectSubmissionError(
      () => MilestoneSubmissionPackageService.submit('milestone-1', saPic, [makeFile('inactive.pdf')]),
      'Project is not active.',
      409
    );
    assert(state.uploadCount === 0, 'Test 8b: inactive project must fail before upload');
    console.log('Test 8b - Inactive project is rejected before upload: passed');
  });

  await withScenario({ activePackage: true }, async (state) => {
    await expectSubmissionError(
      () => MilestoneSubmissionPackageService.submit('milestone-1', saPic, [makeFile('duplicate.pdf')]),
      'A submission is already being processed for this milestone.',
      409
    );
    assert(state.uploadCount === 0, 'Test 9: active package conflict must fail before upload');
    console.log('Test 9 - Concurrent active submission is rejected: passed');
  });

  await withScenario({ uploadFailsAt: 2 }, async (state) => {
    await expectSubmissionError(
      () => MilestoneSubmissionPackageService.submit('milestone-1', saPic, [makeFile('one.pdf'), makeFile('two.pdf')]),
      'Failed to submit milestone work.',
      500
    );
    assert(state.cleanupPaths.length === 2, 'Test 10: partial upload failure must attempt cleanup for every staged path');
    assert(state.package === null && state.approvals.length === 0 && state.milestone.status === 'IN_PROGRESS', 'Test 10: partial upload failure must leave no submission state');
    console.log('Test 10 - Partial upload failure cleans staged paths and package state: passed');
  });

  await withScenario({ attachmentMetadataFails: true }, async (state) => {
    await expectSubmissionError(
      () => MilestoneSubmissionPackageService.submit('milestone-1', saPic, [makeFile('metadata.pdf')]),
      'Failed to save milestone submission attachments.',
      500
    );
    assert(state.cleanupPaths.length === 1 && state.package === null, 'Test 11: metadata failure must clean storage and package');
    console.log('Test 11 - Attachment metadata failure compensates staged storage/package: passed');
  });

  await withScenario({ approvalFails: true }, async (state) => {
    await expectSubmissionError(
      () => MilestoneSubmissionPackageService.submit('milestone-1', saPic, [makeFile('approval.pdf')]),
      'Failed to create milestone approval.',
      500
    );
    assert(state.cleanupPaths.length === 1 && state.package === null && state.approvals.length === 0, 'Test 12: approval failure must compensate package/files');
    console.log('Test 12 - Approval failure compensates package and staged files: passed');
  });

  await withScenario({ milestoneTransitionFails: true }, async (state) => {
    await expectSubmissionError(
      () => MilestoneSubmissionPackageService.submit('milestone-1', saPic, [makeFile('transition.pdf')]),
      'Only an IN_PROGRESS milestone can be submitted.',
      409
    );
    assert(state.cleanupPaths.length === 1 && state.package === null && state.approvals.length === 0, 'Test 13: transition failure must delete approval/package/files');
    assert(state.milestone.status === 'IN_PROGRESS', 'Test 13: transition failure must preserve milestone state');
    console.log('Test 13 - Submitted transition failure compensates approval/package/files: passed');
  });

  await withScenario({ uploadFailsAt: 2, cleanupFails: true }, async (state) => {
    await expectSubmissionError(
      () => MilestoneSubmissionPackageService.submit('milestone-1', saPic, [makeFile('one.pdf'), makeFile('two.pdf')]),
      'Failed to submit milestone work.',
      500
    );
    assert(state.package?.status === 'FAILED' && state.package.cleanup_status === 'FAILED', 'Test 14: failed storage cleanup must retain failed package metadata');
    assert(state.attachments.every((attachment) => attachment.status === 'CLEANUP_FAILED'), 'Test 14: failed storage cleanup must mark attachments for cleanup');
    assert(state.approvals.length === 0 && state.milestone.status === 'IN_PROGRESS', 'Test 14: failed storage cleanup must not leave approval or submitted milestone');
    console.log('Test 14 - Storage cleanup failure retains private cleanup metadata only: passed');
  });

  await withScenario({ rejectedPackage: true }, async (state) => {
    const result = await MilestoneSubmissionPackageService.submit('milestone-1', saPic, [makeFile('revision-two.pdf')], 'Revision two');
    assert(result.package.status === 'PENDING_REVIEW' && result.package.id !== state.historicalPackage?.id, 'Test 15: a new revision package must be created after rejection');
    assert(state.historicalPackage?.status === 'REJECTED', 'Test 15: rejected v1 package must remain historical');
    const retainedAttachment = state.attachments.find((attachment) => attachment.package_id === 'package-v1');
    assert(retainedAttachment?.status === 'REJECTED' && retainedAttachment.storage_path.includes('package-v1'), 'Test 15: rejected v1 evidence must not be overwritten by v2 staging');
    assert(state.attachments.some((attachment) => attachment.package_id === result.package.id && attachment.status === 'PENDING'), 'Test 15: v2 attachments must remain independently pending review');
    console.log('Test 15 - Rejected package evidence remains intact while a new revision package is submitted: passed');
  });
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
