-- Phase 10C-7B: atomically claim due Telegram retry attempts for service workers.

create or replace function public.claim_due_telegram_deliveries(p_limit integer default 20)
returns table (
  id uuid,
  notification_id uuid,
  attempt_count integer,
  last_attempt_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 100));
begin
  return query
  with due_deliveries as (
    select delivery.id
    from public.notification_deliveries as delivery
    where delivery.channel = 'TELEGRAM'
      and delivery.status = 'FAILED'
      and delivery.failure_kind = 'RETRYABLE'
      and delivery.next_retry_at is not null
      and delivery.next_retry_at <= now()
      and delivery.attempt_count < 3
    order by delivery.next_retry_at asc
    limit v_limit
    for update skip locked
  ), claimed_deliveries as (
    update public.notification_deliveries as delivery
    set attempt_count = delivery.attempt_count + 1,
        last_attempt_at = now(),
        next_retry_at = null
    from due_deliveries
    where delivery.id = due_deliveries.id
    returning delivery.id, delivery.notification_id, delivery.attempt_count, delivery.last_attempt_at
  )
  select claimed_deliveries.id,
         claimed_deliveries.notification_id,
         claimed_deliveries.attempt_count,
         claimed_deliveries.last_attempt_at
  from claimed_deliveries;
end;
$$;

revoke all on function public.claim_due_telegram_deliveries(integer) from public;
revoke all on function public.claim_due_telegram_deliveries(integer) from anon;
revoke all on function public.claim_due_telegram_deliveries(integer) from authenticated;
grant execute on function public.claim_due_telegram_deliveries(integer) to service_role;
