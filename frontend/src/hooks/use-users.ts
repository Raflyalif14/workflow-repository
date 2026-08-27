import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { User, UsersResponse, UserFilters } from "@/types/user";

export function useUsers(filters: UserFilters = {}) {
  const { page = 1, limit = 10, search = "", role = "ALL", isActive } = filters;

  return useQuery<UsersResponse>({
    queryKey: ["users", { page, limit, search, role, isActive }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append("page", String(page));
      params.append("limit", String(limit));
      if (search) params.append("search", search);
      if (role && role !== "ALL") params.append("role", role);
      if (isActive !== undefined && isActive !== "") params.append("isActive", isActive);

      return apiClient<UsersResponse>(`/users?${params.toString()}`);
    },
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: any) => {
      return apiClient<User>("/users", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiClient<User>(`/users/${id}`, {
        method: "PATCH", // This line is already correct
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useUpdateUserStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiClient<User>(`/users/${id}/status`, { method: "PATCH", body: JSON.stringify({ isActive }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: async ({ id, newPassword }: { id: string; newPassword: string }) => {
      return apiClient<{ message: string }>(`/users/${id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ newPassword }),
      });
    },
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      return apiClient<User>(`/users/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}
