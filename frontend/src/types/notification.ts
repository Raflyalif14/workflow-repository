export type AppNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  project_id: string | null;
  milestone_id: string | null;
  action_url: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
};

export type UnreadNotificationCount = {
  unreadCount: number;
};

export type NotificationPreferences = {
  in_app_enabled: boolean;
  telegram_enabled: boolean;
  telegram_linked: boolean;
  telegram_username: string | null;
  telegram_linked_at: string | null;
};

export type TelegramLinkResponse = {
  linkUrl: string;
  expiresAt: string;
};
