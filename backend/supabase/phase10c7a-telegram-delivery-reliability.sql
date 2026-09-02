-- Phase 10C-7A: delivery failure classification and future retry metadata.

alter table public.notification_deliveries
  add column if not exists failure_kind text,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists next_retry_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'notification_deliveries_failure_kind_check'
      and conrelid = 'public.notification_deliveries'::regclass
  ) then
    alter table public.notification_deliveries
      add constraint notification_deliveries_failure_kind_check
      check (failure_kind is null or failure_kind in ('RETRYABLE', 'AMBIGUOUS', 'TERMINAL'));
  end if;
end;
$$;

create index if not exists notification_deliveries_telegram_retryable_retry_idx
  on public.notification_deliveries(channel, status, failure_kind, next_retry_at)
  where channel = 'TELEGRAM'
    and status = 'FAILED'
    and failure_kind = 'RETRYABLE';
