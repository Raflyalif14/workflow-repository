import { useRef } from 'react';
import { createArtifactRequests } from '@/lib/artifact-request';
import { requireRepositoryArray } from "@/lib/document-repository";
import { requireRepositorySession, useRepositorySession } from './use-repository-session';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, authorizedFetch } from "@/lib/api-client";
import { projectKeys } from "@/lib/query-keys";
import { DocumentItem, DocumentFilters, DocumentComment } from "@/types/document";

export function useDocuments(filters: DocumentFilters = {}) {
  const scope = useRepositorySession();
  const { projectId, milestoneId, category = "ALL", status = "ALL", search = "" } = filters;

  return useQuery<DocumentItem[]>({
    enabled: scope.enabled,
    queryKey: ["documents", { projectId, milestoneId, category, status, search }, ...scope.key],
    queryFn: async () => {
      requireRepositorySession(scope);
      const params = new URLSearchParams();
      if (projectId) params.append("projectId", projectId);
      if (milestoneId) params.append("milestoneId", milestoneId);
      if (category && category !== "ALL") params.append("category", category);
      if (status && status !== "ALL") params.append("status", status);
      if (search) params.append("search", search);

      return requireRepositoryArray(await apiClient<DocumentItem[]>(`/documents?${params.toString()}`));
    },
  });
}

export function useDocument(id: string) {
  const scope = useRepositorySession();
  return useQuery<DocumentItem>({
    queryKey: ["document", id, ...scope.key],
    queryFn: async () => { requireRepositorySession(scope); return apiClient<DocumentItem>(`/documents/${id}`); },
    enabled: !!id && scope.enabled,
  });
}

type SalesMilestoneDocumentUploadResult = {
  milestone_id: string;
  documents: Array<{
    id: string;
    file_name: string;
    title: string;
    category: "OTHER";
  }>;
};

export function useUploadSalesMilestoneDocuments(projectId: string, milestoneId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (files: File[]) => {
      const formData = new FormData();
      files.forEach((file) => formData.append("files", file));

      return apiClient<SalesMilestoneDocumentUploadResult>(
        `/milestones/${milestoneId}/documents`,
        {
          method: "POST",
          body: formData,
        }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", { projectId }] });
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.activities(projectId) });
    },
  });
}

export function useUploadNewVersion() {
  const queryClient = useQueryClient();
  const request = useRef(createArtifactRequests()).current;

  return useMutation({
    mutationFn: async ({
      documentId,
      formData,
    }: {
      documentId: string;
      formData: FormData;
    }) => {
      return request({ documentId, formData }, async requestId => {
      const response = await authorizedFetch(`/documents/${documentId}/versions`, {
        headers: { "Idempotency-Key": requestId },
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Failed to upload new version");
      }
      return data.data;
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["document", variables.documentId] });
    },
  });
}

export function useDocumentDownloadUrl() {
  return useMutation({
    mutationFn: async (versionId: string) =>
      apiClient<{ url: string; expires_in_seconds: number }>(
        `/documents/versions/${versionId}/download-url`
      ),
  });
}

export function useAddComment() {
  const queryClient = useQueryClient();
  const request = useRef(createArtifactRequests()).current;

  return useMutation({
    mutationFn: async ({
      documentId,
      content,
    }: {
      documentId: string;
      content: string;
    }) => {
      return request({ documentId, content }, requestId => apiClient<DocumentComment>(`/documents/${documentId}/comments`, {
        headers: { "Idempotency-Key": requestId },
        method: "POST",
        body: JSON.stringify({ content }),
      }));
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["document", variables.documentId] });
    },
  });
}
