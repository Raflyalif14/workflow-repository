import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Workflow } from "@/types/workflow";

export function useWorkflows(repositoryId?: string, search?: string) {
  return useQuery<Workflow[]>({
    queryKey: ["workflows", { repositoryId, search }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (repositoryId) params.append("repositoryId", repositoryId);
      if (search) params.append("search", search);

      return apiClient<Workflow[]>(`/workflows?${params.toString()}`);
    },
  });
}

export function useWorkflow(id: string) {
  return useQuery<Workflow>({
    queryKey: ["workflow", id],
    queryFn: async () => apiClient<Workflow>(`/workflows/${id}`),
    enabled: !!id,
  });
}

export function useCreateWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (newWorkflow: any) => {
      return apiClient<Workflow>("/workflows", {
        method: "POST",
        body: JSON.stringify(newWorkflow),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
    },
  });
}
