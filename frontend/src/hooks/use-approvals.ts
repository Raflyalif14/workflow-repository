import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { approvalKeys, assignmentKeys, milestoneKeys, projectKeys } from "@/lib/query-keys";
import { ApprovalFilters, ApprovalItem, ApprovalStats } from "@/types/approval";
import {
  MilestoneDeadlineApproval,
  MilestoneInitiationApproval,
  MilestoneSubmissionApproval,
  Project,
  ProjectMilestonePhase4,
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
    item.milestoneName,
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
  const milestones = await apiClient<ProjectMilestonePhase4[]>(`/projects/${project.id}/milestones`);
  return milestones.map((milestone) => ({ project, milestone }));
}

async function getApprovalItems() {
  const projects = await getProjectsForApprovals();
  const projectMilestoneGroups = await Promise.all(projects.map(getProjectMilestones));
  const contexts = projectMilestoneGroups.flat();

  const items = await Promise.all(
    contexts.map(async ({ project, milestone }) => {
      const [deadlineApproval, initiationApproval, submissionApprovals] = await Promise.all([
        apiClient<MilestoneDeadlineApproval | null>(`/milestones/${milestone.id}/deadline-approval`),
        apiClient<MilestoneInitiationApproval | null>(`/milestones/${milestone.id}/initiation-approval`),
        apiClient<MilestoneSubmissionApproval[]>(`/milestones/${milestone.id}/approval-history`),
      ]);

      const result: ApprovalItem[] = [];

      if (deadlineApproval) {
        result.push({
          id: deadlineApproval.id,
          category: "DEADLINE",
          isCurrentApproval: true,
          title: `Deadline Review: ${milestone.name}`,
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
            ? `Proposed due date ${deadlineApproval.deadline.due_date}. Current effective due date ${milestone.due_date || "not set"}.`
            : "Deadline approval record has no linked proposal.",
        });
      }

      if (initiationApproval) {
        result.push({
          id: initiationApproval.id,
          category: "INITIATION",
          isCurrentApproval: true,
          title: `Initiation Review: ${milestone.name}`,
          status: initiationApproval.status,
          projectId: project.id,
          projectName: project.name,
          projectCode: project.projectCode || project.id.slice(0, 8),
          clientName: project.customer || project.clientName || "-",
          targetEntityId: milestone.id,
          milestoneId: milestone.id,
          milestoneName: milestone.name,
          stepOrder: milestone.step_order,
          stageDefaultRole: milestone.workflow_stage?.default_role,
          submittedBy: nameOf(initiationApproval.requested_by),
          submittedAt: initiationApproval.requested_at,
          requestedAt: initiationApproval.requested_at,
          requester: initiationApproval.requested_by,
          reviewer: initiationApproval.reviewed_by,
          pic: milestone.pic,
          requestNote: initiationApproval.request_note,
          reviewNote: initiationApproval.review_note,
          feedback: initiationApproval.request_note || initiationApproval.review_note,
          currentDeadline: {
            start_date: milestone.start_date,
            duration_working_days: milestone.duration_working_days,
            due_date: milestone.due_date,
          },
          deadline: milestone.due_date || undefined,
          details: `Step ${milestone.step_order}. Milestone remains ${milestone.status} until Sales initiates it.`,
        });
      }

      for (const [index, submissionApproval] of submissionApprovals.entries()) {
        result.push({
          id: submissionApproval.id,
          category: "SUBMISSION",
          isCurrentApproval: index === 0,
          title: `Submission Review: ${milestone.name}`,
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
          details: `Step ${milestone.step_order}. Milestone status is ${milestone.status}.`,
        });
      }

      return result;
    })
  );

  return items.flat().sort((a, b) => {
    const pendingOrder = Number(b.status === "PENDING" && b.isCurrentApproval !== false) - Number(a.status === "PENDING" && a.isCurrentApproval !== false);
    if (pendingOrder !== 0) return pendingOrder;
    return b.requestedAt.localeCompare(a.requestedAt);
  });
}

export function useApprovals(filters: ApprovalFilters = {}) {
  const { type = "ALL", status = "PENDING", search = "" } = filters;

  return useQuery<ApprovalItem[]>({
    queryKey: approvalKeys.list({ type, status, search }),
    queryFn: async () => {
      const approvals = await getApprovalItems();
      return approvals.filter((item) => {
        const typeMatches = type === "ALL" || item.category === type;
        const statusMatches = status === "ALL" || item.status === status;
        const currentPendingMatches =
          status !== "PENDING" || item.category !== "SUBMISSION" || item.isCurrentApproval !== false;
        return typeMatches && statusMatches && currentPendingMatches && matchesSearch(item, search);
      });
    },
    refetchInterval: status === "PENDING" ? 15000 : false,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

export function useApprovalStats() {
  return useQuery<ApprovalStats>({
    queryKey: approvalKeys.stats(),
    queryFn: async () => {
      const approvals = await getApprovalItems();
      const pendingDeadlines = approvals.filter((item) => item.category === "DEADLINE" && item.status === "PENDING").length;
      const pendingInitiations = approvals.filter((item) => item.category === "INITIATION" && item.status === "PENDING").length;
      const pendingSubmissions = approvals.filter(
        (item) => item.category === "SUBMISSION" && item.status === "PENDING" && item.isCurrentApproval !== false
      ).length;

      return {
        totalPending: pendingDeadlines + pendingInitiations + pendingSubmissions,
        pendingDeadlines,
        pendingInitiations,
        pendingSubmissions,
        pendingMilestones: pendingSubmissions,
        pendingDocs: 0,
      };
    },
    refetchInterval: 15000,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

export function useProcessApproval() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      item,
      action,
      feedback,
    }: {
      item: ApprovalItem;
      action: "APPROVE" | "REJECT";
      feedback?: string;
    }) => {
      const base =
        item.category === "DEADLINE"
          ? "/deadline-approvals"
          : item.category === "INITIATION"
            ? "/milestone-initiation-approvals"
            : "/milestone-approvals";
      return apiClient(`${base}/${item.id}/${action === "APPROVE" ? "approve" : "reject"}`, {
        method: "POST",
        body: JSON.stringify(feedback?.trim() ? { note: feedback.trim() } : {}),
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: approvalKeys.all() });
      queryClient.invalidateQueries({ queryKey: approvalKeys.stats() });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(variables.item.projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.milestones(variables.item.projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.progress(variables.item.projectId) });
      queryClient.invalidateQueries({ queryKey: milestoneKeys.workflowState(variables.item.milestoneId) });
      queryClient.invalidateQueries({ queryKey: assignmentKeys.myAssignedMilestones() });
    },
    onError: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: approvalKeys.all() });
      queryClient.invalidateQueries({ queryKey: approvalKeys.stats() });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(variables.item.projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.milestones(variables.item.projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.progress(variables.item.projectId) });
      queryClient.invalidateQueries({ queryKey: milestoneKeys.workflowState(variables.item.milestoneId) });
      queryClient.invalidateQueries({ queryKey: assignmentKeys.myAssignedMilestones() });
    },
  });
}
