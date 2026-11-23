import { supabaseAdmin } from '../config/supabase';
import { CreateNotificationInput, NotificationService } from './notification.service';
import { runNotificationBestEffort } from './notification-dispatch.service';

export type ProjectMeetingNotificationProject = {
  id: string;
  name: string;
  sales_id: string | null;
  pic_id: string | null;
};

export type ProjectMeetingNotificationMeeting = {
  id: string;
  title: string;
};

export type MeetingNotificationAction =
  | 'CREATE'
  | 'APPROVE'
  | 'REJECT'
  | 'CANCEL'
  | 'RESCHEDULE'
  | 'APPROVE_RESCHEDULE'
  | 'REJECT_RESCHEDULE';

const meetingActionUrl = (projectId: string) => `/projects/${projectId}#project-meetings`;

async function getActiveHeadSaIds(): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('role', 'HEAD_SA')
    .eq('is_active', true);

  if (error || !data) return [];
  return (data as { id: string }[]).map((u) => u.id);
}

export function buildMeetingNotification(
  userId: string,
  project: ProjectMeetingNotificationProject,
  meeting: ProjectMeetingNotificationMeeting,
  action: MeetingNotificationAction | 'MINUTES_SAVED'
): CreateNotificationInput {
  const titleMap: Record<MeetingNotificationAction | 'MINUTES_SAVED', string> = {
    CREATE: 'Project Meeting Requested',
    APPROVE: 'Project Meeting Approved',
    REJECT: 'Project Meeting Rejected',
    CANCEL: 'Project Meeting Cancelled',
    RESCHEDULE: 'Meeting Reschedule Requested',
    APPROVE_RESCHEDULE: 'Meeting Reschedule Approved',
    REJECT_RESCHEDULE: 'Meeting Reschedule Rejected',
    MINUTES_SAVED: 'Meeting Minutes Saved',
  };

  const messageMap: Record<MeetingNotificationAction | 'MINUTES_SAVED', string> = {
    CREATE: `Meeting request '${meeting.title}' for project '${project.name}' is waiting for review.`,
    APPROVE: `Meeting '${meeting.title}' for project '${project.name}' has been approved.`,
    REJECT: `Meeting '${meeting.title}' for project '${project.name}' was rejected.`,
    CANCEL: `Meeting '${meeting.title}' for project '${project.name}' was cancelled.`,
    RESCHEDULE: `Reschedule request for meeting '${meeting.title}' in project '${project.name}' is waiting for review.`,
    APPROVE_RESCHEDULE: `New schedule for meeting '${meeting.title}' in project '${project.name}' has been approved.`,
    REJECT_RESCHEDULE: `Reschedule request for meeting '${meeting.title}' in project '${project.name}' was rejected.`,
    MINUTES_SAVED: `Minutes of meeting for '${meeting.title}' in project '${project.name}' were saved.`,
  };

  const typeMap: Record<MeetingNotificationAction | 'MINUTES_SAVED', string> = {
    CREATE: 'MEETING_REQUESTED',
    APPROVE: 'MEETING_APPROVED',
    REJECT: 'MEETING_REJECTED',
    CANCEL: 'MEETING_CANCELLED',
    RESCHEDULE: 'MEETING_RESCHEDULE',
    APPROVE_RESCHEDULE: 'MEETING_APPROVE_RESCHEDULE',
    REJECT_RESCHEDULE: 'MEETING_REJECT_RESCHEDULE',
    MINUTES_SAVED: 'MEETING_MINUTES_SAVED',
  };

  return {
    userId,
    type: typeMap[action],
    title: titleMap[action],
    message: messageMap[action],
    projectId: project.id,
    projectName: project.name,
    meetingTitle: meeting.title,
    actionUrl: meetingActionUrl(project.id),
  };
}

export async function notifyProjectMeetingAction(params: {
  project: ProjectMeetingNotificationProject;
  meeting: ProjectMeetingNotificationMeeting;
  action: MeetingNotificationAction;
  actorUserId: string;
}): Promise<void> {
  const { project, meeting, action, actorUserId } = params;

  await runNotificationBestEffort(`meeting ${action.toLowerCase()} notifications`, async () => {
    const recipientIds = new Set<string>();

    switch (action) {
      case 'CREATE':
      case 'RESCHEDULE': {
        const headSaIds = await getActiveHeadSaIds();
        headSaIds.forEach((id) => recipientIds.add(id));
        break;
      }
      case 'APPROVE':
      case 'APPROVE_RESCHEDULE': {
        if (project.sales_id) recipientIds.add(project.sales_id);
        if (project.pic_id) recipientIds.add(project.pic_id);
        break;
      }
      case 'REJECT':
      case 'REJECT_RESCHEDULE': {
        if (project.sales_id) recipientIds.add(project.sales_id);
        break;
      }
      case 'CANCEL': {
        if (project.sales_id) recipientIds.add(project.sales_id);
        if (project.pic_id) recipientIds.add(project.pic_id);
        const headSaIds = await getActiveHeadSaIds();
        headSaIds.forEach((id) => recipientIds.add(id));
        break;
      }
    }

    recipientIds.delete(actorUserId);

    await Promise.all(
      Array.from(recipientIds).map((userId) =>
        NotificationService.createNotification(buildMeetingNotification(userId, project, meeting, action))
      )
    );
  });
}

export async function notifyMeetingMinutesSaved(params: {
  project: ProjectMeetingNotificationProject;
  meeting: ProjectMeetingNotificationMeeting;
  actorUserId: string;
}): Promise<void> {
  const { project, meeting, actorUserId } = params;

  await runNotificationBestEffort('meeting minutes saved notifications', async () => {
    const recipientIds = new Set<string>();
    if (project.sales_id) recipientIds.add(project.sales_id);
    if (project.pic_id) recipientIds.add(project.pic_id);

    const headSaIds = await getActiveHeadSaIds();
    headSaIds.forEach((id) => recipientIds.add(id));

    recipientIds.delete(actorUserId);

    await Promise.all(
      Array.from(recipientIds).map((userId) =>
        NotificationService.createNotification(buildMeetingNotification(userId, project, meeting, 'MINUTES_SAVED'))
      )
    );
  });
}
