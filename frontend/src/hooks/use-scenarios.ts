import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Scenario, WorkflowResponse, WorkflowStage } from "@/types/scenario";

export function useScenarios(options: { isActive?: boolean } = {}) {
  const query = options.isActive === undefined ? "/scenarios" : `/scenarios?is_active=${options.isActive}`;
  return useQuery<Scenario[]>({ queryKey: ["scenarios", options], queryFn: () => apiClient<Scenario[]>(query) });
}
export function useWorkflow(scenarioId: string) { return useQuery<WorkflowResponse>({ queryKey: ["scenario-workflow", scenarioId], queryFn: () => apiClient<WorkflowResponse>(`/scenarios/${scenarioId}/workflow`), enabled: Boolean(scenarioId) }); }
function useScenarioMutation<T>(endpoint: string, method: string) { const queryClient = useQueryClient(); return useMutation({ mutationFn: (body: T) => apiClient<unknown>(endpoint, { method, body: JSON.stringify(body) }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["scenarios"] }); queryClient.invalidateQueries({ queryKey: ["scenario-workflow"] }); } }); }
export const useCreateScenario = () => useScenarioMutation<{ name: string; description?: string }>("/scenarios", "POST");
export function useUpdateScenario(id: string) { return useScenarioMutation<{ name?: string; description?: string | null }>(`/scenarios/${id}`, "PATCH"); }
export function useUpdateScenarioStatus(id: string) { return useScenarioMutation<{ is_active: boolean }>(`/scenarios/${id}/status`, "PATCH"); }
export function useCreateStage(scenarioId: string) { return useScenarioMutation<Partial<WorkflowStage>>(`/scenarios/${scenarioId}/workflow/stages`, "POST"); }
export function useUpdateStage(id: string) { return useScenarioMutation<Partial<WorkflowStage>>(`/workflow-stages/${id}`, "PATCH"); }
export function useDeleteStage(id: string) { return useScenarioMutation<Record<string, never>>(`/workflow-stages/${id}`, "DELETE"); }
export function useReorderStages(scenarioId: string) { return useScenarioMutation<{ stages: { id: string; step_order: number }[] }>(`/scenarios/${scenarioId}/workflow/reorder`, "PATCH"); }
