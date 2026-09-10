import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { projectKeys } from "@/lib/query-keys";

export type ProjectIntakeAttachment = {
  id: string;
  project_id: string;
  kind: "MOM" | "PHOTO" | "DOCUMENT";
  file_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};

type ProjectIntakeDownload = {
  attachment_id: string;
  file_name: string;
  url: string;
  expires_in_seconds: number;
};

export function useProjectIntake(projectId: string) {
  return useQuery<ProjectIntakeAttachment[]>({
    queryKey: projectKeys.intake(projectId),
    queryFn: () => apiClient<ProjectIntakeAttachment[]>(`/projects/${projectId}/intake-attachments`),
    enabled: Boolean(projectId),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

export function useProjectIntakeDownloadUrl(projectId: string) {
  return useMutation({
    mutationFn: (attachmentId: string) =>
      apiClient<ProjectIntakeDownload>(
        `/projects/${projectId}/intake-attachments/${attachmentId}/download-url`
      ),
  });
}
