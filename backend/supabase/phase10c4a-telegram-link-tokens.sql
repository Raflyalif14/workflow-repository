-- Phase 10C-4A: secure, one-time Telegram account linking tokens.

create table if not exists public.telegram_link_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists telegram_link_tokens_user_open_expires_at_idx
  on public.telegram_link_tokens(user_id, expires_at desc)
  where consumed_at is null;
create index if not exists telegram_link_tokens_expires_at_idx
  on public.telegram_link_tokens(expires_at);

alter table public.telegram_link_tokens enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'telegram_link_tokens'
      and policyname = 'telegram_link_tokens_service_role_only'
  ) then
    execute 'create policy telegram_link_tokens_service_role_only on public.telegram_link_tokens
      for all to service_role using (true) with check (true)';
  end if;
end;
$$;
