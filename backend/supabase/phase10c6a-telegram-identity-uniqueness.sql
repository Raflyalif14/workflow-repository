-- Phase 10C-6A: one Telegram account may belong to only one application user.

create unique index if not exists notification_preferences_telegram_chat_id_unique_idx
  on public.notification_preferences(telegram_chat_id)
  where telegram_chat_id is not null;
