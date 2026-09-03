import {
  getDeadlineHealthPresentation,
  getDeadlinePrerequisiteStatus,
  getEffectiveDeadline,
  getLatestSubmissionApproval,
  getMilestoneDisplayStatus,
} from "./milestone-ui-state";
import {
  MilestoneDeadlineApproval,
  MilestoneSubmissionApproval,
  ProjectMilestonePhase4,
} from "@/types/project";

const completedMilestone: ProjectMilestonePhase4 = {
  id: "milestone-1",
  project_id: "project-1",
  workflow_stage_id: "stage-1",
  name: "Assessment Report",
  step_order: 2,
  status: "COMPLETED",
  pic_id: "sa-1",
  start_date: "2026-08-28",
  duration_working_days: 3,
  due_date: "2026-09-02",
  completed_at: "2026-08-28T08:42:32.818+00:00",
  created_at: "2026-08-28T00:00:00.000+00:00",
  updated_at: "2026-08-28T08:42:32.818+00:00",
};

const approvedDeadline: MilestoneDeadlineApproval = {
  id: "deadline-approval-1",
  milestone_id: "milestone-1",
  deadline_history_id: "deadline-history-1",
  status: "APPROVED",
  requested_by: null,
  reviewed_by: null,
  review_note: null,
  requested_at: "2026-08-28T00:00:00.000+00:00",
  reviewed_at: "2026-08-28T00:00:00.000+00:00",
  deadline: {
    start_date: "2026-08-28",
    duration_working_days: 3,
    due_date: "2026-09-02",
    change_reason: null,
  },
};

const rejectedDeadlineChange: MilestoneDeadlineApproval = {
  ...approvedDeadline,
  id: "deadline-approval-2",
  deadline_history_id: "deadline-history-2",
  status: "REJECTED",
  requested_at: "2026-08-29T00:00:00.000+00:00",
  deadline: {
    start_date: "2026-08-28",
    duration_working_days: 5,
    due_date: "2026-09-04",
    change_reason: "Rejected change",
  },
};

const approvedSubmission: MilestoneSubmissionApproval = {
  id: "submission-approval-1",
  status: "APPROVED",
  submission_note: "Assessment Report sudah direvisi sesuai feedback",
  submitted_by: null,
  submitted_at: "2026-08-28T08:40:00.000+00:00",
  review_note: null,
  reviewed_by: null,
  reviewed_at: "2026-08-28T08:42:32.818+00:00",
};

const rejectedSubmission: MilestoneSubmissionApproval = {
  ...approvedSubmission,
  id: "submission-approval-0",
  status: "REJECTED",
  submitted_at: "2026-08-27T08:40:00.000+00:00",
  review_note: "Please revise",
};

const effectiveDeadline = getEffectiveDeadline(completedMilestone);

if (getMilestoneDisplayStatus(completedMilestone) !== "COMPLETED") {
  throw new Error("Milestone badge must use milestone.status");
}

if (
  effectiveDeadline.start_date !== "2026-08-28" ||
  effectiveDeadline.duration_working_days !== 3 ||
  effectiveDeadline.due_date !== "2026-09-02"
) {
  throw new Error("Effective deadline must use milestone effective fields");
}

if (getDeadlinePrerequisiteStatus(completedMilestone, rejectedDeadlineChange, [rejectedDeadlineChange, approvedDeadline]) !== "APPROVED") {
  throw new Error("Rejected deadline change must not invalidate older approved effective deadline");
}

if (getLatestSubmissionApproval([approvedSubmission, rejectedSubmission])?.status !== "APPROVED") {
  throw new Error("Latest submission approval must be history[0]");
}

if (getMilestoneDisplayStatus({ ...completedMilestone, status: "REJECTED" }) !== "REJECTED") {
  throw new Error("Rejected milestone badge must use milestone.status");
}

if (getMilestoneDisplayStatus({ ...completedMilestone, status: "SUBMITTED" }) !== "SUBMITTED") {
  throw new Error("Submitted milestone badge must use milestone.status");
}

const overdueTwoDays = getDeadlineHealthPresentation("OVERDUE", -2);
if (overdueTwoDays.tone !== "destructive" || overdueTwoDays.label !== "OVERDUE" || overdueTwoDays.detail !== "Overdue by 2 working days") {
  throw new Error("Deadline health must show an overdue two-working-day state");
}

const overdueOneDay = getDeadlineHealthPresentation("OVERDUE", -1);
if (overdueOneDay.detail !== "Overdue by 1 working day") {
  throw new Error("Deadline health must use singular working day copy");
}

const dueSoon = getDeadlineHealthPresentation("DUE_SOON", 2);
if (dueSoon.tone !== "warning" || dueSoon.detail !== "2 working days remaining") {
  throw new Error("Deadline health must show due-soon remaining working days");
}

const onTrack = getDeadlineHealthPresentation("ON_TRACK", 5);
if (onTrack.tone !== "success" || onTrack.detail !== "5 working days remaining") {
  throw new Error("Deadline health must show on-track remaining working days");
}

const completedDeadline = getDeadlineHealthPresentation("COMPLETED", 0);
if (completedDeadline.tone !== "success" || completedDeadline.label !== "COMPLETED") {
  throw new Error("Deadline health must show completed separately from workflow approval state");
}

const notSet = getDeadlineHealthPresentation("NOT_SET", null);
if (notSet.tone !== "neutral" || notSet.label !== "NOT SET") {
  throw new Error("Deadline health must show a neutral not-set state");
}
