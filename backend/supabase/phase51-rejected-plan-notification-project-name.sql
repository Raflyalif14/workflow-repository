-- Phase 51: Include project name in PROJECT_PLAN_REJECTED notifications
-- queued by queue_pic_operation_notification(uuid, uuid, text)

begin;

create or replace function public.queue_pic_operation_notification(
  p_project_id uuid,
  p_recipient uuid,
  p_type text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_language text;
  v_in_app boolean;
  v_telegram boolean;
  v_id uuid;
  v_title text;
  v_message text;
  v_project_name text;
begin
  if p_recipient is null then return; end if;

  select u.preferred_language,
    coalesce(np.in_app_enabled, true),
    coalesce(np.telegram_enabled, false) and nullif(pg_catalog.btrim(np.telegram_chat_id), '') is not null
  into v_language, v_in_app, v_telegram
  from public.users u
  left join public.notification_preferences np on np.user_id = u.id
  where u.id = p_recipient and u.is_active;

  if not found or not (v_in_app or v_telegram) then return; end if;

  select nullif(pg_catalog.btrim(p.name), '') into v_project_name
  from public.projects p
  where p.id = p_project_id;

  v_title := case p_type
    when 'PIC_ASSIGNED' then case when v_language = 'id' then 'Penugasan PIC' else 'PIC Assignment' end
    when 'PIC_REASSIGNED' then case when v_language = 'id' then 'Pergantian PIC' else 'PIC Reassignment' end
    when 'PROJECT_PLAN_APPROVED' then case when v_language = 'id' then 'Rencana Proyek Disetujui' else 'Project Plan Approved' end
    when 'PROJECT_PLAN_REJECTED' then case when v_language = 'id' then 'Rencana Proyek Ditolak' else 'Project Plan Rejected' end
  end;

  if v_title is null then
    raise exception 'Invalid notification type' using errcode = '22023';
  end if;

  v_message := case
    when p_type in ('PIC_ASSIGNED', 'PIC_REASSIGNED') then
      case when v_language = 'id'
        then 'Anda ditugaskan sebagai PIC proyek. Buka proyek untuk melihat tugas.'
        else 'You are assigned as project PIC. Open the project to view your tasks.'
      end
    when p_type = 'PROJECT_PLAN_APPROVED' then
      case when v_language = 'id'
        then case when v_project_name is not null then 'Rencana proyek ''' || v_project_name || ''' telah disetujui.' else 'Rencana fase proyek telah disetujui.' end
        else case when v_project_name is not null then 'Project plan for ''' || v_project_name || ''' has been approved.' else 'The project phase plan has been approved.' end
      end
    else
      case when v_language = 'id'
        then case when v_project_name is not null then 'Rencana proyek ''' || v_project_name || ''' ditolak dan perlu revisi.' else 'Rencana proyek ditolak dan perlu revisi.' end
        else case when v_project_name is not null then 'Project plan for ''' || v_project_name || ''' was rejected and requires revision.' else 'Project plan was rejected and requires revision.' end
      end
  end;

  insert into public.notifications(user_id, type, title, message, project_id, action_url, in_app_visible)
  values (p_recipient, p_type, v_title, v_message, p_project_id, '/projects/' || p_project_id::text, v_in_app)
  returning id into v_id;

  if v_telegram then
    insert into public.notification_deliveries(notification_id, channel, status, failure_kind, next_retry_at, attempt_count)
    values (v_id, 'TELEGRAM', 'FAILED', 'RETRYABLE', pg_catalog.now(), 0);
  end if;
end;
$$;

revoke all on function public.queue_pic_operation_notification(uuid, uuid, text) from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;
