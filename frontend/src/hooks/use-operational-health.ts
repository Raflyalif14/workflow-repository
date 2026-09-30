import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { OutputOutboxHealth, StorageCleanupFilter, StorageCleanupHealth, StorageCleanupReceipt } from "@/types/operational-health";

export const operationalHealthKeys = {
  outbox: () => ["operational-health", "outbox"] as const,
  cleanups: () => ["operational-health", "cleanups"] as const,
};

export function useOutputOutboxHealth(page: number, enabled: boolean) {
  return useQuery<OutputOutboxHealth>({
    queryKey: [...operationalHealthKeys.outbox(), page],
    queryFn: () => apiClient(`/notifications/admin/output-outbox?page=${page}&limit=20`),
    enabled,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useStorageCleanupHealth(page: number, status: StorageCleanupFilter, enabled: boolean) {
  return useQuery<StorageCleanupHealth>({
    queryKey: [...operationalHealthKeys.cleanups(), status, page],
    queryFn: () => apiClient(`/projects/deletion-cleanups?page=${page}&limit=20&status=${status}`),
    enabled,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useRetryStorageCleanup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cleanupId: string) => apiClient<StorageCleanupReceipt>(`/projects/deletion-cleanups/${cleanupId}/retry`, { method: "POST" }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: operationalHealthKeys.cleanups() }),
  });
}
