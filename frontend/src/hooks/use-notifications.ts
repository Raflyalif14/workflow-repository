import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, SessionChangedError } from "@/lib/api-client";
import { useAuth } from "@/components/auth/auth-provider";
import { getAuthSession, isCurrentSession } from "@/lib/auth";
import { canUsePersonalNotificationSettings } from "@/lib/settings-access";
import { notificationKeys } from "@/lib/query-keys";
import {
  AppNotification,
  NotificationPreferences,
  TelegramDeliveryHealth,
  TelegramLinkResponse,
  UnreadNotificationCount,
} from "@/types/notification";

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

type UpdateNotificationPreferencesInput = {
  in_app_enabled?: boolean;
  telegram_enabled?: boolean;
};

const notificationPreferencesPath = "/notifications/preferences";
const telegramDeliveryHealthPath = "/notifications/admin/telegram-delivery-health";

function usePersonalNotificationScope() {
  const { user, isLoading } = useAuth();
  const session = getAuthSession();
  const eligible = !isLoading && canUsePersonalNotificationSettings(user) && Boolean(session);
  const current = () => Boolean(eligible && session && isCurrentSession(session));
  const request = <T,>(path: string, options?: RequestInit) => {
    if (!current()) throw new SessionChangedError();
    return apiClient<T>(path, options);
  };
  return { eligible, current, request, key: notificationKeys.preferences(user?.id, session?.id) };
}

export function useNotificationPreferences(enabled = true) {
  const scope = usePersonalNotificationScope();
  return useQuery<NotificationPreferences>({
    queryKey: scope.key,
    queryFn: ({ signal }) => scope.request<NotificationPreferences>(notificationPreferencesPath, { signal }),
    enabled: enabled && scope.eligible,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
}

export function useTelegramDeliveryHealth(enabled = true) {
  return useQuery<TelegramDeliveryHealth>({
    queryKey: notificationKeys.deliveryHealth(),
    queryFn: () => apiClient<TelegramDeliveryHealth>(telegramDeliveryHealthPath),
    enabled,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();
  const scope = usePersonalNotificationScope();

  return useMutation({
    mutationKey: [...scope.key, "update"],
    mutationFn: (input: UpdateNotificationPreferencesInput) =>
      scope.request<NotificationPreferences>(notificationPreferencesPath, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: async (preferences) => {
      if (!scope.current()) return;
      queryClient.setQueryData(scope.key, preferences);
      await queryClient.invalidateQueries({ queryKey: scope.key });
    },
  });
}

export function useCreateTelegramLink() {
  const queryClient = useQueryClient();
  const scope = usePersonalNotificationScope();

  return useMutation({
    mutationKey: [...scope.key, "link"],
    mutationFn: () =>
      scope.request<TelegramLinkResponse>("/notifications/telegram/link", { method: "POST" }),
    onSuccess: async () => {
      if (scope.current()) await queryClient.invalidateQueries({ queryKey: scope.key });
    },
  });
}

export function useInvalidateTelegramLink() {
  const queryClient = useQueryClient();
  const scope = usePersonalNotificationScope();

  return useMutation({
    mutationKey: [...scope.key, "cancel-link"],
    mutationFn: () => scope.request<{ invalidated: true }>("/notifications/telegram/link", { method: "DELETE" }),
    onSuccess: async () => {
      if (scope.current()) await queryClient.invalidateQueries({ queryKey: scope.key });
    },
  });
}

export function useUnlinkTelegram() {
  const queryClient = useQueryClient();
  const scope = usePersonalNotificationScope();

  return useMutation({
    mutationKey: [...scope.key, "unlink"],
    mutationFn: () => scope.request<NotificationPreferences>("/notifications/telegram", { method: "DELETE" }),
    onSuccess: async (preferences) => {
      if (!scope.current()) return;
      queryClient.setQueryData(scope.key, preferences);
      await queryClient.invalidateQueries({ queryKey: scope.key });
    },
  });
}
