import type { OutputRepositoryItem } from "@/hooks/use-output-documents";
import type { DocumentCategory, DocumentItem, DocumentStatus } from "@/types/document";

export type RepositoryItem =
  | { sourceType: "OFFICIAL"; sourceId: string; document: DocumentItem }
  | { sourceType: "OUTPUT"; sourceId: string; output: OutputRepositoryItem };

export type RepositoryAccessGroup = "ALL" | "NATIVE";

export function repositoryAccessGroups(role?: string): RepositoryAccessGroup[] {
  return role === "SALES" || role === "SA" ? ["ALL", "NATIVE"] : ["ALL"];
}

// Undefined data, disabled queries and failures are not successful empty results.
export function repositoryLoadState(enabled: boolean, documents: { data?: unknown; isError: boolean },
  outputs: { data?: unknown; isError: boolean }): "loading" | "error" | "ready" {
  if (!enabled) return "loading";
  if (documents.isError || outputs.isError) return "error";
  return Array.isArray(documents.data) && Array.isArray(outputs.data) ? "ready" : "loading";
}

export function requireRepositoryArray<T>(data: T[]): T[] {
  if (!Array.isArray(data)) throw new Error("Document repository response is unavailable.");
  return data;
}

export type RepositoryFilters = {
  accessGroup?: RepositoryAccessGroup;
  search: string;
  category: DocumentCategory | "OUTPUT" | "ALL";
  status: DocumentStatus | "ALL";
};

export const REPOSITORY_PAGE_SIZE = 20;

export function buildRepositoryItems(documents: readonly DocumentItem[], outputs: readonly OutputRepositoryItem[]): RepositoryItem[] {
  const items: RepositoryItem[] = [...new Map(documents.map(document => [document.id, document])).values()].map((document) => ({
    sourceType: "OFFICIAL", sourceId: document.id, document,
  }));
  const outputIds = new Set<string>();
  for (const output of outputs) {
    if (output.status !== "APPROVED" || !output.projectId || !output.documentKey
      || !output.approvedVersionId || !output.files?.length) continue;
    const sourceId = `${output.projectId}:${output.documentKey}`;
    if (outputIds.has(sourceId)) continue;
    outputIds.add(sourceId);
    items.push({ sourceType: "OUTPUT", sourceId, output });
  }
  return items.sort((left, right) => {
    const leftUpdated = left.sourceType === "OFFICIAL" ? left.document.updatedAt : left.output.updatedAt || "";
    const rightUpdated = right.sourceType === "OFFICIAL" ? right.document.updatedAt : right.output.updatedAt || "";
    return rightUpdated.localeCompare(leftUpdated) || `${left.sourceType}:${left.sourceId}`.localeCompare(`${right.sourceType}:${right.sourceId}`);
  });
}

export function filterRepositoryItems(items: readonly RepositoryItem[], filters: RepositoryFilters): RepositoryItem[] {
  const query = filters.search.trim().toLocaleLowerCase();
  return items.filter((item) => {
    const access = item.sourceType === "OFFICIAL" ? item.document : item.output;
    if (filters.accessGroup === "NATIVE" && access.canReadProject !== true) return false;
    if (item.sourceType === "OFFICIAL") {
      const document = item.document;
      return (filters.category === "ALL" || document.category === filters.category)
        && (filters.status === "ALL" || document.status === filters.status)
        && (!query || `${document.title} ${document.project?.name || ""} ${document.versions?.[0]?.fileName || ""}`.toLocaleLowerCase().includes(query));
    }
    const output = item.output;
    return (filters.category === "ALL" || filters.category === "OUTPUT")
      && (filters.status === "ALL" || filters.status === "APPROVED")
      && (!query || `${output.name} ${output.projectName} ${output.files.map((file) => file.fileName).join(" ")}`.toLocaleLowerCase().includes(query));
  });
}

export function paginateRepositoryItems(items: readonly RepositoryItem[], page: number, pageSize = REPOSITORY_PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  return { page: safePage, totalPages, items: items.slice((safePage - 1) * pageSize, safePage * pageSize) };
}
