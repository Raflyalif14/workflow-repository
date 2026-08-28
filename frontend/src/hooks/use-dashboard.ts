import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { dashboardKeys } from "@/lib/query-keys";
import { DashboardData } from "@/types/dashboard";

export function useDashboard() {
  return useQuery<DashboardData>({
    queryKey: dashboardKeys.overview(),
    queryFn: async () => apiClient<DashboardData>("/dashboard"),
    staleTime: 30000,
    refetchOnWindowFocus: true,
    refetchInterval: 30000, // auto refresh every 30s
  });
}
