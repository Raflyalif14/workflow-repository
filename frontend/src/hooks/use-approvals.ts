import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { ApprovalItem, ApprovalStats, ApprovalFilters } from "@/types/approval";

export function useApprovals(filters: ApprovalFilters = {}) {
  const { type = "ALL", status = "PENDING", projectId, search = "" } = filters;

  return useQuery<ApprovalItem[]>({
    queryKey: ["approvals", { type, status, projectId, search }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (type && type !== "ALL") params.append("type", type);
      if (status && status !== "ALL") params.append("status", status);
      if (projectId) params.append("projectId", projectId);
      if (search) params.append("search", search);

      return apiClient<ApprovalItem[]>(`/approvals?${params.toString()}`);
    },
  });
}

export function useApprovalStats() {
  return useQuery<ApprovalStats>({
    queryKey: ["approval-stats"],
    queryFn: async () => apiClient<ApprovalStats>("/approvals/stats"),
    refetchInterval: 15000, // auto refresh every 15s
  });
}

export function useProcessApproval() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      action,
      feedback,
    }: {
      id: string;
      action: "APPROVE" | "REJECT";
      feedback?: string;
    }) => {
      return apiClient<{ success: boolean; message: string }>(
        `/approvals/${id}/decision`,
        {
          method: "POST",
          body: JSON.stringify({ action, feedback }),
        }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
      queryClient.invalidateQueries({ queryKey: ["approval-stats"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["project"] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useAddApprovalComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      content,
    }: {
      id: string;
      content: string;
    }) => {
      return apiClient(`/approvals/${id}/comments`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
    },
  });
}
