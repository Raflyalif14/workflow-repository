import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { getAuthSession, isCurrentSession } from "@/lib/auth";
import { apiClient, SessionChangedError } from "@/lib/api-client";
import { dashboardKeys } from "@/lib/query-keys";
import { DashboardActivityPage, DashboardData } from "@/types/dashboard";

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
export function useDashboardActivity(cursor: string | null, enabled = true) {
  const { user, isLoading } = useAuth();
  const session = getAuthSession();
  const client = useQueryClient();
  const scope = dashboardKeys.activityScope(user?.id || "anonymous", session?.id || "none", user?.role || "unknown");
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
  }, [client, scopeKey]);
  const canRead = !isLoading && Boolean(user?.id && user.isActive && !user.mustChangePassword && session
    && ["SALES", "SA", "HEAD_SA", "SUPER_ADMIN"].includes(user.role));
  const query = useQuery<DashboardActivityPage>({
    queryKey: dashboardKeys.activityPage(user?.id || "anonymous", session?.id || "none", user?.role || "unknown", cursor),
    enabled: enabled && canRead && cursor !== null,
    queryFn: async ({ signal }) => {
      if (!canRead || !session || !isCurrentSession(session)) throw new SessionChangedError();
      const params = new URLSearchParams();
      if (cursor !== null) params.set("cursor", cursor);
      const data = await apiClient<DashboardActivityPage>(`/dashboard/activity?${params}`, { signal });
      if (!isCurrentSession(session)) throw new SessionChangedError();
      if (!data || !Array.isArray(data.items) || data.items.length > 8 || data.pageSize !== 8
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
    refetch: () => enabled && canRead && cursor !== null ? query.refetch() : Promise.resolve(undefined),
  };
}
