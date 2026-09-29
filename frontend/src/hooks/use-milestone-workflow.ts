import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { approvalKeys, assignmentKeys, dashboardKeys, milestoneKeys, projectKeys } from "@/lib/query-keys";
import {
  MilestoneDeadlineApproval,
  ProjectMilestonePhase4,
} from "@/types/project";

export type MilestoneApprovalState = {
  deadlineApproval: MilestoneDeadlineApproval | null;
  deadlineApprovalHistory: MilestoneDeadlineApproval[];
};

export type MilestoneDeadlineStatus = {
  milestone_id: string;
  due_date: string | null;
  deadline_status: "NOT_SET" | "ON_TRACK" | "DUE_SOON" | "OVERDUE" | "COMPLETED";
  remaining_working_days: number | null;
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
    queryClient.invalidateQueries({ queryKey: projectKeys.activities(projectId) });
  }
  if (milestoneId) {
    queryClient.invalidateQueries({ queryKey: milestoneKeys.workflowState(milestoneId) });
    queryClient.invalidateQueries({ queryKey: milestoneKeys.deadlineStatus(milestoneId) });
  }
};

export function useMilestoneDeadlineStatus(milestoneId: string, enabled = true) {
  return useQuery<MilestoneDeadlineStatus>({
    queryKey: milestoneKeys.deadlineStatus(milestoneId),
    queryFn: () => apiClient<MilestoneDeadlineStatus>(`/milestones/${milestoneId}/deadline-status`),
    enabled: Boolean(milestoneId) && enabled,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

export function useMilestoneApprovalStates(
  milestones: ProjectMilestonePhase4[],
  enabled = true
) {
  return useQueries({
    queries: milestones.map((milestone) => ({
      queryKey: milestoneKeys.workflowState(milestone.id),
      queryFn: async (): Promise<MilestoneApprovalState> => {
        const [deadlineApproval, deadlineApprovalHistory] = await Promise.all([
          apiClient<MilestoneDeadlineApproval | null>(`/milestones/${milestone.id}/deadline-approval`),
          apiClient<MilestoneDeadlineApproval[]>(`/milestones/${milestone.id}/deadline-approval-history`),
        ]);

        return {
          deadlineApproval,
          deadlineApprovalHistory,
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

export function useCompleteMilestone(projectId: string, milestoneId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (outcome?: { outcome: "WON" | "LOST"; final_contract_value?: number; loss_reason?: string }) =>
      apiClient(`/milestones/${milestoneId}/complete`, {
        method: "POST",
        ...(outcome ? { body: JSON.stringify(outcome) } : {}),
      }),
    onSuccess: (_result, outcome) => {
      invalidateMilestoneWorkflow(queryClient, projectId, milestoneId);
      if (outcome) {
        queryClient.invalidateQueries({ queryKey: dashboardKeys.overview() });
        queryClient.invalidateQueries({ queryKey: ["output-documents", projectId] });
      }
    },
    onError: (_error, outcome) => {
      invalidateMilestoneWorkflow(queryClient, projectId, milestoneId);
      if (outcome) {
        queryClient.invalidateQueries({ queryKey: dashboardKeys.overview() });
        queryClient.invalidateQueries({ queryKey: ["output-documents", projectId] });
      }
    },
  });
}

export function useRetryMilestoneProgression(projectId: string, milestoneId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient(`/milestones/${milestoneId}/retry-progression`, { method: "POST" }),
    onSuccess: () => invalidateMilestoneWorkflow(queryClient, projectId, milestoneId),
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
