-- Phase 17: Persist each user's UI language preference.
-- Additive only. Apply before deploying the backend/frontend language feature.

alter table public.users
  add column if not exists preferred_language text not null default 'en';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.users'::regclass
      and conname = 'users_preferred_language_check'
  ) then
    alter table public.users
      add constraint users_preferred_language_check
      check (preferred_language in ('en', 'id'));
  end if;
end
$$;
