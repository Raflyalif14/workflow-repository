import { useBusinessRequest } from "./use-business-request";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { dashboardKeys, approvalKeys, assignmentKeys, milestoneKeys, projectKeys } from "@/lib/query-keys";
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

export type ApprovalOverviewResponse = {
  stats: ApprovalStats;
  items: ApprovalItem[];
};

const approvalOverviewQueryKey = approvalKeys.overview();

export function useApprovalOverview(enabled: boolean) {
  return useQuery({ queryKey: approvalOverviewQueryKey, queryFn: getApprovalOverview, enabled,
    staleTime: 30_000, refetchInterval: false, refetchOnWindowFocus: true });
}

async function getApprovalOverview(): Promise<ApprovalOverviewResponse> {
  const overview = await apiClient<ApprovalOverviewResponse>('/approvals/overview');
  if (!Array.isArray(overview?.items) || !overview.stats ||
      [overview.stats.totalPending, overview.stats.pendingProjectPlans, overview.stats.pendingDeadlines, overview.stats.pendingDocs]
        .some(value => !Number.isInteger(value) || value < 0)) throw new Error('Failed to load approval overview.');
  return overview;
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
    refetchInterval: false,
    refetchOnWindowFocus: true,
  });
}

export function useApprovalStats(enabled = true, poll = false) {
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
    refetchInterval: enabled && poll ? 60_000 : false,
    refetchOnWindowFocus: true,
  });
}

export function useProcessApproval() {
  const queryClient = useQueryClient();
  const business = useBusinessRequest();

  return useMutation({
    mutationFn: ({ item, action, feedback, picId, expectedPicRevision, requestId }: { item: ApprovalItem; action: "APPROVE" | "REJECT"; feedback?: string; picId?: string; expectedPicRevision?: string; requestId?: string }) => {
      if (item.category !== "PROJECT_PLAN" && item.category !== "DEADLINE") throw new Error("Unsupported approval type.");
      const path = item.category === "PROJECT_PLAN"
        ? "/projects/" + item.projectId + "/plan/" + (action === "APPROVE" ? "approve" : "reject")
        : "/deadline-approvals/" + item.id + "/" + (action === "APPROVE" ? "approve" : "reject");
      const body: { note?: string; pic_id?: string; expected_approval_id?: string; expected_pic_revision?: string; request_id?: string } = {};
      if (item.category === "PROJECT_PLAN") {
        body.expected_approval_id = item.id;
        if (expectedPicRevision !== undefined) body.expected_pic_revision = expectedPicRevision;
        if (requestId) body.request_id = requestId;
      }
      if (feedback?.trim()) body.note = feedback.trim();
      if (item.category === "PROJECT_PLAN" && action === "APPROVE" && picId) body.pic_id = picId;
      if (item.category === "DEADLINE") return business(item.projectId, "DEADLINE_REVIEW", path, "POST", body);
      return apiClient(path, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: dashboardKeys.overview() });
      queryClient.invalidateQueries({ queryKey: projectKeys.activities(variables.item.projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.planApprovalHistory(variables.item.projectId) });
      queryClient.invalidateQueries({ queryKey: approvalKeys.all() });
      queryClient.invalidateQueries({ queryKey: approvalKeys.stats() });
      queryClient.invalidateQueries({ queryKey: projectKeys.all() });
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(variables.item.projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.milestones(variables.item.projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.progress(variables.item.projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.planApproval(variables.item.projectId) });
      if (variables.item.milestoneId) {
        queryClient.invalidateQueries({ queryKey: milestoneKeys.workflowState(variables.item.milestoneId) });
        queryClient.invalidateQueries({ queryKey: milestoneKeys.deadlineStatus(variables.item.milestoneId) });
      }
      queryClient.invalidateQueries({ queryKey: assignmentKeys.myAssignedMilestones() });
      if (variables.item.category === "PROJECT_PLAN" && variables.action === "APPROVE" && variables.picId) {
        queryClient.invalidateQueries({ queryKey: ["documents"] });
        queryClient.invalidateQueries({ queryKey: ["document"] });
        queryClient.invalidateQueries({ queryKey: ["output-documents", "repository"] });
        queryClient.invalidateQueries({ queryKey: ["global-search"] });
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
