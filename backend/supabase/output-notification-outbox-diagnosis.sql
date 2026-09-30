-- Read-only diagnosis. Do not select notification text, recipient details, or URLs.
-- 1. Confirm the scope and age of pending failures without exposing row content.
select event_status, last_error_category, count(*) as pending_count,
       min(created_at) as oldest_created_at,
       max(created_at) as newest_created_at,
       min(attempt_count) as min_attempt_count,
       max(attempt_count) as max_attempt_count,
       max(last_attempt_at) as latest_attempt_at
from public.output_notification_outbox
where delivered_at is null
group by event_status, last_error_category
order by event_status, last_error_category;

-- Distinguish the always-run notifications INSERT from the conditional Telegram delivery row.
select count(*) as pending_count,
       count(*) filter (where preference.telegram_enabled is true
                          and preference.telegram_chat_id is not null) as telegram_delivery_eligible_count
from public.output_notification_outbox job
left join public.notification_preferences preference on preference.user_id = job.recipient_user_id
where job.delivered_at is null;

-- 2. Check deployed function versions. A caught exception is not logged by this RPC.
select p.proname,
       pg_get_function_identity_arguments(p.oid) as arguments,
       position('last_error_category' in pg_get_functiondef(p.oid)) > 0 as stores_error_category,
       position('last_error_sqlstate' in pg_get_functiondef(p.oid)) > 0 as stores_sqlstate,
       position('notification_deliveries' in pg_get_functiondef(p.oid)) > 0 as inserts_delivery
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('deliver_pending_output_notifications', 'enqueue_output_document_notification')
order by p.proname;

-- 3. Compare the deployed columns needed by the RPC with Phase 10C/15/16.
select c.relname as table_name, a.attname as column_name,
       format_type(a.atttypid, a.atttypmod) as data_type,
       a.attnotnull as not_null
from pg_class c join pg_namespace n on n.oid = c.relnamespace
join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
where n.nspname = 'public'
  and c.relname in ('notifications', 'notification_deliveries', 'notification_preferences', 'output_notification_outbox')
  and a.attname in ('user_id', 'type', 'title', 'message', 'project_id', 'action_url',
                    'notification_id', 'channel', 'status', 'failure_kind', 'next_retry_at',
                    'attempt_count', 'telegram_enabled', 'telegram_chat_id',
                    'last_error_category', 'last_error_sqlstate', 'last_error_operation')
order by c.relname, a.attname;

-- 4. ON CONFLICT (notification_id, channel) requires a matching unique index.
select i.relname as index_name, x.indisunique as is_unique,
       pg_get_indexdef(i.oid) as index_definition
from pg_class t join pg_namespace n on n.oid = t.relnamespace
join pg_index x on x.indrelid = t.oid
join pg_class i on i.oid = x.indexrelid
where n.nspname = 'public' and t.relname = 'notification_deliveries'
  and i.relname = 'notification_deliveries_notification_channel_unique_idx';

-- 5. Identify triggers that can run during the two INSERT operations.
select t.relname as table_name, g.tgname as trigger_name,
       p.proname as function_name, g.tgenabled as enabled
from pg_trigger g join pg_class t on t.oid = g.tgrelid
join pg_namespace n on n.oid = t.relnamespace
join pg_proc p on p.oid = g.tgfoid
where n.nspname = 'public'
  and t.relname in ('notifications', 'notification_deliveries')
  and not g.tgisinternal
order by t.relname, g.tgname;

-- 6. Check constraints without exposing notification or user data.
select t.relname as table_name, c.conname as constraint_name,
       c.contype as constraint_type, pg_get_constraintdef(c.oid) as definition
from pg_constraint c join pg_class t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public'
  and t.relname in ('notifications', 'notification_deliveries')
order by t.relname, c.conname;

-- After the optional Phase 20 diagnostic migration and a normal worker retry,
-- run separately (the columns do not exist before that migration):
-- select last_error_operation, last_error_sqlstate, last_error_category,
--        count(*) as pending_count, min(attempt_count) as min_attempt_count,
--        max(attempt_count) as max_attempt_count
-- from public.output_notification_outbox
-- where delivered_at is null
-- group by last_error_operation, last_error_sqlstate, last_error_category
-- order by pending_count desc;
