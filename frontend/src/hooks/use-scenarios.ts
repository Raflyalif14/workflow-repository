import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Scenario, WorkflowResponse, WorkflowStage } from "@/types/scenario";

export function useScenarios() { return useQuery<Scenario[]>({ queryKey: ["scenarios"], queryFn: () => apiClient<Scenario[]>("/scenarios") }); }
export function useWorkflow(scenarioId: string) { return useQuery<WorkflowResponse>({ queryKey: ["scenario-workflow", scenarioId], queryFn: () => apiClient<WorkflowResponse>(`/scenarios/${scenarioId}/workflow`), enabled: Boolean(scenarioId) }); }
function mutation<T>(endpoint: string, method: string) { const queryClient = useQueryClient(); return useMutation({ mutationFn: (body: T) => apiClient<unknown>(endpoint, { method, body: JSON.stringify(body) }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["scenarios"] }); queryClient.invalidateQueries({ queryKey: ["scenario-workflow"] }); } }); }
export const useCreateScenario = () => mutation<{ name: string; description?: string }>("/scenarios", "POST");
export function useUpdateScenario(id: string) { return mutation<{ name?: string; description?: string | null }>(`/scenarios/${id}`, "PATCH"); }
export function useUpdateScenarioStatus(id: string) { return mutation<{ is_active: boolean }>(`/scenarios/${id}/status`, "PATCH"); }
export function useCreateStage(scenarioId: string) { return mutation<Partial<WorkflowStage>>(`/scenarios/${scenarioId}/workflow/stages`, "POST"); }
export function useUpdateStage(id: string) { return mutation<Partial<WorkflowStage>>(`/workflow-stages/${id}`, "PATCH"); }
export function useDeleteStage(id: string) { return mutation<Record<string, never>>(`/workflow-stages/${id}`, "DELETE"); }
export function useReorderStages(scenarioId: string) { return mutation<{ stages: { id: string; step_order: number }[] }>(`/scenarios/${scenarioId}/workflow/reorder`, "PATCH"); }