import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, authorizedFetch } from "@/lib/api-client";
import { projectKeys } from "@/lib/query-keys";
import { DocumentItem, DocumentFilters, DocumentComment } from "@/types/document";

export function useDocuments(filters: DocumentFilters = {}) {
  const { projectId, milestoneId, category = "ALL", status = "ALL", search = "" } = filters;

  return useQuery<DocumentItem[]>({
    queryKey: ["documents", { projectId, milestoneId, category, status, search }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (projectId) params.append("projectId", projectId);
      if (milestoneId) params.append("milestoneId", milestoneId);
      if (category && category !== "ALL") params.append("category", category);
      if (status && status !== "ALL") params.append("status", status);
      if (search) params.append("search", search);

      return apiClient<DocumentItem[]>(`/documents?${params.toString()}`);
    },
  });
}

export function useDocument(id: string) {
  return useQuery<DocumentItem>({
    queryKey: ["document", id],
    queryFn: async () => apiClient<DocumentItem>(`/documents/${id}`),
    enabled: !!id,
  });
}

export function useUploadDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await authorizedFetch("/documents", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Failed to upload document");
      }
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
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
    },
  });
}

export function useUploadNewVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      documentId,
      formData,
    }: {
      documentId: string;
      formData: FormData;
    }) => {
      const response = await authorizedFetch(`/documents/${documentId}/versions`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Failed to upload new version");
      }
      return data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["document", variables.documentId] });
    },
  });
}

export function useReviewVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      versionId,
      status,
      feedback,
    }: {
      versionId: string;
      documentId: string;
      status: "APPROVED" | "REJECTED";
      feedback?: string;
    }) => {
      return apiClient<DocumentItem>(`/documents/versions/${versionId}/review`, {
        method: "POST",
        body: JSON.stringify({ status, feedback }),
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

  return useMutation({
    mutationFn: async ({
      documentId,
      content,
    }: {
      documentId: string;
      content: string;
    }) => {
      return apiClient<DocumentComment>(`/documents/${documentId}/comments`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["document", variables.documentId] });
    },
  });
}
