import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { notificationKeys } from "@/lib/query-keys";
import { AppNotification, UnreadNotificationCount } from "@/types/notification";

const notificationListPath = "/notifications?limit=20&offset=0";

export function useNotifications(enabled: boolean) {
  return useQuery<AppNotification[]>({
    queryKey: notificationKeys.list(),
    queryFn: () => apiClient<AppNotification[]>(notificationListPath),
    enabled,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
}

export function useUnreadNotificationCount(enabled: boolean) {
  return useQuery<UnreadNotificationCount>({
    queryKey: notificationKeys.unreadCount(),
    queryFn: () => apiClient<UnreadNotificationCount>("/notifications/unread-count"),
    enabled,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useMarkNotificationAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: string) =>
      apiClient<AppNotification>(`/notifications/${notificationId}/read`, { method: "PATCH" }),
    onSuccess: (notification) => {
      queryClient.setQueryData<AppNotification[]>(notificationKeys.list(), (current) =>
        current?.map((item) => (item.id === notification.id ? notification : item))
      );
      queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount() });
      queryClient.invalidateQueries({ queryKey: notificationKeys.list() });
    },
  });
}

export function useMarkAllNotificationsAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiClient<{ success: true }>("/notifications/read-all", { method: "PATCH" }),
    onSuccess: () => {
      queryClient.setQueryData<AppNotification[]>(notificationKeys.list(), (current) =>
        current?.map((notification) => ({
          ...notification,
          is_read: true,
          read_at: notification.read_at || new Date().toISOString(),
        }))
      );
      queryClient.setQueryData<UnreadNotificationCount>(notificationKeys.unreadCount(), { unreadCount: 0 });
      queryClient.invalidateQueries({ queryKey: notificationKeys.all() });
    },
  });
}
