import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { approvalKeys, assignmentKeys, dashboardKeys, projectKeys } from "@/lib/query-keys";
import {
  Project,
  ProjectMilestonePhase4,
  ProjectPlanApproval,
  ProjectsResponse,
  ProjectFilters,
  Scenario,
  UserSummary,
} from "@/types/project";

export interface SolutionArchitectOption {
  id: string;
  full_name: string;
  email: string;
  role: "SA";
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
    mutationFn: (data: { name: string; customer?: string; clientName?: string; scenario_id?: string; scenarioId?: string }) =>
      apiClient<Project>("/projects", {
        method: "POST",
        body: JSON.stringify({
          name: data.name,
          customer: data.customer || data.clientName,
          scenario_id: data.scenario_id || data.scenarioId,
        }),
      }),
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
    onSuccess: () => invalidateProjectRuntime(queryClient, projectId),
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
    mutationFn: ({ targetProjectId, decision, note }: { targetProjectId?: string; decision: "APPROVE" | "REJECT"; note?: string }) => {
      const resolvedProjectId = targetProjectId || projectId;
      if (!resolvedProjectId) throw new Error("Project ID is required.");
      return apiClient(`/projects/${resolvedProjectId}/plan/${decision === "APPROVE" ? "approve" : "reject"}`, {
        method: "POST",
        body: JSON.stringify(note?.trim() ? { note: note.trim() } : {}),
      });
    },
    onSuccess: (_, variables) => {
      const resolvedProjectId = variables.targetProjectId || projectId;
      if (resolvedProjectId) invalidateProjectRuntime(queryClient, resolvedProjectId);
    },
  });
}

export function useSolutionArchitects() {
  return useQuery<SolutionArchitectOption[]>({
    queryKey: assignmentKeys.solutionArchitects(),
    queryFn: () => apiClient<SolutionArchitectOption[]>("/users/solution-architects"),
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
