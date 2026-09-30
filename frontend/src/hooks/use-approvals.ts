import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { approvalKeys, assignmentKeys, milestoneKeys, projectKeys } from "@/lib/query-keys";
import { ApprovalFilters, ApprovalItem, ApprovalStats } from "@/types/approval";

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

export function useApprovals(filters: ApprovalFilters = {}, enabled = true) {
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
    enabled,

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

export function useApprovalStats(enabled = true) {
  return useQuery<
    ApprovalOverviewResponse,
    Error,
    ApprovalStats
  >({
    queryKey: approvalOverviewQueryKey,
    queryFn: getApprovalOverview,
    enabled,
    select: (overview) => overview.stats,

    staleTime: 30_000,
    refetchInterval: enabled ? 60_000 : false,
    refetchOnWindowFocus: false,
  });
}

export function useProcessApproval() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ item, action, feedback, picId }: { item: ApprovalItem; action: "APPROVE" | "REJECT"; feedback?: string; picId?: string }) => {
      if (item.category !== "PROJECT_PLAN" && item.category !== "DEADLINE") throw new Error("Unsupported approval type.");
      const path = item.category === "PROJECT_PLAN"
        ? "/projects/" + item.projectId + "/plan/" + (action === "APPROVE" ? "approve" : "reject")
        : "/deadline-approvals/" + item.id + "/" + (action === "APPROVE" ? "approve" : "reject");
      const body: { note?: string; pic_id?: string } = {};
      if (feedback?.trim()) body.note = feedback.trim();
      if (item.category === "PROJECT_PLAN" && action === "APPROVE" && picId) body.pic_id = picId;
      return apiClient(path, {
        method: "POST",
        body: JSON.stringify(body),
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
      if (variables.item.category === "PROJECT_PLAN" && variables.action === "APPROVE" && variables.picId) {
        queryClient.invalidateQueries({ queryKey: projectKeys.assignmentHistory(variables.item.projectId) });
        queryClient.invalidateQueries({ queryKey: assignmentKeys.myAssignedProjects() });
      }
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
