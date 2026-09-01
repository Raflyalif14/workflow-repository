-- Phase 10C-1A: Notification system database foundation.
-- Adds in-app notification records, user preferences, and external delivery tracking.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null check (char_length(trim(type)) > 0),
  title text not null check (char_length(trim(title)) > 0),
  message text not null check (char_length(trim(message)) > 0),
  project_id uuid references public.projects(id) on delete cascade,
  milestone_id uuid references public.project_milestones(id) on delete cascade,
  action_url text,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.notification_preferences (
  user_id uuid primary key references public.users(id) on delete cascade,
  in_app_enabled boolean not null default true,
  telegram_enabled boolean not null default false,
  telegram_chat_id text,
  telegram_username text,
  telegram_linked_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  channel text not null check (channel in ('TELEGRAM')),
  status text not null default 'PENDING' check (status in ('PENDING', 'SENT', 'FAILED')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists notifications_user_created_at_idx
  on public.notifications(user_id, created_at desc);
create index if not exists notifications_user_is_read_created_at_idx
  on public.notifications(user_id, is_read, created_at desc);
create index if not exists notifications_project_id_idx
  on public.notifications(project_id);
create index if not exists notifications_milestone_id_idx
  on public.notifications(milestone_id);

create index if not exists notification_deliveries_notification_id_idx
  on public.notification_deliveries(notification_id);
create index if not exists notification_deliveries_status_created_at_idx
  on public.notification_deliveries(status, created_at desc);
create index if not exists notification_deliveries_channel_status_idx
  on public.notification_deliveries(channel, status);

-- Reuse the existing generic updated_at trigger function without replacing it.
do $$
begin
  if to_regprocedure('public.set_phase2_updated_at()') is not null then
    if not exists (
      select 1
      from pg_trigger
      where tgrelid = 'public.notification_preferences'::regclass
        and tgname = 'notification_preferences_set_updated_at'
        and not tgisinternal
    ) then
      execute 'create trigger notification_preferences_set_updated_at
        before update on public.notification_preferences
        for each row execute function public.set_phase2_updated_at()';
    end if;

    if not exists (
      select 1
      from pg_trigger
      where tgrelid = 'public.notification_deliveries'::regclass
        and tgname = 'notification_deliveries_set_updated_at'
        and not tgisinternal
    ) then
      execute 'create trigger notification_deliveries_set_updated_at
        before update on public.notification_deliveries
        for each row execute function public.set_phase2_updated_at()';
    end if;
  end if;
end;
$$;

alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_deliveries enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'notifications'
      and policyname = 'notifications_service_role_only'
  ) then
    execute 'create policy notifications_service_role_only on public.notifications
      for all to service_role using (true) with check (true)';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'notification_preferences'
      and policyname = 'notification_preferences_service_role_only'
  ) then
    execute 'create policy notification_preferences_service_role_only on public.notification_preferences
      for all to service_role using (true) with check (true)';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'notification_deliveries'
      and policyname = 'notification_deliveries_service_role_only'
  ) then
    execute 'create policy notification_deliveries_service_role_only on public.notification_deliveries
      for all to service_role using (true) with check (true)';
  end if;
end;
$$;
