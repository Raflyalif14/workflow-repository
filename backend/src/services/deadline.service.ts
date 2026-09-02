import { supabaseAdmin } from '../config/supabase';
import { HolidayInput, addWorkingDays, calculateWorkingDaysBetween, getRemainingWorkingDays } from '../utils/dates';
import { SaveMilestoneDeadlineInput } from '../validators/deadline.validator';
import { notifyDeadlineChangeRequested } from './deadline-notification.service';
import { HolidayService } from './holiday.service';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
type Actor = { userId: string; role: string; fullName: string };
export type DeadlineStatus = 'NOT_SET' | 'ON_TRACK' | 'DUE_SOON' | 'OVERDUE' | 'COMPLETED';

type DeadlineMilestone = {
  id: string;
  project_id: string;
  name: string;
  status: string;
  start_date: string | null;
  duration_working_days: number | null;
  due_date: string | null;
  project: {
    id: string;
    name: string;
    sales_id: string | null;
    status: string;
    is_postponed: boolean;
    pic_id?: string | null;
  } | null;
};

const toDateKey = (date: Date): string => date.toISOString().slice(0, 10);

const toDateOnlyKey = (value: Date | string): string => {
  if (typeof value === 'string') return toDateKey(parseDateOnly(value));
  return toDateKey(new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())));
};

const parseDateOnly = (value: string): Date => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

const addCalendarDays = (date: Date, days: number): Date =>
  new Date(date.getTime() + days * MS_PER_DAY);

const buildEstimatedEndDate = (startDate: string, durationWorkingDays: number, bufferDays = 14): string => {
  const estimatedWithoutHolidays = addWorkingDays(startDate, durationWorkingDays);
  const minimumWindowDays = durationWorkingDays * 2 + bufferDays;
  const bufferedDate = addCalendarDays(parseDateOnly(startDate), minimumWindowDays);
  const upperBound = estimatedWithoutHolidays.getTime() > bufferedDate.getTime()
    ? estimatedWithoutHolidays
    : bufferedDate;

  return toDateKey(upperBound);
};

const normalizeRelatedOne = <T>(value: T | T[] | null): T | null => {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
};

export const hasExistingDeadline = (milestone: DeadlineMilestone): boolean =>
  Boolean(milestone.start_date || milestone.duration_working_days || milestone.due_date);

const getSignedRemainingWorkingDays = (today: string, dueDate: string, holidays: HolidayInput[]): number => {
  if (today <= dueDate) return getRemainingWorkingDays(today, dueDate, holidays);

  const dayAfterDueDate = toDateKey(addCalendarDays(parseDateOnly(dueDate), 1));
  const overdueWorkingDays = calculateWorkingDaysBetween(dayAfterDueDate, today, holidays);
  return -Math.max(1, overdueWorkingDays);
};

const mapDeadlineHistory = (row: any, users: Map<string, any>) => ({
  id: row.id,
  start_date: row.start_date,
  duration_working_days: row.duration_working_days,
  due_date: row.due_date,
  change_reason: row.change_reason,
  changed_by: users.get(row.changed_by) || null,
  created_at: row.created_at,
});

export function buildDeadlineChangeRequestedActivity(actor: Actor, milestone: DeadlineMilestone, dueDate: string) {
  return {
    project_id: milestone.project_id,
    user_id: actor.userId,
    action: 'DEADLINE_CHANGE_REQUESTED',
    description: `${actor.fullName} requested deadline change for milestone '${milestone.name}' with proposed due date ${dueDate}`,
  };
}

async function logDeadlineChangeRequested(actor: Actor, milestone: DeadlineMilestone, dueDate: string) {
  const { error } = await supabaseAdmin.from('activity_logs').insert({
    ...buildDeadlineChangeRequestedActivity(actor, milestone, dueDate),
  });

  if (error) throw error;
}

export function buildDeadlineProposalArtifacts(
  milestone: DeadlineMilestone,
  calculated: { start_date: string; duration_working_days: number; due_date: string },
  actor: Actor,
  hasPendingApproval: boolean,
  reason?: string
) {
  if (actor.role !== 'SALES') throw new Error('Forbidden');
  if (!milestone.project) throw new Error('Project not found');
  if (milestone.project.sales_id !== actor.userId) throw new Error('Forbidden');
  if (milestone.project.status === 'POSTPONED' || milestone.project.is_postponed) throw new Error('Project is postponed.');
  if (milestone.project.status !== 'ACTIVE') throw new Error('Deadline changes are only available for ACTIVE projects.');
  if (milestone.status === 'COMPLETED' || milestone.status === 'APPROVED') throw new Error('Completed milestone deadline cannot be changed.');
  if (hasPendingApproval) throw new Error('A deadline change request is already pending approval.');
  if (hasExistingDeadline(milestone) && !reason?.trim()) throw new Error('Reason is required when changing an existing deadline.');

  const changeReason = hasExistingDeadline(milestone) ? reason!.trim() : reason?.trim() || 'Initial deadline';
  const effectiveDeadline = {
    start_date: milestone.start_date,
    duration_working_days: milestone.duration_working_days,
    due_date: milestone.due_date,
  };

  return {
    history: {
      milestone_id: milestone.id,
      start_date: calculated.start_date,
      duration_working_days: calculated.duration_working_days,
      due_date: calculated.due_date,
      changed_by: actor.userId,
      change_reason: changeReason,
    },
    approval: {
      milestone_id: milestone.id,
      status: 'PENDING' as const,
      requested_by: actor.userId,
      reviewed_by: null,
      review_note: null,
      reviewed_at: null,
    },
    effectiveDeadline,
    response: {
      milestone_id: milestone.id,
      start_date: calculated.start_date,
      duration_working_days: calculated.duration_working_days,
      due_date: calculated.due_date,
      effective_deadline: effectiveDeadline,
      approval: {
        status: 'PENDING' as const,
      },
    },
  };
}

export class DeadlineService {
  static calculateDeadlineStatus(
    milestoneStatus: string,
    dueDate: string | null,
    today: Date | string = new Date(),
    holidays: HolidayInput[] = []
  ) {
    if (!dueDate) {
      return {
        deadline_status: 'NOT_SET' as DeadlineStatus,
        remaining_working_days: null,
      };
    }

    if (milestoneStatus === 'COMPLETED' || milestoneStatus === 'APPROVED') {
      return {
        deadline_status: 'COMPLETED' as DeadlineStatus,
        remaining_working_days: 0,
      };
    }

    const todayKey = toDateOnlyKey(today);
    const dueDateKey = toDateOnlyKey(dueDate);
    const remainingWorkingDays = getSignedRemainingWorkingDays(todayKey, dueDateKey, holidays);

    if (todayKey > dueDateKey) {
      return {
        deadline_status: 'OVERDUE' as DeadlineStatus,
        remaining_working_days: remainingWorkingDays,
      };
    }

    if (remainingWorkingDays <= 2) {
      return {
        deadline_status: 'DUE_SOON' as DeadlineStatus,
        remaining_working_days: remainingWorkingDays,
      };
    }

    return {
      deadline_status: 'ON_TRACK' as DeadlineStatus,
      remaining_working_days: remainingWorkingDays,
    };
  }

  static async calculateDeadline(startDate: string, durationWorkingDays: number) {
    let estimatedEndDate = buildEstimatedEndDate(startDate, durationWorkingDays);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const holidays = await HolidayService.getActiveHolidaysBetween(startDate, estimatedEndDate);
      const dueDate = addWorkingDays(startDate, durationWorkingDays, holidays);
      const dueDateKey = toDateKey(dueDate);

      if (dueDateKey <= estimatedEndDate) {
        return {
          start_date: startDate,
          duration_working_days: durationWorkingDays,
          due_date: dueDateKey,
        };
      }

      estimatedEndDate = toDateKey(addCalendarDays(dueDate, durationWorkingDays + 14));
    }

    const holidays = await HolidayService.getActiveHolidays();
    const dueDate = addWorkingDays(startDate, durationWorkingDays, holidays);

    return {
      start_date: startDate,
      duration_working_days: durationWorkingDays,
      due_date: toDateKey(dueDate),
    };
  }

  private static async getMilestone(milestoneId: string): Promise<DeadlineMilestone> {
    const { data, error } = await supabaseAdmin
      .from('project_milestones')
      .select('id, project_id, name, status, start_date, duration_working_days, due_date, project:projects!project_milestones_project_id_fkey(id,name,sales_id,status,is_postponed,pic_id)')
      .eq('id', milestoneId)
      .single();

    if (error || !data) throw new Error('Milestone not found');

    return {
      ...data,
      project: normalizeRelatedOne(data.project),
    } as DeadlineMilestone;
  }

  private static ensureCanViewDeadline(milestone: DeadlineMilestone, actor: Actor) {
    if (!milestone.project) throw new Error('Project not found');
    if (actor.role === 'SALES' && milestone.project.sales_id !== actor.userId) throw new Error('Forbidden');
    if (actor.role === 'SA' && milestone.project.pic_id !== actor.userId) throw new Error('Forbidden');
    if (!['SUPER_ADMIN', 'HEAD_SA', 'SALES', 'SA'].includes(actor.role)) throw new Error('Forbidden');
  }

  static async saveMilestoneDeadline(milestoneId: string, input: SaveMilestoneDeadlineInput, actor: Actor) {
    const milestone = await this.getMilestone(milestoneId);

    const { data: pendingApproval, error: pendingError } = await supabaseAdmin
      .from('milestone_deadline_approvals')
      .select('id')
      .eq('milestone_id', milestoneId)
      .eq('status', 'PENDING')
      .maybeSingle();

    if (pendingError) throw new Error(pendingError.message);

    const calculated = await this.calculateDeadline(input.start_date, input.duration_working_days);
    const proposal = buildDeadlineProposalArtifacts(milestone, calculated, actor, Boolean(pendingApproval), input.reason);

    const { data: deadlineHistory, error: historyError } = await supabaseAdmin
      .from('milestone_deadline_history')
      .insert(proposal.history)
      .select('id')
      .single();

    if (historyError || !deadlineHistory) throw new Error(historyError?.message || 'Failed to create milestone deadline history');

    const { data: approval, error: approvalError } = await supabaseAdmin
      .from('milestone_deadline_approvals')
      .insert({
        ...proposal.approval,
        deadline_history_id: deadlineHistory.id,
      })
      .select('id')
      .single();

    if (approvalError || !approval) {
      const { error: cleanupError } = await supabaseAdmin
        .from('milestone_deadline_history')
        .delete()
        .eq('id', deadlineHistory.id);

      if (cleanupError) {
        throw new Error(`${approvalError?.message || 'Failed to create deadline approval.'}; cleanup failed: ${cleanupError.message}`);
      }

      throw new Error(approvalError?.message || 'Failed to create deadline approval.');
    }

    await logDeadlineChangeRequested(actor, milestone, calculated.due_date);
    await notifyDeadlineChangeRequested({
      projectId: milestone.project!.id,
      projectName: milestone.project!.name,
      salesId: milestone.project!.sales_id,
      milestoneId: milestone.id,
      milestoneName: milestone.name,
    });

    return {
      ...proposal.response,
      approval: {
        ...proposal.response.approval,
        id: approval.id,
        deadline_history_id: deadlineHistory.id,
      },
    };
  }

  static async getMilestoneDeadlineHistory(milestoneId: string, actor: Actor) {
    const milestone = await this.getMilestone(milestoneId);
    this.ensureCanViewDeadline(milestone, actor);

    const { data, error } = await supabaseAdmin
      .from('milestone_deadline_history')
      .select('id, start_date, duration_working_days, due_date, change_reason, changed_by, created_at')
      .eq('milestone_id', milestoneId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    const changedByIds = [...new Set((data || []).map((row) => row.changed_by).filter(Boolean))];
    const users = new Map<string, any>();

    if (changedByIds.length) {
      const { data: userRows, error: userError } = await supabaseAdmin
        .from('users')
        .select('id, full_name, email')
        .in('id', changedByIds);

      if (userError) throw new Error(userError.message);
      (userRows || []).forEach((user) => users.set(user.id, user));
    }

    return (data || []).map((row) => mapDeadlineHistory(row, users));
  }

  static async getMilestoneDeadlineStatus(milestoneId: string, actor: Actor) {
    const milestone = await this.getMilestone(milestoneId);
    this.ensureCanViewDeadline(milestone, actor);

    if (!milestone.due_date) {
      return {
        milestone_id: milestone.id,
        due_date: null,
        deadline_status: 'NOT_SET' as DeadlineStatus,
        remaining_working_days: null,
      };
    }

    const today = toDateKey(new Date());
    const startDate = today <= milestone.due_date ? today : milestone.due_date;
    const endDate = today <= milestone.due_date ? milestone.due_date : today;
    const holidays = await HolidayService.getActiveHolidaysBetween(startDate, endDate);
    const status = this.calculateDeadlineStatus(milestone.status, milestone.due_date, today, holidays);

    return {
      milestone_id: milestone.id,
      due_date: milestone.due_date,
      ...status,
    };
  }
}
