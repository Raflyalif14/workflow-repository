import { useRef } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { getAuthSession } from "@/lib/auth";
import { createProjectCreateRequest, type ProjectCreateInput } from "@/lib/project-create-request";
import { useBusinessRequest } from "./use-business-request";
import { outputDocumentKeys } from "./use-output-documents";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, ApiError } from "@/lib/api-client";
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
  start_date?: string | null;
  due_date?: string | null;
  outputs?: { status: string; is_required: boolean; is_selected: boolean }[];
  project?: {
    id: string;
    name: string;
    customer: string;
    status?: string;
    is_postponed?: boolean;
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
  queryClient.invalidateQueries({ queryKey: ["documents"] });
  queryClient.invalidateQueries({ queryKey: ["document"] });
  queryClient.invalidateQueries({ queryKey: outputDocumentKeys.repository() });
  queryClient.invalidateQueries({ queryKey: ["global-search"] });
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

export function useProject(id: string, options: { includeActivity?: boolean } = {}) {
  const includeActivity = options.includeActivity !== false;
  return useQuery<Project>({
    queryKey: includeActivity ? projectKeys.detail(id) : projectKeys.detailWithoutActivity(id),
    queryFn: () => apiClient<Project>(`/projects/${id}${includeActivity ? '' : '?include_activity=false'}`),
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
  const { user } = useAuth();
  const session = getAuthSession()?.id;
  const state = useRef({ account:user?.id,session,request:createProjectCreateRequest() });
  if(state.current.account!==user?.id || state.current.session!==session)
    state.current={account:user?.id,session,request:createProjectCreateRequest()};
  const mutation = useMutation({
    mutationFn: (data:ProjectCreateInput) => {
      if (!user || user.role!=="SALES") return Promise.reject(new ApiError("Forbidden",403,"CREATE_ACCESS_INVALID"));
      return state.current.request.run(data,async(body,requestId)=>{
        const project=await apiClient<Project>("/projects",{
          method:"POST",body,headers:{"x-project-create-request-id":requestId},
        });
        if (!project || typeof project.id!=="string" || !project.id)
          throw new ApiError("Unable to confirm project creation.",503,"CREATE_RETRYABLE");
        return project;
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.all() });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.overview() });
    },
  });
  return Object.assign(mutation,{creationRequestId:state.current.request.requestId()});
}

export function useSetProjectOutcome(projectId: string) {
  const queryClient = useQueryClient();
  const business = useBusinessRequest();

  const mutation = useMutation({
    mutationFn: (data: { outcome: "WON" | "LOST"; finalContractValue?: number; lossReason?: string }) =>
      business<Project>(projectId, "OUTCOME", `/projects/${projectId}/outcome`, "POST", {
          outcome: data.outcome,
          ...(data.finalContractValue !== undefined ? { final_contract_value: data.finalContractValue } : {}),
          ...(data.lossReason?.trim() ? { loss_reason: data.lossReason.trim() } : {}),
      }),
    onSuccess: () => invalidateProjectRuntime(queryClient, projectId),
  });
  return Object.assign(mutation, { prepare: () => { if (projectId) business.prepare(projectId); } });
}

export function useUpdateProject(id: string) {
  const queryClient = useQueryClient();
  const business = useBusinessRequest();

  const mutation = useMutation({
    mutationFn: (data: { name?: string; customer?: string; scenario_id?: string; selectedDocumentKeys?: string[] }) =>
      business<Project>(id, "INFO", `/projects/${id}`, "PATCH", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.all() });
      invalidateProjectRuntime(queryClient, id);
      queryClient.invalidateQueries({ queryKey: outputDocumentKeys.project(id) });
    },
  });
  return Object.assign(mutation, { prepare: () => { if (id) business.prepare(id); } });
}


export function usePostponeProject() {
  const queryClient = useQueryClient();
  const business = useBusinessRequest();

  const mutation = useMutation({
    mutationFn: ({ projectId, reason }: { projectId: string; reason: string }) =>
      business<Project>(projectId, "POSTPONE", `/projects/${projectId}/postpone`, "POST", { reason }),
    onSuccess: (_, variables) => {
      invalidateProjectRuntime(queryClient, variables.projectId);
      queryClient.invalidateQueries({ queryKey: assignmentKeys.myAssignedMilestones() });
    },
  });
  return Object.assign(mutation, { prepare: (target: string) => { if (target) business.prepare(target); } });
}

export function useResumeProject() {
  const queryClient = useQueryClient();
  const business = useBusinessRequest();

  const mutation = useMutation({
    mutationFn: (projectId: string) => business<Project>(projectId, "RESUME", `/projects/${projectId}/resume`, "POST", {}),
    onSuccess: (_, projectId) => {
      invalidateProjectRuntime(queryClient, projectId);
      queryClient.invalidateQueries({ queryKey: assignmentKeys.myAssignedMilestones() });
    },
  });
  return Object.assign(mutation, { prepare: (target: string) => { if (target) business.prepare(target); } });
}

export function useRetryProjectCompletion(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiClient<{ retried: boolean; status: string; reason: string }>(
        `/projects/${projectId}/retry-completion`,
        { method: "POST" }
      ),
    onSuccess: () => {
      invalidateProjectRuntime(queryClient, projectId);
      queryClient.invalidateQueries({ queryKey: ["output-documents", projectId] });
    },
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
  const business = useBusinessRequest();

  const mutation = useMutation({
    mutationFn: (milestones: ProjectTimelineEntry[]) =>
      business(projectId, "TIMELINE", `/projects/${projectId}/timeline`, "PUT", { milestones }),
    onSuccess: (_, milestones) => {
      invalidateProjectRuntime(queryClient, projectId);
      milestones.forEach((milestone) => {
        queryClient.invalidateQueries({ queryKey: milestoneKeys.deadlineStatus(milestone.milestoneId) });
      });
    },
  });
  return Object.assign(mutation, { prepare: () => { if (projectId) business.prepare(projectId); } });
}

export function useSubmitProjectPlan(projectId: string) {
  const queryClient = useQueryClient();
  const business = useBusinessRequest();

  const mutation = useMutation({
    mutationFn: (requestNote?: string) =>
      business(projectId, "PLAN_SUBMIT", `/projects/${projectId}/plan/submit`, "POST", requestNote?.trim() ? { request_note: requestNote.trim() } : {}),
    onSuccess: () => invalidateProjectRuntime(queryClient, projectId),
  });
  return Object.assign(mutation, { prepare: () => { if (projectId) business.prepare(projectId); } });
}

export function useReviewProjectPlan(projectId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ targetProjectId, decision, note, picId, expectedApprovalId, expectedPicRevision, requestId }: { targetProjectId?: string; decision: "APPROVE" | "REJECT"; note?: string; picId?: string; expectedApprovalId?: string; expectedPicRevision?: string; requestId?: string }) => {
      const resolvedProjectId = targetProjectId || projectId;
      if (!resolvedProjectId) throw new Error("Project ID is required.");
      const body: { note?: string; pic_id?: string; expected_approval_id?: string; expected_pic_revision?: string; request_id?: string } = {};
      if (expectedPicRevision !== undefined) body.expected_pic_revision = expectedPicRevision;
      if (requestId) body.request_id = requestId;
      if (expectedApprovalId) body.expected_approval_id = expectedApprovalId;
      if (note?.trim()) body.note = note.trim();
      if (decision === "APPROVE" && picId) body.pic_id = picId;
      return apiClient(`/projects/${resolvedProjectId}/plan/${decision === "APPROVE" ? "approve" : "reject"}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onError: (_, variables) => { const target = variables.targetProjectId || projectId; if (target) invalidateProjectRuntime(queryClient, target); },
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
      queryClient.removeQueries({ queryKey: ["project-document-sharing", projectId] });
      queryClient.removeQueries({ queryKey: projectKeys.milestones(projectId) });
      queryClient.removeQueries({ queryKey: projectKeys.progress(projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.all() });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: outputDocumentKeys.repository() });
      queryClient.invalidateQueries({ queryKey: ["global-search"] });
      queryClient.invalidateQueries({ queryKey: approvalKeys.all() });
      queryClient.invalidateQueries({ queryKey: approvalKeys.stats() });
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
    mutationFn: (data: { pic_id: string; reason?: string; expected_pic_revision: string; request_id: string }) =>
      apiClient(`/projects/${projectId}/assign-pic`, { method: "POST", body: JSON.stringify(data) }),
    retry: false,
    onError: (error) => { if (error instanceof ApiError && error.code === "PIC_CONFLICT") invalidateProjectRuntime(queryClient, projectId); },
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

export function useContinueTenderPhase(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (selected_document_keys: string[]) => apiClient<{ phase_id: string; created: boolean }>(
      `/projects/${projectId}/phases/on-submission-tender`, { method: 'POST', body: JSON.stringify({ selected_document_keys }) }),
    onSuccess: () => { invalidateProjectRuntime(queryClient, projectId); queryClient.invalidateQueries({ queryKey: outputDocumentKeys.project(projectId) }); },
    onError: () => { invalidateProjectRuntime(queryClient, projectId); },
  });
}

export function useUpdateEstimatedValue(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { estimated_revenue: string; expected_updated_at: string; request_id: string }) =>
      apiClient<{ estimated_revenue: string; updated_at: string; changed: boolean; replayed: boolean }>(`/projects/${projectId}/estimated-value`, {
        method: 'PATCH', body: JSON.stringify(data),
      }),
    retry: false,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: projectKeys.all() }),
        queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) }),
        queryClient.invalidateQueries({ queryKey: projectKeys.activities(projectId) }),
        queryClient.invalidateQueries({ queryKey: dashboardKeys.overview() }),
      ]);
    },
  });
}

export function useClosePraTender(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient<{ phase_id: string; closed: boolean }>(
      `/projects/${projectId}/phases/pra-tender/close`, { method: 'POST', body: JSON.stringify({}) }),
    onSuccess: () => {
      invalidateProjectRuntime(queryClient, projectId);
      queryClient.invalidateQueries({ queryKey: outputDocumentKeys.project(projectId) });
    },
    // A concurrent Yes/No may have committed elsewhere; re-read rather than assume success.
    onError: () => { invalidateProjectRuntime(queryClient, projectId); },
  });
}
