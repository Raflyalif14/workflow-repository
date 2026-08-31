import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { approvalKeys, assignmentKeys, milestoneKeys, projectKeys } from "@/lib/query-keys";
import {
  MilestoneDeadlineApproval,
  MilestoneSubmissionApproval,
  ProjectMilestonePhase4,
} from "@/types/project";

export type MilestoneApprovalState = {
  deadlineApproval: MilestoneDeadlineApproval | null;
  deadlineApprovalHistory: MilestoneDeadlineApproval[];
  submissionApproval: MilestoneSubmissionApproval | null;
  submissionApprovalHistory: MilestoneSubmissionApproval[];
};

type DeadlineInput = {
  start_date: string;
  duration_working_days: number;
  reason?: string;
};

const invalidateMilestoneWorkflow = (
  queryClient: ReturnType<typeof useQueryClient>,
  projectId?: string,
  milestoneId?: string
) => {
  queryClient.invalidateQueries({ queryKey: projectKeys.all() });
  queryClient.invalidateQueries({ queryKey: approvalKeys.all() });
  queryClient.invalidateQueries({ queryKey: approvalKeys.stats() });
  queryClient.invalidateQueries({ queryKey: assignmentKeys.myAssignedMilestones() });
  queryClient.invalidateQueries({ queryKey: assignmentKeys.myAssignedProjects() });
  if (projectId) {
    queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
    queryClient.invalidateQueries({ queryKey: projectKeys.milestones(projectId) });
    queryClient.invalidateQueries({ queryKey: projectKeys.progress(projectId) });
    queryClient.invalidateQueries({ queryKey: projectKeys.planApproval(projectId) });
  }
  if (milestoneId) {
    queryClient.invalidateQueries({ queryKey: milestoneKeys.workflowState(milestoneId) });
  }
};

export function useMilestoneApprovalStates(
  milestones: ProjectMilestonePhase4[],
  enabled = true
) {
  return useQueries({
    queries: milestones.map((milestone) => ({
      queryKey: milestoneKeys.workflowState(milestone.id),
      queryFn: async (): Promise<MilestoneApprovalState> => {
        const [deadlineApproval, deadlineApprovalHistory, submissionApprovalHistory] = await Promise.all([
          apiClient<MilestoneDeadlineApproval | null>(`/milestones/${milestone.id}/deadline-approval`),
          apiClient<MilestoneDeadlineApproval[]>(`/milestones/${milestone.id}/deadline-approval-history`),
          apiClient<MilestoneSubmissionApproval[]>(`/milestones/${milestone.id}/approval-history`),
        ]);

        return {
          deadlineApproval,
          deadlineApprovalHistory,
          submissionApproval: submissionApprovalHistory[0] || null,
          submissionApprovalHistory,
        };
      },
      enabled,
      staleTime: 0,
      refetchOnWindowFocus: true,
    })),
  });
}

export function useSaveMilestoneDeadline(projectId: string, milestoneId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: DeadlineInput) =>
      apiClient(`/milestones/${milestoneId}/deadline`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: () => invalidateMilestoneWorkflow(queryClient, projectId, milestoneId),
  });
}

export function useStartMilestone(projectId: string, milestoneId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiClient(`/milestones/${milestoneId}/start`, { method: "POST" }),
    onSuccess: () => invalidateMilestoneWorkflow(queryClient, projectId, milestoneId),
    onError: () => invalidateMilestoneWorkflow(queryClient, projectId, milestoneId),
  });
}

export function useCompleteMilestone(projectId: string, milestoneId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiClient(`/milestones/${milestoneId}/complete`, { method: "POST" }),
    onSuccess: () => invalidateMilestoneWorkflow(queryClient, projectId, milestoneId),
    onError: () => invalidateMilestoneWorkflow(queryClient, projectId, milestoneId),
  });
}

export function useSubmitMilestone(projectId: string, milestoneId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (note?: string) =>
      apiClient<{
        milestone_id: string;
        status: string;
        approval?: { id: string; status: string };
      }>(`/milestones/${milestoneId}/submit`, {
        method: "POST",
        body: JSON.stringify(note?.trim() ? { note: note.trim() } : {}),
      }),
    onSuccess: () => invalidateMilestoneWorkflow(queryClient, projectId, milestoneId),
    onError: () => invalidateMilestoneWorkflow(queryClient, projectId, milestoneId),
  });
}

export function useStartMilestoneRevision(projectId: string, milestoneId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiClient<{
        milestone_id: string;
        status: string;
      }>(`/milestones/${milestoneId}/start-revision`, { method: "POST" }),
    onSuccess: () => invalidateMilestoneWorkflow(queryClient, projectId, milestoneId),
    onError: () => invalidateMilestoneWorkflow(queryClient, projectId, milestoneId),
  });
}

export function useReviewDeadlineApproval(projectId?: string, milestoneId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ approvalId, decision, note }: { approvalId: string; decision: "APPROVE" | "REJECT"; note?: string }) =>
      apiClient(`/deadline-approvals/${approvalId}/${decision === "APPROVE" ? "approve" : "reject"}`, {
        method: "POST",
        body: JSON.stringify(note?.trim() ? { note: note.trim() } : {}),
      }),
    onSuccess: () => invalidateMilestoneWorkflow(queryClient, projectId, milestoneId),
    onError: () => invalidateMilestoneWorkflow(queryClient, projectId, milestoneId),
  });
}

export function useReviewSubmissionApproval(projectId?: string, milestoneId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ approvalId, decision, note }: { approvalId: string; decision: "APPROVE" | "REJECT"; note?: string }) =>
      apiClient<{
        milestone_id: string;
        status: string;
        current_milestone?: { id: string; name: string; status: string; completed_at?: string | null };
        next_milestone?: { id: string; name: string; step_order: number; status: string } | null;
        project_completed?: boolean;
        approval?: { id: string; status: string; review_note?: string | null };
      }>(`/milestone-approvals/${approvalId}/${decision === "APPROVE" ? "approve" : "reject"}`, {
        method: "POST",
        body: JSON.stringify(note?.trim() ? { note: note.trim() } : {}),
      }),
    onSuccess: () => invalidateMilestoneWorkflow(queryClient, projectId, milestoneId),
    onError: () => invalidateMilestoneWorkflow(queryClient, projectId, milestoneId),
  });
}
