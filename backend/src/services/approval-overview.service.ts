import { readApprovalRows } from './approval-rows';
import { outputReviewQueue } from './output-review-queue.service';
import { projectPhaseName } from './project-phase.service';
import { RequestTiming, timeOperation } from '../utils/request-timing';

type ApprovalOverviewActor = {
    userId: string;
    role: string;
    fullName?: string;
};

type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED';

type ProjectRow = {
    id: string;
    name: string;
    customer: string | null;
    active_phase_id?: string | null;
    status: string;
    is_postponed: boolean;
    scenario_id: string;
    current_scenario_id?: string | null;
    sales_id: string | null;
    pic_id: string | null;
    scenario?: unknown;
    phases?: unknown[];
};

type MilestoneRow = {
    id: string;
    project_id: string;
    phase_id?: string | null;
    name: string;
    step_order: number;
    status: string;
    start_date: string | null;
    duration_working_days: number | null;
    due_date: string | null;
    pic_id: string | null;
};

type ProjectPlanApprovalRow = {
    phase?: { phase_key: string } | { phase_key: string }[] | null;
    id: string;
    project_id: string;
    phase_id?: string | null;
    status: ApprovalStatus;
    requested_by: string;
    reviewed_by: string | null;
    request_note: string | null;
    review_note: string | null;
    submitted_at: string;
    reviewed_at: string | null;
};

type DeadlineApprovalRow = {
    id: string;
    milestone_id: string;
    deadline_history_id: string;
    status: ApprovalStatus;
    requested_by: string;
    reviewed_by: string | null;
    review_note: string | null;
    requested_at: string;
    reviewed_at: string | null;
};

type DeadlineHistoryRow = {
    id: string;
    start_date: string;
    duration_working_days: number;
    due_date: string;
    change_reason: string | null;
};

type UserRow = {
    id: string;
    full_name: string;
    role: string;
};

function safeError(error: unknown, context: string): Error {
    console.error(`[ApprovalOverviewService] source failed: ${context}`);

    return new Error('Failed to load approval overview.');
}

function userPayload(user?: UserRow) {
    if (!user) return null;

    return {
        id: user.id,
        full_name: user.full_name,
        fullName: user.full_name,
        role: user.role,
    };
}

export class ApprovalOverviewService {
    static async getOverview(actor: ApprovalOverviewActor, trace?: RequestTiming) {
        if (!['HEAD_SA', 'SUPER_ADMIN'].includes(actor.role)) {
            throw new Error('Forbidden');
        }

        /*
         * Step 1
         * Load project scope once.
         *
         * Approval Center is only accessible to HEAD_SA / SUPER_ADMIN,
         * therefore both roles use global project visibility here.
         */
        const { data: projectData, error: projectError } = await timeOperation(trace, 'approval.projects', () => readApprovalRows('projects',
            'id,name,customer,active_phase_id,status,is_postponed,scenario_id,current_scenario_id,sales_id,pic_id,scenario:scenarios!projects_scenario_id_fkey(name),phases:project_phases!project_phases_project_id_fkey(id,project_id,scenario_id,phase_key)', undefined, 'updated_at'));

        if (projectError) {
            throw safeError(projectError, 'projects');
        }

        const projects = (projectData || []) as ProjectRow[];

        if (!projects.length) {
            return {
                stats: {
                    totalPending: 0,
                    pendingProjectPlans: 0,
                    pendingDeadlines: 0,
                    pendingDocs: 0,
                },
                items: [],
            };
        }

        const projectIds = projects.map((project) => project.id);

        /*
         * Step 2
         * Fetch milestones and project-plan approval history in batch.
         */
        const [milestoneResult, planResult] = await timeOperation(trace, 'approval.milestones_and_plans', () => Promise.all([
            readApprovalRows('project_milestones',
                'id,project_id,phase_id,name,step_order,status,start_date,duration_working_days,due_date,pic_id,workflow_stage:workflow_stages(stage_key,default_role,scenario_id)',
                { column: 'project_id', ids: projectIds }),
            readApprovalRows('project_plan_approvals',
                'id,project_id,phase_id,status,requested_by,reviewed_by,request_note,review_note,submitted_at,reviewed_at,phase:project_phases!approval_phase_project_fk(phase_key)',
                { column: 'project_id', ids: projectIds }, 'submitted_at'),
        ]));

        if (milestoneResult.error) {
            throw safeError(milestoneResult.error, 'project_milestones');
        }

        if (planResult.error) {
            throw safeError(planResult.error, 'project_plan_approvals');
        }

        const outputItems = await timeOperation(trace, 'approval.output_reviews', () => outputReviewQueue(projects, milestoneResult.data, actor));
        const phases = new Map(projects.map(project => [project.id, project.active_phase_id]));
        const milestones = ((milestoneResult.data || []) as MilestoneRow[]).filter(row => !phases.get(row.project_id) || row.phase_id === phases.get(row.project_id));
        const planApprovals = (planResult.data || []).sort((a, b) => b.submitted_at.localeCompare(a.submitted_at) || a.id.localeCompare(b.id)) as ProjectPlanApprovalRow[];

        const milestoneIds = milestones.map((milestone) => milestone.id);

        /*
         * Step 3
         * Fetch all milestone approval sources in batch.
         */
        const deadlineResult = milestoneIds.length
            ? await timeOperation(trace, 'approval.deadline_approvals', () => readApprovalRows('milestone_deadline_approvals',
                'id,milestone_id,deadline_history_id,status,requested_by,reviewed_by,review_note,requested_at,reviewed_at',
                { column: 'milestone_id', ids: milestoneIds }, 'requested_at'))
            : { data: [], error: null };
        if (deadlineResult.error) throw safeError(deadlineResult.error, 'milestone_deadline_approvals');

        const deadlineApprovals =
            (deadlineResult.data || []).sort((a, b) => b.requested_at.localeCompare(a.requested_at) || a.id.localeCompare(b.id)) as DeadlineApprovalRow[];

        /*
         * Step 4
         * Resolve deadline proposals and users in two batched queries.
         */
        const deadlineHistoryIds = [
            ...new Set(
                deadlineApprovals
                    .map((approval) => approval.deadline_history_id)
                    .filter(Boolean)
            ),
        ];

        const userIds = [
            ...new Set(
                [
                    ...planApprovals.map((approval) => approval.requested_by),
                    ...planApprovals.map((approval) => approval.reviewed_by),
                    ...deadlineApprovals.map((approval) => approval.requested_by),
                    ...deadlineApprovals.map((approval) => approval.reviewed_by),
                    ...milestones.map((milestone) => milestone.pic_id),
                ].filter((id): id is string => Boolean(id))
            ),
        ];

        const [deadlineHistoryResult, userResult] = await timeOperation(trace, 'approval.history_and_users', () => Promise.all([
            readApprovalRows('milestone_deadline_history', 'id,start_date,duration_working_days,due_date,change_reason',
                { column: 'id', ids: deadlineHistoryIds }),
            readApprovalRows('users', 'id,full_name,role', { column: 'id', ids: userIds }),
        ]));

        if (deadlineHistoryResult.error) {
            throw safeError(
                deadlineHistoryResult.error,
                'milestone_deadline_history'
            );
        }

        if (userResult.error) {
            throw safeError(userResult.error, 'users');
        }

        const deadlineHistories =
            (deadlineHistoryResult.data || []) as DeadlineHistoryRow[];

        const users = (userResult.data || []) as UserRow[];

        /*
         * Maps
         */
        const projectMap = new Map(
            projects.map((project) => [project.id, project])
        );

        const milestoneMap = new Map(
            milestones.map((milestone) => [milestone.id, milestone])
        );

        const deadlineHistoryMap = new Map(
            deadlineHistories.map((deadline) => [deadline.id, deadline])
        );

        const userMap = new Map(
            users.map((user) => [user.id, user])
        );

        /*
         * Determine latest/current row for each entity.
         */
        const latestPlanByProject = new Map<string, string>();

        for (const approval of planApprovals) {
            if ((!phases.get(approval.project_id) || approval.phase_id === phases.get(approval.project_id)) && !latestPlanByProject.has(approval.project_id)) {
                latestPlanByProject.set(approval.project_id, approval.id);
            }
        }

        const latestDeadlineByMilestone = new Map<string, string>();

        for (const approval of deadlineApprovals) {
            if (!latestDeadlineByMilestone.has(approval.milestone_id)) {
                latestDeadlineByMilestone.set(
                    approval.milestone_id,
                    approval.id
                );
            }
        }

        /*
         * Project Plan items
         */
        const projectPlanItems = planApprovals.map((approval) => {
            const project = projectMap.get(approval.project_id);

            return {
                id: approval.id,
                category: 'PROJECT_PLAN' as const,
                phaseId: approval.phase_id || null,
                phaseName: projectPhaseName(approval.phase),
                status: approval.status,
                isCurrentApproval:
                    latestPlanByProject.get(approval.project_id) === approval.id,

                title: `Project Plan Review: ${project?.name || approval.project_id
                    }`,

                projectId: approval.project_id,
                projectName: project?.name || '-',
                projectCode: approval.project_id.slice(0, 8),
                clientName: project?.customer || '-',

                targetEntityId: approval.project_id,

                submittedBy:
                    userMap.get(approval.requested_by)?.full_name || '-',

                submittedAt: approval.submitted_at,
                requestedAt: approval.submitted_at,

                requester: userPayload(
                    userMap.get(approval.requested_by)
                ),

                reviewer: approval.reviewed_by
                    ? userPayload(userMap.get(approval.reviewed_by))
                    : null,

                requestNote: approval.request_note,
                reviewNote: approval.review_note,

                feedback:
                    approval.review_note ||
                    approval.request_note ||
                    null,

                approvedAt: approval.reviewed_at,

                details:
                    'Initial project timeline approval before workflow execution.',
            };
        });

        /*
         * Deadline Change items
         */
        const deadlineItems = deadlineApprovals.map((approval) => {
            const milestone = milestoneMap.get(approval.milestone_id);
            const project = milestone
                ? projectMap.get(milestone.project_id)
                : undefined;

            const proposedDeadline = deadlineHistoryMap.get(
                approval.deadline_history_id
            );

            return {
                id: approval.id,
                category: 'DEADLINE' as const,
                status: approval.status,

                isCurrentApproval:
                    latestDeadlineByMilestone.get(approval.milestone_id) ===
                    approval.id,

                title: `Deadline Review: ${milestone?.name || approval.milestone_id
                    }`,

                projectId: milestone?.project_id || '',
                projectName: project?.name || '-',
                projectCode: project?.id.slice(0, 8) || '-',
                clientName: project?.customer || '-',

                milestoneId: milestone?.id,
                milestoneName: milestone?.name,
                stepOrder: milestone?.step_order,

                targetEntityId: milestone?.id || approval.milestone_id,

                submittedBy:
                    userMap.get(approval.requested_by)?.full_name || '-',

                submittedAt: approval.requested_at,
                requestedAt: approval.requested_at,

                requester: userPayload(
                    userMap.get(approval.requested_by)
                ),

                reviewer: approval.reviewed_by
                    ? userPayload(userMap.get(approval.reviewed_by))
                    : null,

                reviewNote: approval.review_note,

                feedback:
                    proposedDeadline?.change_reason ||
                    approval.review_note ||
                    null,

                currentDeadline: milestone
                    ? {
                        start_date: milestone.start_date,
                        duration_working_days:
                            milestone.duration_working_days,
                        due_date: milestone.due_date,
                    }
                    : undefined,

                proposedDeadline: proposedDeadline
                    ? {
                        start_date: proposedDeadline.start_date,
                        duration_working_days:
                            proposedDeadline.duration_working_days,
                        due_date: proposedDeadline.due_date,
                        change_reason: proposedDeadline.change_reason,
                    }
                    : undefined,

                deadline:
                    proposedDeadline?.due_date ||
                    milestone?.due_date ||
                    undefined,

                approvedAt: approval.reviewed_at,

                details: proposedDeadline
                    ? `Proposed due date ${proposedDeadline.due_date}. Current effective due date ${milestone?.due_date || 'not set'
                    }.`
                    : 'Deadline change request.',
            };
        });

        const items = [
            ...projectPlanItems,
            ...deadlineItems,
            ...outputItems,
        ].sort((a, b) => {
            const aPending =
                a.status === 'PENDING' &&
                a.isCurrentApproval !== false;

            const bPending =
                b.status === 'PENDING' &&
                b.isCurrentApproval !== false;

            if (aPending !== bPending) {
                return Number(bPending) - Number(aPending);
            }

            return String(b.requestedAt).localeCompare(
                String(a.requestedAt)
            ) || `${a.category}:${a.id}`.localeCompare(`${b.category}:${b.id}`);
        });

        /*
         * Counters count CURRENT visible pending items, including blocked output reviews.
         */
        const pendingProjectPlans = projectPlanItems.filter(
            (item) =>
                item.status === 'PENDING' &&
                item.isCurrentApproval
        ).length;

        const pendingDeadlines = deadlineItems.filter(
            (item) =>
                item.status === 'PENDING' &&
                item.isCurrentApproval
        ).length;


        return {
            stats: {
                totalPending:
                    pendingProjectPlans +
                    pendingDeadlines + outputItems.length,

                pendingProjectPlans,
                pendingDeadlines,
                pendingDocs: outputItems.length,
            },

            items,
        };
    }
}
