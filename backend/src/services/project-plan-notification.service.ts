import { supabaseAdmin } from '../config/supabase';
import { CreateNotificationInput, NotificationService } from './notification.service';
import { runNotificationBestEffort } from './notification-dispatch.service';

export type ProjectPlanNotificationProject = {
  id: string;
  name: string;
  sales_id: string | null;
};

type ActiveHeadSaRow = { id: string };

const projectActionUrl = (projectId: string) => `/projects/${projectId}`;

export function buildProjectPlanSubmittedNotification(
  userId: string,
  project: ProjectPlanNotificationProject
): CreateNotificationInput {
  return {
    userId,
    type: 'PROJECT_PLAN_SUBMITTED',
    title: 'Project Plan Submitted',
    message: `Project plan for '${project.name}' is waiting for review.`,
    projectId: project.id,
    actionUrl: '/approvals',
  };
}

function buildProjectPlanDecisionNotification(
  project: ProjectPlanNotificationProject,
  decision: 'APPROVED' | 'REJECTED'
): CreateNotificationInput | null {
  if (!project.sales_id) return null;

  return decision === 'APPROVED'
    ? {
        userId: project.sales_id,
        type: 'PROJECT_PLAN_APPROVED',
        title: 'Project Plan Approved',
        message: `Project plan for '${project.name}' has been approved.`,
        projectId: project.id,
        actionUrl: projectActionUrl(project.id),
      }
    : {
        userId: project.sales_id,
        type: 'PROJECT_PLAN_REJECTED',
        title: 'Project Plan Rejected',
        message: `Project plan for '${project.name}' was rejected and requires revision.`,
        projectId: project.id,
        actionUrl: projectActionUrl(project.id),
      };
}

export async function notifyProjectPlanSubmitted(project: ProjectPlanNotificationProject): Promise<void> {
  await runNotificationBestEffort('project plan submission notifications', async () => {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('role', 'HEAD_SA')
      .eq('is_active', true);

    if (error) throw error;

    await Promise.all(
      ((data || []) as ActiveHeadSaRow[]).map((user) =>
        NotificationService.createNotification(buildProjectPlanSubmittedNotification(user.id, project))
      )
    );
  });
}

async function notifyProjectPlanDecision(
  project: ProjectPlanNotificationProject,
  decision: 'APPROVED' | 'REJECTED'
): Promise<void> {
  const notification = buildProjectPlanDecisionNotification(project, decision);
  if (!notification) return;

  await runNotificationBestEffort(`project plan ${decision.toLowerCase()} notification`, () =>
    NotificationService.createNotification(notification)
  );
}

export async function notifyProjectPlanApproved(project: ProjectPlanNotificationProject): Promise<void> {
  await notifyProjectPlanDecision(project, 'APPROVED');
}

export async function notifyProjectPlanRejected(project: ProjectPlanNotificationProject): Promise<void> {
  await notifyProjectPlanDecision(project, 'REJECTED');
}
