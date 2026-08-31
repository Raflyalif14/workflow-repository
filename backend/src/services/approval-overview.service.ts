import { supabaseAdmin } from '../config/supabase';

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
};

type MilestoneRow = {
    id: string;
    project_id: string;
    name: string;
    step_order: number;
    status: string;
    start_date: string | null;
    duration_working_days: number | null;
    due_date: string | null;
    pic_id: string | null;
};

type ProjectPlanApprovalRow = {
    id: string;
    project_id: string;
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

type SubmissionApprovalRow = {
    id: string;
    milestone_id: string;
    submitted_by: string;
    submission_note: string | null;
    status: ApprovalStatus;
    reviewed_by: string | null;
    review_note: string | null;
    submitted_at: string;
    reviewed_at: string | null;
};

type UserRow = {
    id: string;
    full_name: string;
    role: string;
};

function safeError(error: unknown, context: string): Error {
    const message = error instanceof Error ? error.message : String(error);

    console.error(`[ApprovalOverviewService] ${context}: ${message}`);

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
    static async getOverview(actor: ApprovalOverviewActor) {
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
        const { data: projectData, error: projectError } = await supabaseAdmin
            .from('projects')
            .select('id,name,customer')
            .order('updated_at', { ascending: false });

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
                    pendingSubmissions: 0,
                },
                items: [],
            };
        }

        const projectIds = projects.map((project) => project.id);

        /*
         * Step 2
         * Fetch milestones and project-plan approval history in batch.
         */
        const [milestoneResult, planResult] = await Promise.all([
            supabaseAdmin
                .from('project_milestones')
                .select(
                    'id,project_id,name,step_order,status,start_date,duration_working_days,due_date,pic_id'
                )
                .in('project_id', projectIds),

            supabaseAdmin
                .from('project_plan_approvals')
                .select(
                    'id,project_id,status,requested_by,reviewed_by,request_note,review_note,submitted_at,reviewed_at'
                )
                .in('project_id', projectIds)
                .order('submitted_at', { ascending: false }),
        ]);

        if (milestoneResult.error) {
            throw safeError(milestoneResult.error, 'project_milestones');
        }

        if (planResult.error) {
            throw safeError(planResult.error, 'project_plan_approvals');
        }

        const milestones = (milestoneResult.data || []) as MilestoneRow[];
        const planApprovals = (planResult.data || []) as ProjectPlanApprovalRow[];

        const milestoneIds = milestones.map((milestone) => milestone.id);

        /*
         * Step 3
         * Fetch all milestone approval sources in batch.
         */
        const [deadlineResult, submissionResult] = milestoneIds.length
            ? await Promise.all([
                supabaseAdmin
                    .from('milestone_deadline_approvals')
                    .select(
                        'id,milestone_id,deadline_history_id,status,requested_by,reviewed_by,review_note,requested_at,reviewed_at'
                    )
                    .in('milestone_id', milestoneIds)
                    .order('requested_at', { ascending: false }),

                supabaseAdmin
                    .from('milestone_approvals')
                    .select(
                        'id,milestone_id,submitted_by,submission_note,status,reviewed_by,review_note,submitted_at,reviewed_at'
                    )
                    .in('milestone_id', milestoneIds)
                    .order('submitted_at', { ascending: false }),
            ])
            : [
                { data: [], error: null },
                { data: [], error: null },
            ];

        if (deadlineResult.error) {
            throw safeError(deadlineResult.error, 'milestone_deadline_approvals');
        }

        if (submissionResult.error) {
            throw safeError(submissionResult.error, 'milestone_approvals');
        }

        const deadlineApprovals =
            (deadlineResult.data || []) as DeadlineApprovalRow[];

        const submissionApprovals =
            (submissionResult.data || []) as SubmissionApprovalRow[];

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
                    ...submissionApprovals.map((approval) => approval.submitted_by),
                    ...submissionApprovals.map((approval) => approval.reviewed_by),
                    ...milestones.map((milestone) => milestone.pic_id),
                ].filter((id): id is string => Boolean(id))
            ),
        ];

        const [deadlineHistoryResult, userResult] = await Promise.all([
            deadlineHistoryIds.length
                ? supabaseAdmin
                    .from('milestone_deadline_history')
                    .select(
                        'id,start_date,duration_working_days,due_date,change_reason'
                    )
                    .in('id', deadlineHistoryIds)
                : Promise.resolve({ data: [], error: null }),

            userIds.length
                ? supabaseAdmin
                    .from('users')
                    .select('id,full_name,role')
                    .in('id', userIds)
                : Promise.resolve({ data: [], error: null }),
        ]);

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
            if (!latestPlanByProject.has(approval.project_id)) {
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

        const latestSubmissionByMilestone = new Map<string, string>();

        for (const approval of submissionApprovals) {
            if (!latestSubmissionByMilestone.has(approval.milestone_id)) {
                latestSubmissionByMilestone.set(
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

        /*
         * SA Submission items
         */
        const submissionItems = submissionApprovals.map(
            (approval) => {
                const milestone = milestoneMap.get(
                    approval.milestone_id
                );

                const project = milestone
                    ? projectMap.get(milestone.project_id)
                    : undefined;

                return {
                    id: approval.id,
                    category: 'SUBMISSION' as const,
                    status: approval.status,

                    isCurrentApproval:
                        latestSubmissionByMilestone.get(
                            approval.milestone_id
                        ) === approval.id,

                    title: `Submission Review: ${milestone?.name || approval.milestone_id
                        }`,

                    projectId: milestone?.project_id || '',
                    projectName: project?.name || '-',
                    projectCode: project?.id.slice(0, 8) || '-',
                    clientName: project?.customer || '-',

                    milestoneId: milestone?.id,
                    milestoneName: milestone?.name,
                    stepOrder: milestone?.step_order,

                    targetEntityId:
                        milestone?.id || approval.milestone_id,

                    submittedBy:
                        userMap.get(approval.submitted_by)?.full_name || '-',

                    submittedAt: approval.submitted_at,
                    requestedAt: approval.submitted_at,

                    requester: userPayload(
                        userMap.get(approval.submitted_by)
                    ),

                    reviewer: approval.reviewed_by
                        ? userPayload(userMap.get(approval.reviewed_by))
                        : null,

                    pic: milestone?.pic_id
                        ? userPayload(userMap.get(milestone.pic_id))
                        : null,

                    submissionNote: approval.submission_note,
                    reviewNote: approval.review_note,

                    feedback:
                        approval.review_note ||
                        approval.submission_note ||
                        null,

                    currentDeadline: milestone
                        ? {
                            start_date: milestone.start_date,
                            duration_working_days:
                                milestone.duration_working_days,
                            due_date: milestone.due_date,
                        }
                        : undefined,

                    deadline: milestone?.due_date || undefined,
                    approvedAt: approval.reviewed_at,

                    details: milestone
                        ? `Step ${milestone.step_order}. Milestone status is ${milestone.status}.`
                        : 'Milestone submission approval.',
                };
            }
        );

        const items = [
            ...projectPlanItems,
            ...deadlineItems,
            ...submissionItems,
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
            );
        });

        /*
         * Only CURRENT pending approvals are actionable.
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

        const pendingSubmissions = submissionItems.filter(
            (item) =>
                item.status === 'PENDING' &&
                item.isCurrentApproval
        ).length;

        return {
            stats: {
                totalPending:
                    pendingProjectPlans +
                    pendingDeadlines +
                    pendingSubmissions,

                pendingProjectPlans,
                pendingDeadlines,
                pendingSubmissions,
            },

            items,
        };
    }
}
