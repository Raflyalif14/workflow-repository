-- Apply after Phase 13. Output transitions enqueue notification intents atomically.
begin;

create table if not exists public.output_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  output_document_id uuid not null references public.project_output_documents(id) on delete cascade,
  version_id uuid not null references public.project_output_document_versions(id) on delete cascade,
  recipient_user_id uuid not null references public.users(id) on delete cascade,
  event_status text not null check (event_status in ('IN_REVIEW', 'APPROVED', 'REVISION_REQUIRED')),
  notification_type text not null,
  title text not null,
  message text not null,
  action_url text not null,
  attempt_count integer not null default 0,
  last_attempt_at timestamptz,
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (output_document_id, version_id, event_status, recipient_user_id)
);

create index if not exists output_notification_outbox_pending_idx
  on public.output_notification_outbox(created_at, id) where delivered_at is null;

alter table public.output_notification_outbox enable row level security;
revoke all on table public.output_notification_outbox from public, anon, authenticated;
grant select, insert, update, delete on table public.output_notification_outbox to service_role;

create or replace function public.enqueue_output_document_notification()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_project public.projects%rowtype;
  v_actor_id uuid;
begin
  if old.status is not distinct from new.status
    or new.status not in ('IN_REVIEW', 'APPROVED', 'REVISION_REQUIRED')
    or new.current_version_id is null then
    return new;
  end if;

  select * into v_project from public.projects where id = new.project_id;
  if not found then
    raise exception 'Output notification project missing';
  end if;

  select case when new.status = 'IN_REVIEW' then version.uploaded_by else version.reviewed_by end
    into v_actor_id
  from public.project_output_document_versions version
  where version.id = new.current_version_id;

  insert into public.output_notification_outbox (
    project_id, output_document_id, version_id, recipient_user_id,
    event_status, notification_type, title, message, action_url
  )
  select
    new.project_id, new.id, new.current_version_id, recipient.id,
    new.status,
    case new.status
      when 'IN_REVIEW' then 'OUTPUT_DOCUMENTS_SUBMITTED'
      when 'APPROVED' then 'OUTPUT_DOCUMENTS_APPROVED'
      else 'OUTPUT_DOCUMENTS_REVISION_REQUIRED'
    end,
    case new.status
      when 'IN_REVIEW' then 'Output Document Submitted'
      when 'APPROVED' then 'Output Document Approved'
      else 'Output Document Revision Required'
    end,
    case new.status
      when 'IN_REVIEW' then 'Output "' || new.title || '" for project "' || v_project.name || '" is ready for review.'
      when 'APPROVED' then 'Output "' || new.title || '" for project "' || v_project.name || '" was approved.'
      else 'Output "' || new.title || '" for project "' || v_project.name || '" requires revision.'
    end,
    '/projects/' || new.project_id::text || '#output-documents'
  from public.users recipient
  where recipient.is_active is true
    and recipient.id is distinct from v_actor_id
    and (
      (new.status = 'IN_REVIEW' and recipient.role = 'HEAD_SA')
      or (new.status in ('APPROVED', 'REVISION_REQUIRED')
          and recipient.id = v_project.pic_id and recipient.role in ('SA', 'HEAD_SA'))
      or (new.status = 'APPROVED' and recipient.id = v_project.sales_id and recipient.role = 'SALES')
    )
  on conflict (output_document_id, version_id, event_status, recipient_user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists output_document_notification_enqueue on public.project_output_documents;
create trigger output_document_notification_enqueue
  after update of status on public.project_output_documents
  for each row execute function public.enqueue_output_document_notification();

revoke all on function public.enqueue_output_document_notification() from public, anon, authenticated;

create or replace function public.deliver_pending_output_notifications(p_limit integer default 20)
returns table(notification_id uuid, failed boolean)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_job public.output_notification_outbox%rowtype;
  v_notification_id uuid;
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
      insert into public.notifications (user_id, type, title, message, project_id, action_url)
      values (v_job.recipient_user_id, v_job.notification_type, v_job.title, v_job.message,
              v_job.project_id, v_job.action_url)
      returning id into v_notification_id;

      insert into public.notification_deliveries (
        notification_id, channel, status, failure_kind, next_retry_at, attempt_count
      )
      select v_notification_id, 'TELEGRAM', 'FAILED', 'RETRYABLE', now(), 0
      from public.notification_preferences preference
      where preference.user_id = v_job.recipient_user_id
        and preference.telegram_enabled is true
        and preference.telegram_chat_id is not null
      on conflict (notification_id, channel) do nothing;

      update public.output_notification_outbox
      set delivered_at = now(), attempt_count = attempt_count + 1,
          last_attempt_at = now(), last_error = null
      where id = v_job.id;

      notification_id := v_notification_id;
      failed := false;
      return next;
    exception when others then
      update public.output_notification_outbox
      set attempt_count = attempt_count + 1,
          last_attempt_at = now(), last_error = 'Notification delivery failed.'
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
