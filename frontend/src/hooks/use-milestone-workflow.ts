import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { approvalKeys, assignmentKeys, milestoneKeys, projectKeys } from "@/lib/query-keys";
import {
  MilestoneDeadlineApproval,
  MilestoneSubmissionApproval,
  MilestoneSubmissionAttachmentDownload,
  MilestoneSubmissionPackage,
  ProjectMilestonePhase4,
} from "@/types/project";

export type MilestoneApprovalState = {
  deadlineApproval: MilestoneDeadlineApproval | null;
  deadlineApprovalHistory: MilestoneDeadlineApproval[];
  submissionApproval: MilestoneSubmissionApproval | null;
  submissionApprovalHistory: MilestoneSubmissionApproval[];
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

type MilestoneSubmissionInput = {
  files: File[];
  note?: string;
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
    queryClient.invalidateQueries({ queryKey: milestoneKeys.submissionApprovalHistory(milestoneId) });
    queryClient.invalidateQueries({ queryKey: milestoneKeys.deadlineStatus(milestoneId) });
    queryClient.invalidateQueries({ queryKey: milestoneKeys.submissionPackage(milestoneId) });
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
    mutationFn: ({ files, note }: MilestoneSubmissionInput) => {
      const formData = new FormData();
      files.forEach((file) => formData.append("files", file));
      if (note?.trim()) formData.append("note", note.trim());

      return apiClient<{
        milestone_id: string;
        status: string;
        approval?: { id: string; status: string };
      }>(`/milestones/${milestoneId}/submit`, {
        method: "POST",
        body: formData,
      });
    },
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
    onSuccess: () => {
      invalidateMilestoneWorkflow(queryClient, projectId, milestoneId);
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ["documents", { projectId }] });
      }
    },
    onError: () => invalidateMilestoneWorkflow(queryClient, projectId, milestoneId),
  });
}

export function useSubmissionPackage(milestoneId: string, enabled = true) {
  return useQuery<MilestoneSubmissionPackage | null>({
    queryKey: milestoneKeys.submissionPackage(milestoneId),
    queryFn: () =>
      apiClient<MilestoneSubmissionPackage | null>(
        `/milestones/${milestoneId}/submission-package`
      ),
    enabled: Boolean(milestoneId) && enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

export function useDownloadSubmissionAttachment(milestoneId: string) {
  return useMutation({
    mutationFn: async (attachmentId: string) => {
      const result = await apiClient<MilestoneSubmissionAttachmentDownload>(
        `/milestones/${milestoneId}/submission-package/attachments/${attachmentId}/download-url`
      );
      return result;
    },
    onSuccess: (result) => {
      if (result?.url) {
        window.open(result.url, "_blank", "noopener,noreferrer");
      }
    },
  });
}
