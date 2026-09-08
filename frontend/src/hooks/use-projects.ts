import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { approvalKeys, assignmentKeys, dashboardKeys, milestoneKeys, projectKeys } from "@/lib/query-keys";
import {
  Project,
  ProjectActivityPage,
  ProjectMilestonePhase4,
  ProjectPlanApproval,
  ProjectsResponse,
  ProjectFilters,
  Scenario,
  UserSummary,
  ProjectDeletionPreview,
  ProjectDeletionResult,
} from "@/types/project";

export interface SolutionArchitectOption {
  id: string;
  full_name: string;
  email: string;
  role: "SA" | "HEAD_SA";
}

export interface AssignmentHistoryItem {
  id: string;
  project_id: string;
  pic_id: string;
  previous_pic_id?: string | null;
  assigned_by_id: string;
  assignment_type: "INITIAL_ASSIGNMENT" | "REASSIGNMENT";
  reason?: string | null;
  created_at: string;
  pic: UserSummary | null;
  previous_pic: UserSummary | null;
  assigned_by: UserSummary | null;
}

export interface AssignedMilestone {
  id: string;
  project_id: string;
  name: string;
  step_order: number;
  status: string;
  pic_id: string;
  project?: {
    id: string;
    name: string;
    customer: string;
  } | null;
}

export type ProjectTimelineEntry = {
  milestoneId: string;
  startDate: string;
  durationWorkingDays: number;
};

const invalidateProjectRuntime = (queryClient: ReturnType<typeof useQueryClient>, projectId: string) => {
  queryClient.invalidateQueries({ queryKey: projectKeys.all() });
  queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
  queryClient.invalidateQueries({ queryKey: projectKeys.milestones(projectId) });
  queryClient.invalidateQueries({ queryKey: projectKeys.progress(projectId) });
  queryClient.invalidateQueries({ queryKey: projectKeys.planApproval(projectId) });
  queryClient.invalidateQueries({ queryKey: projectKeys.planApprovalHistory(projectId) });
  queryClient.invalidateQueries({ queryKey: projectKeys.activities(projectId) });
  queryClient.invalidateQueries({ queryKey: approvalKeys.all() });
  queryClient.invalidateQueries({ queryKey: approvalKeys.stats() });
  queryClient.invalidateQueries({ queryKey: dashboardKeys.overview() });
};

export function useProjects(filters: ProjectFilters = {}) {
  const { page = 1, limit = 10, search = "", status = "ALL", scenarioId, salesId } = filters;
  const queryFilters = { page, limit, search, status, scenarioId, salesId };

  return useQuery<ProjectsResponse>({
    queryKey: projectKeys.list(queryFilters),
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set("search", search);
      if (status !== "ALL") params.set("status", status);
      if (scenarioId) params.set("scenario_id", scenarioId);
      if (salesId) params.set("sales_id", salesId);
      return apiClient<ProjectsResponse>(`/projects?${params}`);
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

export function useProject(id: string) {
  return useQuery<Project>({
    queryKey: projectKeys.detail(id),
    queryFn: () => apiClient<Project>(`/projects/${id}`),
    enabled: Boolean(id),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

export function useScenarios() {
  return useQuery<Scenario[]>({
    queryKey: ["scenarios"],
    queryFn: () => apiClient<Scenario[]>("/scenarios"),
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      name: string;
      customer?: string;
      clientName?: string;
      scenario_id?: string;
      scenarioId?: string;
      mom?: File;
      documents?: File[];
    }) => {
      if (!data.mom) throw new Error("A MoM file is required to create a project.");

      const formData = new FormData();
      formData.append("name", data.name);
      formData.append("customer", data.customer || data.clientName || "");
      formData.append("scenario_id", data.scenario_id || data.scenarioId || "");
      formData.append("mom", data.mom);
      for (const file of data.documents || []) formData.append("documents", file);

      return apiClient<Project>("/projects", { method: "POST", body: formData });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectKeys.all() }),
  });
}

export function useUpdateProject(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { name?: string; customer?: string; scenario_id?: string }) =>
      apiClient<Project>(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.all() });
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(id) });
    },
  });
}

export function usePostponeProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, reason }: { projectId: string; reason: string }) =>
      apiClient<Project>(`/projects/${projectId}/postpone`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    onSuccess: (_, variables) => invalidateProjectRuntime(queryClient, variables.projectId),
  });
}

export function useResumeProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (projectId: string) => apiClient<Project>(`/projects/${projectId}/resume`, { method: "POST" }),
    onSuccess: (_, projectId) => invalidateProjectRuntime(queryClient, projectId),
  });
}

export function useProjectPlanApproval(projectId: string) {
  return useQuery<ProjectPlanApproval | null>({
    queryKey: projectKeys.planApproval(projectId),
    queryFn: () => apiClient<ProjectPlanApproval | null>(`/projects/${projectId}/plan-approval`),
    enabled: Boolean(projectId),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

export function useProjectPlanApprovalHistory(projectId: string) {
  return useQuery<ProjectPlanApproval[]>({
    queryKey: projectKeys.planApprovalHistory(projectId),
    queryFn: () => apiClient<ProjectPlanApproval[]>(`/projects/${projectId}/plan-approval-history`),
    enabled: Boolean(projectId),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

export function useSaveProjectTimeline(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (milestones: ProjectTimelineEntry[]) =>
      apiClient(`/projects/${projectId}/timeline`, {
        method: "PUT",
        body: JSON.stringify({ milestones }),
      }),
    onSuccess: (_, milestones) => {
      invalidateProjectRuntime(queryClient, projectId);
      milestones.forEach((milestone) => {
        queryClient.invalidateQueries({ queryKey: milestoneKeys.deadlineStatus(milestone.milestoneId) });
      });
    },
  });
}

export function useSubmitProjectPlan(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (requestNote?: string) =>
      apiClient(`/projects/${projectId}/plan/submit`, {
        method: "POST",
        body: JSON.stringify(requestNote?.trim() ? { request_note: requestNote.trim() } : {}),
      }),
    onSuccess: () => invalidateProjectRuntime(queryClient, projectId),
  });
}

export function useReviewProjectPlan(projectId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ targetProjectId, decision, note, picId }: { targetProjectId?: string; decision: "APPROVE" | "REJECT"; note?: string; picId?: string }) => {
      const resolvedProjectId = targetProjectId || projectId;
      if (!resolvedProjectId) throw new Error("Project ID is required.");
      const body: { note?: string; pic_id?: string } = {};
      if (note?.trim()) body.note = note.trim();
      if (decision === "APPROVE" && picId) body.pic_id = picId;
      return apiClient(`/projects/${resolvedProjectId}/plan/${decision === "APPROVE" ? "approve" : "reject"}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: (_, variables) => {
      const resolvedProjectId = variables.targetProjectId || projectId;
      if (resolvedProjectId) {
        invalidateProjectRuntime(queryClient, resolvedProjectId);
        if (variables.decision === "APPROVE" && variables.picId) {
          queryClient.invalidateQueries({ queryKey: projectKeys.assignmentHistory(resolvedProjectId) });
          queryClient.invalidateQueries({ queryKey: assignmentKeys.myAssignedMilestones() });
          queryClient.invalidateQueries({ queryKey: assignmentKeys.myAssignedProjects() });
        }
      }
    },
  });
}

export function useProjectActivities(projectId: string) {
  return useInfiniteQuery({
    queryKey: projectKeys.activities(projectId),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: "25" });
      if (pageParam) params.set("cursor", pageParam);
      return apiClient<ProjectActivityPage>(`/projects/${projectId}/activities?${params.toString()}`);
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
    enabled: Boolean(projectId),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

export function useProjectDeletionPreview(projectId: string, enabled = true) {
  return useQuery<ProjectDeletionPreview>({
    queryKey: ["project-deletion-preview", projectId],
    queryFn: () => apiClient<ProjectDeletionPreview>(`/projects/${projectId}/deletion-preview`),
    enabled: Boolean(projectId) && enabled,
    staleTime: 0,
  });
}

export function useDeleteProject(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (confirmation: string) =>
      apiClient<ProjectDeletionResult>(`/projects/${projectId}`, { method: "DELETE", body: JSON.stringify({ confirmation }) }),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: projectKeys.detail(projectId) });
      queryClient.removeQueries({ queryKey: projectKeys.milestones(projectId) });
      queryClient.removeQueries({ queryKey: projectKeys.progress(projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.all() });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: approvalKeys.all() });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.overview() });
    },
  });
}

export function useSolutionArchitects(enabled = true) {
  return useQuery<SolutionArchitectOption[]>({
    queryKey: assignmentKeys.solutionArchitects(),
    queryFn: () => apiClient<SolutionArchitectOption[]>("/users/solution-architects"),
    enabled,
  });
}

export function useAssignPic(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { pic_id: string; reason?: string }) =>
      apiClient(`/projects/${projectId}/assign-pic`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      invalidateProjectRuntime(queryClient, projectId);
      queryClient.invalidateQueries({ queryKey: projectKeys.assignmentHistory(projectId) });
      queryClient.invalidateQueries({ queryKey: assignmentKeys.myAssignedMilestones() });
      queryClient.invalidateQueries({ queryKey: assignmentKeys.myAssignedProjects() });
    },
  });
}

export function useAssignmentHistory(projectId: string) {
  return useQuery<AssignmentHistoryItem[]>({
    queryKey: projectKeys.assignmentHistory(projectId),
    queryFn: () => apiClient(`/projects/${projectId}/assignments`),
    enabled: Boolean(projectId),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

export function useProjectMilestones(projectId: string) {
  return useQuery<ProjectMilestonePhase4[]>({
    queryKey: projectKeys.milestones(projectId),
    queryFn: () => apiClient<ProjectMilestonePhase4[]>(`/projects/${projectId}/milestones`),
    enabled: Boolean(projectId),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

export function useProjectProgress(projectId: string) {
  return useQuery<{ completed: number; total: number; percentage: number }>({
    queryKey: projectKeys.progress(projectId),
    queryFn: () => apiClient<{ completed: number; total: number; percentage: number }>(`/projects/${projectId}/progress`),
    enabled: Boolean(projectId),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

export function useMyAssignedProjects(enabled = true) {
  return useQuery<Project[]>({
    queryKey: assignmentKeys.myAssignedProjects(),
    queryFn: () => apiClient<Project[]>("/me/assigned-projects"),
    enabled,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

export function useMyAssignedMilestones(enabled = true) {
  return useQuery<AssignedMilestone[]>({
    queryKey: assignmentKeys.myAssignedMilestones(),
    queryFn: () => apiClient<AssignedMilestone[]>("/me/assigned-milestones"),
    enabled,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}
