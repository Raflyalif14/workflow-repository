import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { DashboardData } from "@/types/dashboard";

export function useDashboard() {
  return useQuery<DashboardData>({
    queryKey: ["dashboard"],
    queryFn: async () => apiClient<DashboardData>("/dashboard"),
    refetchInterval: 30000, // auto refresh every 30s
  });
}
