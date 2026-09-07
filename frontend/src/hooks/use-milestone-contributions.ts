import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { milestoneKeys } from "@/lib/query-keys";
import {
  MilestoneContribution,
  MilestoneContributionAttachmentDownload,
} from "@/types/project";

export function useMilestoneContributions(milestoneId: string, enabled: boolean) {
  return useQuery<MilestoneContribution[]>({
    queryKey: milestoneKeys.contributions(milestoneId),
    queryFn: () => apiClient<MilestoneContribution[]>(`/milestones/${milestoneId}/contributions`),
    enabled: Boolean(milestoneId) && enabled,
  });
}

export function useCreateMilestoneContribution(milestoneId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ note, files }: { note?: string; files: File[] }) => {
      const formData = new FormData();
      const normalizedNote = note?.trim();
      if (normalizedNote) formData.append("note", normalizedNote);
      files.forEach((file) => formData.append("files", file));

      return apiClient<MilestoneContribution>(`/milestones/${milestoneId}/contributions`, {
        method: "POST",
        body: formData,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: milestoneKeys.contributions(milestoneId) });
    },
  });
}

export function useDownloadMilestoneContributionAttachment(milestoneId: string) {
  return useMutation({
    mutationFn: ({ contributionId, attachmentId }: { contributionId: string; attachmentId: string }) =>
      apiClient<MilestoneContributionAttachmentDownload>(
        `/milestones/${milestoneId}/contributions/${contributionId}/attachments/${attachmentId}/download-url`
      ),
  });
}
