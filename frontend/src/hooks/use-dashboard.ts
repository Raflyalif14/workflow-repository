import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { getAuthSession, isCurrentSession } from "@/lib/auth";
import { apiClient, SessionChangedError } from "@/lib/api-client";
import { dashboardKeys } from "@/lib/query-keys";
import { DashboardActivityPage, DashboardData, DashboardActivityFilters } from "@/types/dashboard";

export function useDashboard() {
  return useQuery<DashboardData>({
    queryKey: dashboardKeys.overview(),
    queryFn: async () => apiClient<DashboardData>("/dashboard"),
    staleTime: 30000,
    refetchOnWindowFocus: true,
    refetchInterval: 30000, // auto refresh every 30s
  });
}

// Account/session isolation follows the existing repository-query pattern.
export function useDashboardActivity(page: number | null, enabled = true, filters: DashboardActivityFilters = {}) {
  const { user, isLoading } = useAuth();
  const session = getAuthSession();
  const client = useQueryClient();
  const scope = useMemo(() => dashboardKeys.activityScope(user?.id || "anonymous", session?.id || "none", user?.role || "unknown"), [user?.id, session?.id, user?.role]);
  const scopeKey = JSON.stringify(scope);
  const previousScope = useRef(scope);
  useEffect(() => {
    if (JSON.stringify(previousScope.current) !== scopeKey) {
      const old = previousScope.current;
      // AuthProvider also clears account caches; cancel/remove this private feed explicitly.
      void client.cancelQueries({ queryKey: old });
      client.removeQueries({ queryKey: old });
      previousScope.current = scope;
    }
  }, [client, scopeKey, scope]);
  const canRead = !isLoading && Boolean(user?.id && user.isActive && !user.mustChangePassword && session
    && ["SALES", "SA", "HEAD_SA", "SUPER_ADMIN"].includes(user.role));
  const query = useQuery<DashboardActivityPage>({
    queryKey: dashboardKeys.activityPage(user?.id || "anonymous", session?.id || "none", user?.role || "unknown", page, filters),
    enabled: enabled && canRead && page !== null,
    queryFn: async ({ signal }) => {
      if (!canRead || !session || !isCurrentSession(session)) throw new SessionChangedError();
      if (page === null || !Number.isSafeInteger(page) || page < 1) throw new Error("Invalid activity page");
      const params = new URLSearchParams();
      params.set("page", String(page));
      for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
      const data = await apiClient<DashboardActivityPage>(`/dashboard/activity?${params}`, { signal });
      if (!isCurrentSession(session)) throw new SessionChangedError();
      if (!data || !Array.isArray(data.items) || data.items.length > 8 || data.pageSize !== 8
        || !Number.isSafeInteger(data.total) || data.total < 0
        || data.totalPages !== Math.max(1, Math.ceil(data.total / 8))
        || !Number.isSafeInteger(data.page) || data.page < 1 || data.page > data.totalPages || data.page > page
        || !(data.nextCursor === null || typeof data.nextCursor === "string" && data.nextCursor.length > 0)) {
        throw new Error("Invalid activity response");
      }
      return data;
    },
    staleTime: 30000,
    refetchOnWindowFocus: true,
    refetchInterval: 30000,
  });
  return { ...query, canRead, scopeKey, isAccessLoading: isLoading,
    refetch: () => enabled && canRead && page !== null ? query.refetch() : Promise.resolve(undefined),
  };
}
