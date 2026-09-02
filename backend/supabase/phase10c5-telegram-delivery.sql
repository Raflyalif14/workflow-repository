-- Phase 10C-5A: prevent duplicate Telegram delivery attempts per notification.

create unique index if not exists notification_deliveries_notification_channel_unique_idx
  on public.notification_deliveries(notification_id, channel);
