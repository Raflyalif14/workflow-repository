import { requireRepositorySession, useRepositorySession } from './use-repository-session';
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { GlobalSearchResponse, isGlobalSearchEligible } from "@/lib/global-search";

const SEARCH_DEBOUNCE_MS = 275;

export function useGlobalSearch(query: string, open: boolean) {
  const scope = useRepositorySession();
  const trimmedQuery = query.trim();
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    if (!open || !isGlobalSearchEligible(trimmedQuery)) {
      setDebouncedQuery("");
      return;
    }

    const timeout = window.setTimeout(() => setDebouncedQuery(trimmedQuery), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [open, trimmedQuery]);

  const searchQuery = useQuery<GlobalSearchResponse>({
    queryKey: ["global-search", debouncedQuery, ...scope.key],
    queryFn: () => { requireRepositorySession(scope); return apiClient<GlobalSearchResponse>(`/search?q=${encodeURIComponent(debouncedQuery)}`); },
    enabled: scope.enabled && open && isGlobalSearchEligible(debouncedQuery),
    staleTime: 15_000,
  });

  return {
    ...searchQuery,
    isDebouncing: open && isGlobalSearchEligible(trimmedQuery) && debouncedQuery !== trimmedQuery,
  };
}
