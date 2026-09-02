-- Phase 11A: reconcile the public user security fields already used at runtime.

alter table public.users
  add column if not exists must_change_password boolean not null default false,
  add column if not exists initial_password_sent_at timestamptz null;
