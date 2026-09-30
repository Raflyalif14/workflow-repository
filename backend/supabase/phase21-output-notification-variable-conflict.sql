-- Apply after Phase 20. Keep the queue and retry behavior unchanged.
begin;

create or replace function public.deliver_pending_output_notifications(p_limit integer default 20)
returns table(notification_id uuid, failed boolean)
language plpgsql
security definer
set search_path = pg_catalog
as $$
#variable_conflict use_column
declare
  v_job public.output_notification_outbox%rowtype;
  v_notification_id uuid;
  v_operation text;
  v_sqlstate text;
begin
  for v_job in
    select * from public.output_notification_outbox
    where delivered_at is null
      and (last_attempt_at is null or last_attempt_at <= now() - interval '1 minute')
    order by created_at, id
    limit greatest(1, least(coalesce(p_limit, 20), 100))
    for update skip locked
  loop
    begin
      v_operation := 'notifications.insert';
      insert into public.notifications (user_id, type, title, message, project_id, action_url)
      values (v_job.recipient_user_id, v_job.notification_type, v_job.title, v_job.message,
              v_job.project_id, v_job.action_url)
      returning id into v_notification_id;

      v_operation := 'notification_deliveries.insert';
      insert into public.notification_deliveries (
        notification_id, channel, status, failure_kind, next_retry_at, attempt_count
      )
      select v_notification_id, 'TELEGRAM', 'FAILED', 'RETRYABLE', now(), 0
      from public.notification_preferences preference
      where preference.user_id = v_job.recipient_user_id
        and preference.telegram_enabled is true
        and preference.telegram_chat_id is not null
      on conflict (notification_id, channel) do nothing;

      v_operation := 'output_notification_outbox.mark_delivered';
      update public.output_notification_outbox
      set delivered_at = now(), attempt_count = attempt_count + 1,
          last_attempt_at = now(), last_error = null, last_error_category = null,
          last_error_sqlstate = null, last_error_operation = null
      where id = v_job.id;

      notification_id := v_notification_id;
      failed := false;
      return next;
    exception when others then
      v_sqlstate := SQLSTATE;
      update public.output_notification_outbox
      set attempt_count = attempt_count + 1,
          last_attempt_at = now(), last_error = 'Notification delivery failed.',
          last_error_category = case v_sqlstate
            when '23503' then 'REFERENCE'
            when '23505' then 'DUPLICATE'
            when '22P02' then 'INVALID_DATA'
            when '42501' then 'PERMISSION'
            else 'UNKNOWN'
          end,
          last_error_sqlstate = v_sqlstate,
          last_error_operation = v_operation
      where id = v_job.id;
      notification_id := null;
      failed := true;
      return next;
    end;
  end loop;
end;
$$;

revoke all on function public.deliver_pending_output_notifications(integer) from public, anon, authenticated;
grant execute on function public.deliver_pending_output_notifications(integer) to service_role;

commit;
