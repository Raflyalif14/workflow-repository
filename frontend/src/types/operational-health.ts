export type MonitoringPage<T> = { page: number; limit: number; totalPages: number; items: T[] };

export type OutputOutboxHealth = MonitoringPage<{
  id: string; createdAt: string; attemptCount: number; lastAttemptAt: string | null;
  errorCategory: string | null; sqlstate: string | null; errorOperation: string | null;
}> & { generatedAt: string; summary: { pending: number; previouslyFailed: number; oldestCreatedAt: string | null; oldestAgeSeconds: number | null; latestAttemptAt: string | null } };

export type StorageCleanupStatus = "PENDING" | "FAILED" | "COMPLETED";
export type StorageCleanupFilter = StorageCleanupStatus | "ALL";
export type StorageCleanupHealth = MonitoringPage<{
  id: string; createdAt: string; updatedAt: string; failedAt: string | null;
  completedAt: string | null; status: StorageCleanupStatus; storageObjectCount: number;
  failureCode: string | null; attemptCount: null;
}> & { status: StorageCleanupFilter; summary: { total: number; pending: number; failed: number; completed: number } };

export type StorageCleanupReceipt = { cleanup: { id: string; status: StorageCleanupStatus; storage_object_count: number } };
