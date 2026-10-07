import { requireRepositoryArray } from "@/lib/document-repository";
import { useBusinessRequest } from "./use-business-request";
import { requireRepositorySession, useRepositorySession } from './use-repository-session';
import type { DocumentAccessMetadata } from './use-document-access';
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { ProjectOutputDocumentFile, ProjectOutputDocumentItem, ProjectOutputDocumentVersion } from "@/types/project";
import { approvalKeys, assignmentKeys, dashboardKeys, projectKeys } from "@/lib/query-keys";

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

export interface OutputRepositoryItem extends DocumentAccessMetadata {
  outputId?: string;
  projectId: string;
  milestoneId: string;
  projectName: string;
  customer: string;
  documentKey: string;
  name: string;
  group: "PRA_TENDER" | "ON_SUBMISSION_TENDER";
  status: ProjectOutputDocumentItem["status"];
  fileName: string;
  versionNumber: number;
  updatedAt?: string;
  files: ProjectOutputDocumentFile[];
  approvedVersionId: string;
}

export function useOutputRepository(enabled = true) {
  const scope = useRepositorySession();
  return useQuery<OutputRepositoryItem[]>({
    queryKey: [...outputDocumentKeys.repository(), ...scope.key],
    queryFn: async () => { requireRepositorySession(scope); return requireRepositoryArray(await apiClient<OutputRepositoryItem[]>("/documents/outputs")); },
    enabled: enabled && scope.enabled,
  });
}

export function useOutputRepositoryDownload() {
  return useMutation({
    mutationFn: ({ projectId, documentKey, fileId, versionId }: { projectId: string; documentKey: string; fileId: string; versionId: string }) =>
      apiClient<{ fileName: string; url: string; expiresInSeconds: number }>(
        `/projects/${projectId}/output-documents/${documentKey}/files/${fileId}/download?version_id=${versionId}`
      ),
  });
}

export interface OutputDocumentBatchItem {
  document_key: string;
  expected_version_id: string;
  request_id: string;
  file_revisions?: { file_id: string; feedback: string }[];
}

export interface OutputDocumentSubmitItem {
  document_key: string;
  expected_draft_revision: number;
  request_id: string;
}

export interface OutputDraftUpload {
  file: File;
  expected_draft_revision: number;
  request_id: string;
  replace_file_id?: string;
}

export interface OutputDraftReceipt {
  documentKey: string;
  draftRevision: number;
  fileId: string;
  status: ProjectOutputDocumentItem["status"];
}

function invalidateOutputDocument(queryClient: ReturnType<typeof useQueryClient>, projectId: string, approvalQueueChanged = false) {
  if (approvalQueueChanged) {
    queryClient.invalidateQueries({ queryKey: approvalKeys.all() });
    queryClient.invalidateQueries({ queryKey: ["global-search"] });
  }
  queryClient.invalidateQueries({ queryKey: outputDocumentKeys.project(projectId) });
  queryClient.invalidateQueries({ queryKey: outputDocumentKeys.repository() });
  queryClient.invalidateQueries({ queryKey: projectKeys.all() });
  queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
  queryClient.invalidateQueries({ queryKey: projectKeys.milestones(projectId) });
  queryClient.invalidateQueries({ queryKey: projectKeys.progress(projectId) });
  queryClient.invalidateQueries({ queryKey: projectKeys.activities(projectId) });
  queryClient.invalidateQueries({ queryKey: dashboardKeys.overview() });
  queryClient.invalidateQueries({ queryKey: assignmentKeys.myAssignedMilestones() });
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
    mutationFn: (data: OutputDraftUpload) => {
      const formData = new FormData();
      formData.append("file", data.file);
      formData.append("expected_draft_revision", String(data.expected_draft_revision));
      formData.append("request_id", data.request_id);
      if (data.replace_file_id) formData.append("replace_file_id", data.replace_file_id);
      return apiClient<OutputDraftReceipt>(`/projects/${projectId}/output-documents/${documentKey}/upload`, {
        method: "POST",
        body: formData,
      });
    },
    onSuccess: () => invalidateOutputDocument(queryClient, projectId),
  });
}

export function useRemoveOutputDocumentFile(projectId: string, documentKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ fileId, ...data }: { fileId: string; expected_draft_revision: number; request_id: string }) =>
      apiClient<OutputDraftReceipt>(`/projects/${projectId}/output-documents/${documentKey}/files/${fileId}`, {
        method: "DELETE",
        body: JSON.stringify(data),
      }),
    onSuccess: () => invalidateOutputDocument(queryClient, projectId),
  });
}

export function useOutputDocumentFileDownload(projectId: string, documentKey: string) {
  return useMutation({
    mutationFn: ({ fileId, versionId }: { fileId: string; versionId?: string }) =>
      apiClient<{ fileName: string; url: string; expiresInSeconds: number }>(
        versionId
          ? `/projects/${projectId}/output-documents/${documentKey}/versions/${versionId}/files/${fileId}/download`
          : `/projects/${projectId}/output-documents/${documentKey}/files/${fileId}/download`
      ),
  });
}

export function useSubmitOutputDocuments(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { items: OutputDocumentSubmitItem[]; note?: string }) =>
      apiClient<OutputDocumentBatchResponse>(`/projects/${projectId}/output-documents/submit`, {
        method: "POST",
        body: JSON.stringify(data || {}),
      }),
    onSuccess: () => invalidateOutputDocument(queryClient, projectId, true),
    onError: () => queryClient.invalidateQueries({ queryKey: approvalKeys.all() }),
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
    onError: () => queryClient.invalidateQueries({ queryKey: approvalKeys.all() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["global-search"] });
      queryClient.invalidateQueries({ queryKey: approvalKeys.all() });
      queryClient.invalidateQueries({ queryKey: outputDocumentKeys.project(projectId) });
      queryClient.invalidateQueries({ queryKey: outputDocumentKeys.repository() });
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.milestones(projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.progress(projectId) });
  queryClient.invalidateQueries({ queryKey: projectKeys.activities(projectId) });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.overview() });
      queryClient.invalidateQueries({ queryKey: assignmentKeys.myAssignedMilestones() });
    },
  });
}

export function useUpdateOutputChecklist(projectId: string) {
  const queryClient = useQueryClient();
  const business = useBusinessRequest();

  const mutation = useMutation({
    mutationFn: (selectedDocumentKeys: string[]) =>
      business<{ success: boolean; selectedDocumentKeys: string[] }>(projectId, "SCOPE", `/projects/${projectId}/output-documents/checklist`, "PUT", { selectedDocumentKeys }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: approvalKeys.all() });
      queryClient.invalidateQueries({ queryKey: outputDocumentKeys.project(projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.milestones(projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.progress(projectId) });
  queryClient.invalidateQueries({ queryKey: projectKeys.activities(projectId) });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.overview() });
    },
  });
  return Object.assign(mutation, { prepare: () => { if (projectId) business.prepare(projectId); } });
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
