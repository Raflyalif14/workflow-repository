export type GlobalSearchResult = {
  type: "PROJECT" | "DOCUMENT" | "MILESTONE";
  id: string;
  projectId: string;
  title: string;
  subtitle: string;
  status?: string;
};

export type GlobalSearchResponse = {
  projects: GlobalSearchResult[];
  documents: GlobalSearchResult[];
  milestones: GlobalSearchResult[];
};

export const isGlobalSearchEligible = (query: string) => query.trim().length >= 2;

export const flattenGlobalSearchResults = (results?: GlobalSearchResponse): GlobalSearchResult[] => [
  ...(results?.projects || []),
  ...(results?.documents || []),
  ...(results?.milestones || []),
];

export const moveGlobalSearchSelection = (current: number, direction: -1 | 1, total: number): number => {
  if (!total) return -1;
  if (current < 0) return direction === 1 ? 0 : total - 1;
  return Math.min(total - 1, Math.max(0, current + direction));
};

export const globalSearchResultHref = (result: Pick<GlobalSearchResult, "projectId">) =>
  `/projects/${result.projectId}`;
