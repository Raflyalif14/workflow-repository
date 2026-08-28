import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { assignmentKeys, projectKeys } from "@/lib/query-keys";

export interface SolutionArchitect {
  id: string;
  fullName?: string;
  full_name?: string;
  email: string;
  username?: string;
  role: string;
  phoneNumber?: string;
  phone_number?: string;
  _count?: {
    assignedMilestones?: number;
  };
}

export interface AssignmentHistoryItem {
  id: string;
  projectId: string;
  milestoneId?: string;
  previousPic?: {
    id: string;
    fullName: string;
    username: string;
    role: string;
  } | null;
  newPic: {
    id: string;
    fullName: string;
    username: string;
    role: string;
  };
  assignedBy: {
    id: string;
    fullName: string;
    username: string;
    role: string;
  };
  reason?: string | null;
  assignedToFuture: boolean;
  createdAt: string;
  milestone?: {
    id: string;
    name: string;
    orderIndex: number;
  } | null;
}

export function useEligibleSAs() {
  return useQuery<SolutionArchitect[]>({
    queryKey: assignmentKeys.eligibleSas(),
    queryFn: async () => apiClient<SolutionArchitect[]>("/users/solution-architects"),
  });
}

export function useAssignmentHistory(projectId: string) {
  return useQuery<AssignmentHistoryItem[]>({
    queryKey: projectKeys.assignmentHistory(projectId),
    queryFn: async () =>
      apiClient<AssignmentHistoryItem[]>(`/projects/${projectId}/assignments`),
    enabled: !!projectId,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

export function useAssignPic() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      data,
    }: {
      projectId: string;
      data: {
        newPicId: string;
        milestoneId?: string;
        assignToAllFuture?: boolean;
        reason?: string;
      };
    }) => {
      return apiClient<AssignmentHistoryItem>(`/projects/${projectId}/assign-pic`, {
        method: "POST",
        body: JSON.stringify({
          pic_id: data.newPicId,
          reason: data.reason,
        }),
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(variables.projectId) });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: projectKeys.milestones(variables.projectId) });
      queryClient.invalidateQueries({
        queryKey: projectKeys.assignmentHistory(variables.projectId),
      });
    },
  });
}
