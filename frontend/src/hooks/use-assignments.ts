import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export interface SolutionArchitect {
  id: string;
  fullName: string;
  email: string;
  username: string;
  role: string;
  phoneNumber?: string;
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
    queryKey: ["eligible-sas"],
    queryFn: async () => apiClient<SolutionArchitect[]>("/assignments/eligible-sas"),
  });
}

export function useAssignmentHistory(projectId: string) {
  return useQuery<AssignmentHistoryItem[]>({
    queryKey: ["assignment-history", projectId],
    queryFn: async () =>
      apiClient<AssignmentHistoryItem[]>(`/assignments/projects/${projectId}/history`),
    enabled: !!projectId,
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
      return apiClient<AssignmentHistoryItem>(
        `/assignments/projects/${projectId}/assign`,
        {
          method: "POST",
          body: JSON.stringify(data),
        }
      );
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["project", variables.projectId] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({
        queryKey: ["assignment-history", variables.projectId],
      });
    },
  });
}
