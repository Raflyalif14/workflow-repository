import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { ProjectOutputDocumentItem, ProjectOutputDocumentVersion } from "@/types/project";
import { projectKeys } from "@/lib/query-keys";

export interface OutputDocumentsResponse {
  scenarioKey: string;
  isScopeLocked: boolean;
  canSubmit: boolean;
  canRetryCompletion: boolean;
  missingMandatoryCount: number;
  missingMandatoryNames: string[];
  unapprovedCount: number;
  documents: ProjectOutputDocumentItem[];
}

export const outputDocumentKeys = {
  all: ["output-documents"] as const,
  repository: () => [...outputDocumentKeys.all, "repository"] as const,
  project: (projectId: string) => [...outputDocumentKeys.all, projectId] as const,
  versions: (projectId: string, documentKey: string) => [...outputDocumentKeys.project(projectId), documentKey, "versions"] as const,
};

export interface OutputRepositoryItem {
  projectId: string;
  projectName: string;
  customer: string;
  documentKey: string;
  name: string;
  group: "PRA_TENDER" | "ON_SUBMISSION_TENDER";
  status: ProjectOutputDocumentItem["status"];
  fileName: string;
  versionNumber: number;
}

export function useOutputRepository(enabled = true) {
  return useQuery<OutputRepositoryItem[]>({
    queryKey: outputDocumentKeys.repository(),
    queryFn: () => apiClient<OutputRepositoryItem[]>("/documents/outputs"),
    enabled,
  });
}

export function useOutputRepositoryDownload() {
  return useMutation({
    mutationFn: ({ projectId, documentKey }: { projectId: string; documentKey: string }) =>
      apiClient<{ fileName: string; url: string; expiresInSeconds: number }>(
        `/projects/${projectId}/output-documents/${documentKey}/download`
      ),
  });
}

export interface OutputDocumentBatchItem {
  document_key: string;
  expected_version_id: string;
}

export interface OutputDocumentBatchResult {
  documentKey: string;
  success: boolean;
  status?: ProjectOutputDocumentItem["status"];
  message?: string;
}

export interface OutputDocumentBatchResponse {
  success: boolean;
  results: OutputDocumentBatchResult[];
  completionRetryRequired?: boolean;
}

export function useOutputDocuments(projectId?: string) {
  return useQuery<OutputDocumentsResponse>({
    queryKey: outputDocumentKeys.project(projectId || ""),
    queryFn: () => apiClient<OutputDocumentsResponse>(`/projects/${projectId}/output-documents`),
    enabled: Boolean(projectId),
    refetchOnWindowFocus: true,
  });
}

export function useUploadOutputDocument(projectId: string, documentKey: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return apiClient<unknown>(`/projects/${projectId}/output-documents/${documentKey}/upload`, {
        method: "POST",
        body: formData,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: outputDocumentKeys.project(projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
    },
  });
}

export function useSubmitOutputDocuments(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { items: OutputDocumentBatchItem[]; note?: string }) =>
      apiClient<OutputDocumentBatchResponse>(`/projects/${projectId}/output-documents/submit`, {
        method: "POST",
        body: JSON.stringify(data || {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: outputDocumentKeys.project(projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
    },
  });
}

export function useReviewOutputDocuments(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { decision: "APPROVE" | "REVISE" | "REJECT"; feedback?: string; items: OutputDocumentBatchItem[] }) =>
      apiClient<OutputDocumentBatchResponse>(`/projects/${projectId}/output-documents/review`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: outputDocumentKeys.project(projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
    },
  });
}

export function useUpdateOutputChecklist(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (selectedDocumentKeys: string[]) =>
      apiClient<{ success: boolean; selectedDocumentKeys: string[] }>(
        `/projects/${projectId}/output-documents/checklist`,
        {
          method: "PUT",
          body: JSON.stringify({ selectedDocumentKeys }),
        }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: outputDocumentKeys.project(projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
    },
  });
}

export function useOutputDocumentDownloadUrl(projectId: string) {
  return useMutation({
    mutationFn: (documentKey: string) =>
      apiClient<{ fileName: string; url: string; expiresInSeconds: number }>(
        `/projects/${projectId}/output-documents/${documentKey}/download`
      ),
  });
}

export function useOutputDocumentVersions(projectId: string, documentKey?: string) {
  return useQuery<{ documentKey: string; versions: ProjectOutputDocumentVersion[] }>({
    queryKey: outputDocumentKeys.versions(projectId, documentKey || ""),
    queryFn: () => apiClient(`/projects/${projectId}/output-documents/${documentKey}/versions`),
    enabled: Boolean(projectId && documentKey),
  });
}

export function useOutputDocumentVersionDownloadUrl(projectId: string, documentKey: string) {
  return useMutation({
    mutationFn: (versionId: string) =>
      apiClient<{ fileName: string; url: string; expiresInSeconds: number }>(
        `/projects/${projectId}/output-documents/${documentKey}/versions/${versionId}/download`
      ),
  });
}
