import { randomUUID } from 'crypto';
import { supabaseAdmin } from '../config/supabase';
import {
  buildMilestoneContributionStoragePath,
  DocumentStorageService,
  isAllowedDocumentFileName,
  MAX_DOCUMENT_FILE_SIZE_BYTES,
  MAX_MILESTONE_SUBMISSION_FILES,
} from '../utils/storage.util';

type Actor = { userId: string; role: string; fullName: string };

type MilestoneContributionContext = {
  milestone: {
    id: string;
    project_id: string;
    step_order: number;
    status: string;
    pic_id: string | null;
  };
  project: {
    id: string;
    sales_id: string;
    status: string;
    is_postponed: boolean;
    scenario_id: string;
  };
  scenario: {
    workflow_model: string;
    workflow_version: number;
  };
};

type ContributionAttachment = {
  id: string;
  contribution_id: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number | string;
  storage_path: string;
  created_at: string;
};

type ContributionRow = {
  id: string;
  project_id: string;
  milestone_id: string;
  contributed_by: string;
  note: string | null;
  status: string;
  created_at: string;
};

type StagedAttachment = {
  id: string;
  file: Express.Multer.File;
  storagePath: string;
};

const nowIso = () => new Date().toISOString();

export class MilestoneContributionError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = 'MilestoneContributionError';
  }
}

export function isOperationalV2FirstMilestone(
  workflowModel: string,
  workflowVersion: number,
  stepOrder: number
): boolean {
  return workflowModel === 'OPERATIONAL_V2' && workflowVersion === 2 && stepOrder === 1;
}

export function canReadMilestoneContributions(
  actor: Pick<Actor, 'userId' | 'role'>,
  salesId: string,
  picId: string | null
): boolean {
  if (actor.role === 'SUPER_ADMIN' || actor.role === 'HEAD_SA') return true;
  if (actor.role === 'SALES') return actor.userId === salesId;
  if (actor.role === 'SA') return actor.userId === picId;
  return false;
}

export class MilestoneContributionService {
  private static async getContext(milestoneId: string): Promise<MilestoneContributionContext> {
    const { data: milestone, error: milestoneError } = await supabaseAdmin
      .from('project_milestones')
      .select('id,project_id,step_order,status,pic_id')
      .eq('id', milestoneId)
      .maybeSingle();

    if (milestoneError) throw new MilestoneContributionError('Unable to retrieve milestone contribution data.', 500);
    if (!milestone) throw new MilestoneContributionError('Milestone not found', 404);

    const { data: project, error: projectError } = await supabaseAdmin
      .from('projects')
      .select('id,sales_id,status,is_postponed,scenario_id')
      .eq('id', milestone.project_id)
      .maybeSingle();

    if (projectError) throw new MilestoneContributionError('Unable to retrieve milestone contribution data.', 500);
    if (!project) throw new MilestoneContributionError('Milestone not found', 404);

    const { data: scenario, error: scenarioError } = await supabaseAdmin
      .from('scenarios')
      .select('workflow_model,workflow_version')
      .eq('id', project.scenario_id)
      .maybeSingle();

    if (scenarioError) throw new MilestoneContributionError('Unable to retrieve milestone contribution data.', 500);
    if (!scenario) throw new MilestoneContributionError('Milestone not found', 404);

    return {
      milestone: milestone as MilestoneContributionContext['milestone'],
      project: project as MilestoneContributionContext['project'],
      scenario: scenario as MilestoneContributionContext['scenario'],
    };
  }

  private static assertContributionMilestone(context: MilestoneContributionContext): void {
    if (
      !isOperationalV2FirstMilestone(
        context.scenario.workflow_model,
        context.scenario.workflow_version,
        context.milestone.step_order
      )
    ) {
      throw new MilestoneContributionError(
        'Supporting input is only available for the first Operational V2 milestone.',
        409
      );
    }
  }

  private static assertCreateAccess(context: MilestoneContributionContext, actor: Actor): void {
    if (actor.role !== 'SALES') throw new MilestoneContributionError('Forbidden', 403);
    if (context.project.sales_id !== actor.userId) throw new MilestoneContributionError('Milestone not found', 404);
    if (context.project.status === 'POSTPONED' || context.project.is_postponed) {
      throw new MilestoneContributionError('Project is postponed.', 409);
    }
    if (context.project.status !== 'ACTIVE') {
      throw new MilestoneContributionError('Project is not active.', 409);
    }
    if (context.milestone.status !== 'IN_PROGRESS') {
      throw new MilestoneContributionError(
        'Supporting input can only be added while the milestone is IN_PROGRESS.',
        409
      );
    }
    if (!context.milestone.pic_id) {
      throw new MilestoneContributionError('Milestone must have an assigned PIC before supporting input can be added.', 409);
    }
  }

  private static assertReadAccess(context: MilestoneContributionContext, actor: Actor): void {
    if (
      !canReadMilestoneContributions(
        actor,
        context.project.sales_id,
        context.milestone.pic_id
      )
    ) {
      throw new MilestoneContributionError('Milestone not found', 404);
    }
  }

  private static assertFilesValid(files: Express.Multer.File[]): void {
    if (files.length > MAX_MILESTONE_SUBMISSION_FILES) {
      throw new MilestoneContributionError(
        `A maximum of ${MAX_MILESTONE_SUBMISSION_FILES} files may be added at once.`,
        400
      );
    }

    for (const file of files) {
      if (!file.originalname?.trim() || !isAllowedDocumentFileName(file.originalname)) {
        throw new MilestoneContributionError(
          'File format not supported. Allowed formats: PDF, DOCX, XLSX, PPTX, Images, ZIP.',
          400
        );
      }
      if (!Number.isFinite(file.size) || file.size < 0 || file.size > MAX_DOCUMENT_FILE_SIZE_BYTES) {
        throw new MilestoneContributionError('Each file must be 50 MB or smaller.', 400);
      }
    }
  }

  private static async compensateCreate(
    contributionId: string,
    attemptedPaths: string[]
  ): Promise<void> {
    let storageCleaned = true;
    try {
      await DocumentStorageService.removeMany(attemptedPaths);
    } catch {
      storageCleaned = false;
    }

    if (storageCleaned) {
      const { data, error } = await supabaseAdmin
        .from('milestone_contributions')
        .delete()
        .eq('id', contributionId)
        .eq('status', 'STAGING')
        .select('id')
        .maybeSingle();
      if (!error && data) return;
    } else {
      const { data, error } = await supabaseAdmin
        .from('milestone_contributions')
        .update({ status: 'CLEANUP_FAILED', updated_at: nowIso() })
        .eq('id', contributionId)
        .eq('status', 'STAGING')
        .select('id')
        .maybeSingle();
      if (!error && data) {
        console.error('[MilestoneContribution] Storage cleanup did not complete.', { contributionId });
        return;
      }
    }

    console.error('[MilestoneContribution] Contribution compensation did not fully complete.', {
      contributionId,
      storageCleanupFailed: !storageCleaned,
    });
  }

  private static mapContribution(
    contribution: ContributionRow,
    attachments: ContributionAttachment[],
    contributor?: { id: string; full_name: string; email?: string }
  ) {
    return {
      id: contribution.id,
      milestone_id: contribution.milestone_id,
      note: contribution.note,
      contributed_by: contributor || null,
      created_at: contribution.created_at,
      attachments: attachments.map((attachment) => ({
        id: attachment.id,
        file_name: attachment.original_filename,
        file_size: Number(attachment.size_bytes),
        mime_type: attachment.mime_type,
        created_at: attachment.created_at,
      })),
    };
  }

  static async create(
    milestoneId: string,
    actor: Actor,
    files: Express.Multer.File[],
    note?: string
  ) {
    const normalizedNote = note?.trim() || null;
    if (!normalizedNote && !files.length) {
      throw new MilestoneContributionError('Add a note or at least one file.', 400);
    }
    this.assertFilesValid(files);

    const context = await this.getContext(milestoneId);
    this.assertContributionMilestone(context);
    this.assertCreateAccess(context, actor);

    const contributionId = randomUUID();
    const attachments: StagedAttachment[] = files.map((file) => ({
      id: randomUUID(),
      file,
      storagePath: buildMilestoneContributionStoragePath(
        context.project.id,
        context.milestone.id,
        contributionId,
        file.originalname
      ),
    }));

    const { error: contributionError } = await supabaseAdmin.from('milestone_contributions').insert({
      id: contributionId,
      project_id: context.project.id,
      milestone_id: context.milestone.id,
      contributed_by: actor.userId,
      note: normalizedNote,
      status: 'STAGING',
    });
    if (contributionError) {
      throw new MilestoneContributionError('Unable to save milestone supporting input.', 500);
    }

    const attemptedPaths: string[] = [];
    try {
      if (attachments.length) {
        const { error: attachmentError } = await supabaseAdmin
          .from('milestone_contribution_attachments')
          .insert(
            attachments.map((attachment) => ({
              id: attachment.id,
              contribution_id: contributionId,
              original_filename: attachment.file.originalname,
              mime_type: attachment.file.mimetype || 'application/octet-stream',
              size_bytes: attachment.file.size,
              storage_path: attachment.storagePath,
            }))
          );
        if (attachmentError) {
          throw new MilestoneContributionError('Unable to save milestone supporting input.', 500);
        }

        for (const attachment of attachments) {
          attemptedPaths.push(attachment.storagePath);
          await DocumentStorageService.upload(attachment.file, attachment.storagePath);
        }
      }

      const readyAt = nowIso();
      const { data: ready, error: readyError } = await supabaseAdmin
        .from('milestone_contributions')
        .update({ status: 'READY', updated_at: readyAt })
        .eq('id', contributionId)
        .eq('project_id', context.project.id)
        .eq('milestone_id', context.milestone.id)
        .eq('status', 'STAGING')
        .select('id,project_id,milestone_id,contributed_by,note,status,created_at')
        .maybeSingle();

      if (readyError) throw new MilestoneContributionError('Unable to save milestone supporting input.', 500);
      if (!ready) throw new MilestoneContributionError('Milestone supporting input is no longer available.', 409);

      return this.mapContribution(
        ready as ContributionRow,
        attachments.map((attachment) => ({
          id: attachment.id,
          contribution_id: contributionId,
          original_filename: attachment.file.originalname,
          mime_type: attachment.file.mimetype || 'application/octet-stream',
          size_bytes: attachment.file.size,
          storage_path: attachment.storagePath,
          created_at: readyAt,
        })),
        { id: actor.userId, full_name: actor.fullName }
      );
    } catch (error) {
      await this.compensateCreate(contributionId, attemptedPaths);
      if (error instanceof MilestoneContributionError) throw error;
      throw new MilestoneContributionError('Unable to save milestone supporting input.', 500);
    }
  }

  static async list(milestoneId: string, actor: Actor) {
    const context = await this.getContext(milestoneId);
    this.assertContributionMilestone(context);
    this.assertReadAccess(context, actor);

    const { data, error } = await supabaseAdmin
      .from('milestone_contributions')
      .select('id,project_id,milestone_id,contributed_by,note,status,created_at')
      .eq('milestone_id', milestoneId)
      .eq('project_id', context.project.id)
      .eq('status', 'READY')
      .order('created_at', { ascending: false });
    if (error) throw new MilestoneContributionError('Unable to load milestone supporting input.', 500);

    const contributions = (data || []) as ContributionRow[];
    if (!contributions.length) return [];

    const contributionIds = contributions.map((contribution) => contribution.id);
    const contributorIds = [...new Set(contributions.map((contribution) => contribution.contributed_by))];
    const [{ data: attachmentData, error: attachmentError }, { data: contributorData, error: contributorError }] =
      await Promise.all([
        supabaseAdmin
          .from('milestone_contribution_attachments')
          .select('id,contribution_id,original_filename,mime_type,size_bytes,storage_path,created_at')
          .in('contribution_id', contributionIds)
          .order('created_at', { ascending: true }),
        supabaseAdmin.from('users').select('id,full_name,email').in('id', contributorIds),
      ]);

    if (attachmentError || contributorError) {
      throw new MilestoneContributionError('Unable to load milestone supporting input.', 500);
    }

    const attachmentRows = (attachmentData || []) as ContributionAttachment[];
    const contributors = new Map(
      ((contributorData || []) as Array<{ id: string; full_name: string; email: string }>).map((user) => [user.id, user])
    );

    return contributions.map((contribution) =>
      this.mapContribution(
        contribution,
        attachmentRows.filter((attachment) => attachment.contribution_id === contribution.id),
        contributors.get(contribution.contributed_by)
      )
    );
  }

  static async getAttachmentDownloadUrl(
    milestoneId: string,
    contributionId: string,
    attachmentId: string,
    actor: Actor
  ) {
    const context = await this.getContext(milestoneId);
    this.assertContributionMilestone(context);
    this.assertReadAccess(context, actor);

    const { data: contribution, error: contributionError } = await supabaseAdmin
      .from('milestone_contributions')
      .select('id')
      .eq('id', contributionId)
      .eq('project_id', context.project.id)
      .eq('milestone_id', milestoneId)
      .eq('status', 'READY')
      .maybeSingle();
    if (contributionError) throw new MilestoneContributionError('Unable to load milestone supporting input.', 500);
    if (!contribution) throw new MilestoneContributionError('Supporting attachment not found', 404);

    const { data: attachment, error: attachmentError } = await supabaseAdmin
      .from('milestone_contribution_attachments')
      .select('id,original_filename,storage_path')
      .eq('id', attachmentId)
      .eq('contribution_id', contributionId)
      .maybeSingle();
    if (attachmentError) throw new MilestoneContributionError('Unable to load milestone supporting input.', 500);
    if (!attachment) throw new MilestoneContributionError('Supporting attachment not found', 404);

    try {
      return {
        attachment_id: attachment.id,
        file_name: attachment.original_filename,
        url: await DocumentStorageService.createSignedDownloadUrl(attachment.storage_path, 300),
        expires_in_seconds: 300,
      };
    } catch {
      throw new MilestoneContributionError('Failed to create supporting attachment download URL.', 500);
    }
  }
}
