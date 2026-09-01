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
