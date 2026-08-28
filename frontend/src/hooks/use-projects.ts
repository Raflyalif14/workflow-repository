import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { assignmentKeys, projectKeys } from "@/lib/query-keys";
import { Project, ProjectsResponse, ProjectFilters, Scenario, ProjectMilestonePhase4, UserSummary } from "@/types/project";

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

export function useProjects(filters: ProjectFilters = {}) {
  const { page = 1, limit = 10, search = "", status = "ALL", scenarioId, salesId } = filters;
  const queryFilters = { page, limit, search, status, scenarioId, salesId };
  return useQuery<ProjectsResponse>({ queryKey: projectKeys.list(queryFilters), queryFn: () => { const params = new URLSearchParams({ page: String(page), limit: String(limit) }); if (search) params.set("search", search); if (status !== "ALL") params.set("status", status); if (scenarioId) params.set("scenario_id", scenarioId); if (salesId) params.set("sales_id", salesId); return apiClient<ProjectsResponse>(`/projects?${params}`); }, staleTime: 0, refetchOnWindowFocus: true });
}
export function useProject(id: string) { return useQuery<Project>({ queryKey: projectKeys.detail(id), queryFn: () => apiClient<Project>(`/projects/${id}`), enabled: Boolean(id), staleTime: 0, refetchOnWindowFocus: true }); }
export function useScenarios() { return useQuery<Scenario[]>({ queryKey: ["scenarios"], queryFn: () => apiClient<Scenario[]>("/scenarios") }); }
export function useCreateProject() { const queryClient = useQueryClient(); return useMutation({ mutationFn: (data: any) => apiClient<Project>("/projects", { method: "POST", body: JSON.stringify({ name: data.name, customer: data.customer || data.clientName, scenario_id: data.scenario_id || data.scenarioId }) }), onSuccess: () => queryClient.invalidateQueries({ queryKey: projectKeys.all() }) }); }
export function useUpdateProject(id: string) { const queryClient = useQueryClient(); return useMutation({ mutationFn: (data: { name?: string; customer?: string; scenario_id?: string }) => apiClient<Project>(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(data) }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: projectKeys.all() }); queryClient.invalidateQueries({ queryKey: projectKeys.detail(id) }); } }); }
export function usePostponeProject() { const queryClient = useQueryClient(); return useMutation({ mutationFn: ({ projectId, data }: { projectId: string; data: { reason: string; newTargetEndDate?: string } }) => apiClient<Project>(`/projects/${projectId}/postpone`, { method: "POST", body: JSON.stringify({ reason: data.reason }) }), onSuccess: (_, variables) => { queryClient.invalidateQueries({ queryKey: projectKeys.all() }); queryClient.invalidateQueries({ queryKey: projectKeys.detail(variables.projectId) }); } }); }
export function useResumeProject() { const queryClient = useQueryClient(); return useMutation({ mutationFn: (projectId: string) => apiClient<Project>(`/projects/${projectId}/resume`, { method: "POST" }), onSuccess: (_, projectId) => { queryClient.invalidateQueries({ queryKey: projectKeys.all() }); queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) }); } }); }
export function useSolutionArchitects() { return useQuery<SolutionArchitectOption[]>({ queryKey: assignmentKeys.solutionArchitects(), queryFn: () => apiClient("/users/solution-architects") }); }
export function useAssignPic(projectId: string) { const queryClient = useQueryClient(); return useMutation({ mutationFn: (data: { pic_id: string; reason?: string }) => apiClient(`/projects/${projectId}/assign-pic`, { method: "POST", body: JSON.stringify(data) }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) }); queryClient.invalidateQueries({ queryKey: projectKeys.milestones(projectId) }); queryClient.invalidateQueries({ queryKey: projectKeys.assignmentHistory(projectId) }); } }); }
export function useAssignmentHistory(projectId: string) { return useQuery<AssignmentHistoryItem[]>({ queryKey: projectKeys.assignmentHistory(projectId), queryFn: () => apiClient(`/projects/${projectId}/assignments`), enabled: Boolean(projectId), staleTime: 0, refetchOnWindowFocus: true }); }
export function useProjectMilestones(projectId: string) { return useQuery<ProjectMilestonePhase4[]>({ queryKey: projectKeys.milestones(projectId), queryFn: () => apiClient<ProjectMilestonePhase4[]>(`/projects/${projectId}/milestones`), enabled: Boolean(projectId), staleTime: 0, refetchOnWindowFocus: true }); }
export function useProjectProgress(projectId: string) { return useQuery<{ completed: number; total: number; percentage: number }>({ queryKey: projectKeys.progress(projectId), queryFn: () => apiClient<{ completed: number; total: number; percentage: number }>(`/projects/${projectId}/progress`), enabled: Boolean(projectId), staleTime: 0, refetchOnWindowFocus: true }); }
export function useMyAssignedProjects(enabled = true) { return useQuery<Project[]>({ queryKey: assignmentKeys.myAssignedProjects(), queryFn: () => apiClient<Project[]>("/me/assigned-projects"), enabled, staleTime: 0, refetchOnWindowFocus: true }); }
export function useMyAssignedMilestones(enabled = true) { return useQuery<AssignedMilestone[]>({ queryKey: assignmentKeys.myAssignedMilestones(), queryFn: () => apiClient<AssignedMilestone[]>("/me/assigned-milestones"), enabled, staleTime: 0, refetchOnWindowFocus: true }); }
