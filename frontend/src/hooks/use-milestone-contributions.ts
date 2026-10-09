import { useRef } from 'react';
import { createArtifactRequests } from '@/lib/artifact-request';
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { milestoneKeys, projectKeys } from "@/lib/query-keys";
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
  const request = useRef(createArtifactRequests()).current;

  return useMutation({
    mutationFn: async ({ note, files }: { note?: string; files: File[] }) => {
      const formData = new FormData();
      const normalizedNote = note?.trim();
      if (normalizedNote) formData.append("note", normalizedNote);
      files.forEach((file) => formData.append("files", file));

      return request({ milestoneId, note: normalizedNote, files }, requestId => apiClient<MilestoneContribution>(`/milestones/${milestoneId}/contributions`, {
        headers: { "Idempotency-Key": requestId },
        method: "POST",
        body: formData,
      }));
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

export function usePromoteMilestoneContributionAttachment(projectId: string, milestoneId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ contributionId, attachmentId }: { contributionId: string; attachmentId: string }) =>
      apiClient<{
        attachment_id: string;
        promotion_status: "PROMOTED";
        promoted_document_id: string;
        idempotent: boolean;
      }>(`/milestones/${milestoneId}/contributions/${contributionId}/attachments/${attachmentId}/promote`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: milestoneKeys.contributions(milestoneId) });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: projectKeys.activities(projectId) });
    },
  });
}
