import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { approvalKeys, assignmentKeys, milestoneKeys, projectKeys } from "@/lib/query-keys";
import { ApprovalFilters, ApprovalItem, ApprovalStats } from "@/types/approval";
import {
  MilestoneDeadlineApproval,
  MilestoneSubmissionApproval,
  Project,
  ProjectMilestonePhase4,
  ProjectPlanApproval,
  ProjectsResponse,
} from "@/types/project";

const nameOf = (user?: { fullName?: string; full_name?: string } | null) =>
  user?.fullName || user?.full_name || "-";

const matchesSearch = (item: ApprovalItem, search: string) => {
  const query = search.trim().toLowerCase();
  if (!query) return true;

  return [
    item.title,
    item.projectName,
    item.clientName,
    item.milestoneName || "",
    item.submittedBy,
    item.proposedDeadline?.change_reason || "",
    item.requestNote || "",
    item.submissionNote || "",
    item.reviewNote || "",
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
};

async function getProjectsForApprovals() {
  const response = await apiClient<ProjectsResponse>("/projects?page=1&limit=100");
  return response.projects;
}

async function getProjectMilestones(project: Project) {
  const milestones = await apiClient<ProjectMilestonePhase4[]>("/projects/" + project.id + "/milestones");
  return milestones.map((milestone) => ({ project, milestone }));
}

function mapProjectPlanApproval(approval: ProjectPlanApproval): ApprovalItem {
  const project = approval.project;
  return {
    id: approval.id,
    category: "PROJECT_PLAN",
    isCurrentApproval: approval.status === "PENDING",
    title: "Project Plan Review: " + (project?.name || approval.project_id),
    status: approval.status,
    projectId: approval.project_id,
    projectName: project?.name || "-",
    projectCode: approval.project_id.slice(0, 8),
    clientName: project?.customer || "-",
    targetEntityId: approval.project_id,
    submittedBy: nameOf(approval.requested_by),
    submittedAt: approval.submitted_at,
    requestedAt: approval.submitted_at,
    requester: approval.requested_by,
    reviewer: approval.reviewed_by,
    requestNote: approval.request_note,
    reviewNote: approval.review_note,
    feedback: approval.request_note || approval.review_note,
    details: "Review the initial project timeline before workflow execution starts.",
  };
}

async function getApprovalItems() {
  const [planApprovals, projects] = await Promise.all([
    apiClient<ProjectPlanApproval[]>("/project-plan-approvals/pending"),
    getProjectsForApprovals(),
  ]);
  const projectMilestoneGroups = await Promise.all(projects.map(getProjectMilestones));
  const contexts = projectMilestoneGroups.flat();

  const milestoneItems = await Promise.all(
    contexts.map(async ({ project, milestone }) => {
      const [deadlineApproval, submissionApprovals] = await Promise.all([
        apiClient<MilestoneDeadlineApproval | null>("/milestones/" + milestone.id + "/deadline-approval"),
        apiClient<MilestoneSubmissionApproval[]>("/milestones/" + milestone.id + "/approval-history"),
      ]);
      const result: ApprovalItem[] = [];

      if (deadlineApproval) {
        result.push({
          id: deadlineApproval.id,
          category: "DEADLINE",
          isCurrentApproval: true,
          title: "Deadline Review: " + milestone.name,
          status: deadlineApproval.status,
          projectId: project.id,
          projectName: project.name,
          projectCode: project.projectCode || project.id.slice(0, 8),
          clientName: project.customer || project.clientName || "-",
          targetEntityId: milestone.id,
          milestoneId: milestone.id,
          milestoneName: milestone.name,
          stepOrder: milestone.step_order,
          stageDefaultRole: milestone.workflow_stage?.default_role,
          submittedBy: nameOf(deadlineApproval.requested_by),
          submittedAt: deadlineApproval.requested_at,
          requestedAt: deadlineApproval.requested_at,
          requester: deadlineApproval.requested_by,
          reviewer: deadlineApproval.reviewed_by,
          reviewNote: deadlineApproval.review_note,
          feedback: deadlineApproval.deadline?.change_reason || deadlineApproval.review_note,
          currentDeadline: {
            start_date: milestone.start_date,
            duration_working_days: milestone.duration_working_days,
            due_date: milestone.due_date,
          },
          proposedDeadline: deadlineApproval.deadline,
          deadline: deadlineApproval.deadline?.due_date || milestone.due_date || undefined,
          details: deadlineApproval.deadline
            ? "Proposed due date " + deadlineApproval.deadline.due_date + ". Current effective due date " + (milestone.due_date || "not set") + "."
            : "Deadline approval record has no linked proposal.",
        });
      }

      for (const [index, submissionApproval] of submissionApprovals.entries()) {
        result.push({
          id: submissionApproval.id,
          category: "SUBMISSION",
          isCurrentApproval: index === 0,
          title: "Submission Review: " + milestone.name,
          status: submissionApproval.status,
          projectId: project.id,
          projectName: project.name,
          projectCode: project.projectCode || project.id.slice(0, 8),
          clientName: project.customer || project.clientName || "-",
          targetEntityId: milestone.id,
          milestoneId: milestone.id,
          milestoneName: milestone.name,
          stepOrder: milestone.step_order,
          stageDefaultRole: milestone.workflow_stage?.default_role,
          submittedBy: nameOf(submissionApproval.submitted_by),
          submittedAt: submissionApproval.submitted_at,
          requestedAt: submissionApproval.submitted_at,
          requester: submissionApproval.submitted_by,
          reviewer: submissionApproval.reviewed_by,
          pic: milestone.pic,
          submissionNote: submissionApproval.submission_note,
          reviewNote: submissionApproval.review_note,
          feedback: submissionApproval.review_note || submissionApproval.submission_note,
          currentDeadline: {
            start_date: milestone.start_date,
            duration_working_days: milestone.duration_working_days,
            due_date: milestone.due_date,
          },
          deadline: milestone.due_date || undefined,
          approvedAt: submissionApproval.reviewed_at,
          details: "Step " + milestone.step_order + ". Milestone status is " + milestone.status + ".",
        });
      }

      return result;
    })
  );

  return [...planApprovals.map(mapProjectPlanApproval), ...milestoneItems.flat()].sort((a, b) => {
    const pendingOrder = Number(b.status === "PENDING" && b.isCurrentApproval !== false) - Number(a.status === "PENDING" && a.isCurrentApproval !== false);
    if (pendingOrder !== 0) return pendingOrder;
    return b.requestedAt.localeCompare(a.requestedAt);
  });
}

type ApprovalOverviewResponse = {
  stats: ApprovalStats;
  items: ApprovalItem[];
};

const approvalOverviewQueryKey = [
  ...approvalKeys.all(),
  'overview',
] as const;

async function getApprovalOverview(): Promise<ApprovalOverviewResponse> {
  return apiClient<ApprovalOverviewResponse>('/approvals/overview');
}

export function useApprovals(filters: ApprovalFilters = {}) {
  const {
    type = 'ALL',
    status = 'PENDING',
    search = '',
  } = filters;

  return useQuery<
    ApprovalOverviewResponse,
    Error,
    ApprovalItem[]
  >({
    queryKey: approvalOverviewQueryKey,
    queryFn: getApprovalOverview,

    select: (overview) =>
      overview.items.filter((item) => {
        const typeMatches =
          type === 'ALL' || item.category === type;

        const statusMatches =
          status === 'ALL' || item.status === status;

        const currentPendingMatches =
          status !== 'PENDING' ||
          item.isCurrentApproval !== false;

        return (
          typeMatches &&
          statusMatches &&
          currentPendingMatches &&
          matchesSearch(item, search)
        );
      }),

    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useApprovalStats() {
  return useQuery<
    ApprovalOverviewResponse,
    Error,
    ApprovalStats
  >({
    queryKey: approvalOverviewQueryKey,
    queryFn: getApprovalOverview,
    select: (overview) => overview.stats,

    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useProcessApproval() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ item, action, feedback }: { item: ApprovalItem; action: "APPROVE" | "REJECT"; feedback?: string }) => {
      const path =
        item.category === "PROJECT_PLAN"
          ? "/projects/" + item.projectId + "/plan/" + (action === "APPROVE" ? "approve" : "reject")
          : item.category === "DEADLINE"
            ? "/deadline-approvals/" + item.id + "/" + (action === "APPROVE" ? "approve" : "reject")
            : "/milestone-approvals/" + item.id + "/" + (action === "APPROVE" ? "approve" : "reject");
      return apiClient(path, {
        method: "POST",
        body: JSON.stringify(feedback?.trim() ? { note: feedback.trim() } : {}),
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: approvalKeys.all() });
      queryClient.invalidateQueries({ queryKey: approvalKeys.stats() });
      queryClient.invalidateQueries({ queryKey: projectKeys.all() });
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(variables.item.projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.milestones(variables.item.projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.progress(variables.item.projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.planApproval(variables.item.projectId) });
      if (variables.item.milestoneId) {
        queryClient.invalidateQueries({ queryKey: milestoneKeys.workflowState(variables.item.milestoneId) });
      }
      queryClient.invalidateQueries({ queryKey: assignmentKeys.myAssignedMilestones() });
    },
    onError: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: approvalKeys.all() });
      queryClient.invalidateQueries({ queryKey: approvalKeys.stats() });
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(variables.item.projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.milestones(variables.item.projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.planApproval(variables.item.projectId) });
    },
  });
}
