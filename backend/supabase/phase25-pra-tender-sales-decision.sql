-- Phase 25: explicit Sales decision after Pra-Tender; apply after Phase 24.
-- No outputs, snapshots, files or Storage objects are changed or removed.
begin;

do $$ begin
  if to_regclass('public.project_phases') is null or
    to_regprocedure('public.continue_project_tender_phase(uuid,uuid,text[])') is null then
    raise exception 'Phase 25 requires Phase 24';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.projects'::regclass
    and conname = 'projects_status_check' and position('COMPLETED' in pg_get_constraintdef(oid)) > 0) then
    raise exception 'Phase 25 requires the existing COMPLETED project status';
  end if;
end $$;

-- A Telegram-only record must never appear in the application's notification feed.
-- Existing records/default producers retain their current in-app visibility.
alter table public.notifications add column in_app_visible boolean not null default true;

alter table public.project_phases
  add column sales_decision text,
  add column sales_decided_by uuid references public.users(id) on delete set null,
  add column sales_decided_at timestamptz,
  add constraint pra_tender_sales_decision_check check (
    (sales_decision is null and sales_decided_by is null and sales_decided_at is null) or
    (sales_decision is not null and phase_key = 'PRA_TENDER' and status = 'COMPLETED'
      and sales_decision in ('CONTINUE_TENDER','CLOSE_PRA_TENDER') and sales_decided_at is not null));

create function public.assert_pra_tender_decision_ready(p_project_id uuid,p_phase_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog as $$
declare v_phase public.project_phases%rowtype;
begin
  select * into v_phase from public.project_phases where id = p_phase_id and project_id = p_project_id;
  if not found or v_phase.phase_key <> 'PRA_TENDER' or v_phase.status <> 'COMPLETED'
    or not exists(select 1 from public.project_milestones where project_id = p_project_id and phase_id = p_phase_id)
    or exists(select 1 from public.project_milestones where project_id = p_project_id and phase_id = p_phase_id and status not in ('COMPLETED','APPROVED'))
    or exists(select 1 from public.output_document_stage_catalog c left join public.project_output_documents od
      on od.project_id = p_project_id and od.phase_id = p_phase_id and od.document_key = c.document_key
      where c.group_key = 'PRA_TENDER' and (c.is_required or v_phase.selected_document_keys ? c.document_key)
        and (od.id is null or od.status <> 'APPROVED' or not od.is_selected))
    or exists(select 1 from public.project_output_documents where project_id = p_project_id and phase_id = p_phase_id
      and (is_required or is_selected) and status <> 'APPROVED') then
    raise exception 'Pra-Tender is not completed.';
  end if;
end $$;

create or replace function public.continue_project_tender_phase(p_project_id uuid,p_sales_id uuid,p_selected_keys text[])
returns table(phase_id uuid,created boolean) language plpgsql security definer set search_path = pg_catalog as $$
#variable_conflict use_column
declare v_p public.projects%rowtype; v_phase public.project_phases%rowtype; v_id uuid; v_scenario uuid;
begin
  select * into v_p from public.projects where id = p_project_id for update;
  if not found or v_p.sales_id is distinct from p_sales_id
    or not exists(select 1 from public.users where id = p_sales_id and role = 'SALES' and is_active) then raise exception 'Forbidden'; end if;
  if exists(select 1 from public.project_phases where project_id = p_project_id and phase_key = 'PRA_TENDER' and sales_decision = 'CLOSE_PRA_TENDER') then raise exception 'Pra-Tender decision conflicts with the saved decision.' using errcode = '40001'; end if;
  if coalesce(v_p.is_postponed,false) or v_p.status not in ('ACTIVE','DRAFT') then raise exception 'Project is not active.'; end if;
  if v_p.active_phase_id is null then raise exception 'Legacy phase classification requires manual review.'; end if;
  -- A replay returns the already-created phase without changing scope, schedule or intents.
  select id into v_id from public.project_phases where project_id = p_project_id and phase_key = 'ON_SUBMISSION_TENDER';
  if found then return query select v_id,false; return; end if;
  if v_p.status <> 'ACTIVE' then raise exception 'Project is not active.'; end if;
  select * into v_phase from public.project_phases where id = v_p.active_phase_id and project_id = p_project_id;
  if v_phase.phase_key <> 'PRA_TENDER' or v_phase.status <> 'COMPLETED'
    or exists(select 1 from public.project_milestones where phase_id = v_phase.id and status not in ('COMPLETED','APPROVED'))
    or exists(select 1 from public.output_document_stage_catalog c left join public.project_output_documents od
      on od.phase_id = v_phase.id and od.document_key = c.document_key
      where c.group_key = 'PRA_TENDER' and (c.is_required or v_phase.selected_document_keys ? c.document_key)
        and (od.id is null or od.status <> 'APPROVED')) then raise exception 'Pra-Tender is not completed.'; end if;
  perform public.assert_pra_tender_decision_ready(p_project_id,v_phase.id);
  if p_selected_keys is null or exists(select 1 from unnest(p_selected_keys) k
    where k is null or not exists(select 1 from public.output_document_stage_catalog c where c.document_key = k and c.group_key = 'ON_SUBMISSION_TENDER')) then
    raise exception 'Invalid phase output selection.';
  end if;
  select id into strict v_scenario from public.scenarios where name = 'On Submission Tender' and is_active and workflow_model = 'OPERATIONAL_V2' and workflow_version = 2;
  insert into public.project_phases(project_id,scenario_id,phase_key)
    values(p_project_id,v_scenario,'ON_SUBMISSION_TENDER') returning id into v_id;
  update public.projects set active_phase_id = v_id,current_scenario_id = v_scenario,
    status = 'DRAFT',pic_id = null,selected_document_keys = '[]'::jsonb,updated_at = now() where id = p_project_id;
  perform public.sync_phase_output_scope(p_project_id,p_sales_id,p_selected_keys);
  update public.project_phases set sales_decision = 'CONTINUE_TENDER',sales_decided_by = p_sales_id,sales_decided_at = now() where id = v_phase.id;
  insert into public.activity_logs(project_id,user_id,action,description) values(p_project_id,p_sales_id,'PRA_TENDER_DECIDED','CONTINUE_TENDER');
  insert into public.activity_logs(project_id,user_id,action,description)
    values(p_project_id,p_sales_id,'PROJECT_PHASE_CREATED','ON_SUBMISSION_TENDER');
  return query select v_id,true;
end $$;

create function public.close_project_at_pra_tender(p_project_id uuid,p_sales_id uuid)
returns table(phase_id uuid,closed boolean) language plpgsql security definer set search_path = pg_catalog as $$
#variable_conflict use_column
declare v_p public.projects%rowtype; v_phase public.project_phases%rowtype;
begin
  -- Same first lock as Continue: competing Yes/No requests serialize here.
  select * into v_p from public.projects where id = p_project_id for update;
  if not found or v_p.sales_id is distinct from p_sales_id or
    not exists(select 1 from public.users where id = p_sales_id and role = 'SALES' and is_active) then
    raise exception 'Forbidden';
  end if;
  if coalesce(v_p.is_postponed,false) then raise exception 'Project is not active.'; end if;
  if v_p.active_phase_id is null then raise exception 'Legacy phase classification requires manual review.'; end if;
  select * into v_phase from public.project_phases where project_id = p_project_id and phase_key = 'PRA_TENDER' for update;
  if not found then raise exception 'Pra-Tender is not completed.'; end if;
  if v_phase.sales_decision = 'CONTINUE_TENDER' or exists(select 1 from public.project_phases
    where project_id = p_project_id and phase_key = 'ON_SUBMISSION_TENDER') then
    raise exception 'Pra-Tender decision conflicts with the saved decision.' using errcode = '40001';
  end if;
  if v_phase.sales_decision = 'CLOSE_PRA_TENDER' then
    if v_p.status <> 'COMPLETED' or v_p.active_phase_id is distinct from v_phase.id then
      raise exception 'Pra-Tender decision conflicts with the saved decision.' using errcode = '40001';
    end if;
    return query select v_phase.id,false; return;
  end if;
  if v_p.status <> 'ACTIVE' or v_p.active_phase_id is distinct from v_phase.id then
    raise exception 'Project is not active.';
  end if;
  perform public.assert_pra_tender_decision_ready(p_project_id,v_phase.id);
  update public.project_phases set sales_decision = 'CLOSE_PRA_TENDER',sales_decided_by = p_sales_id,sales_decided_at = now()
    where id = v_phase.id;
  update public.projects set status = 'COMPLETED',updated_at = now() where id = p_project_id;
  insert into public.activity_logs(project_id,user_id,action,description)
    values(p_project_id,p_sales_id,'PRA_TENDER_DECIDED','CLOSE_PRA_TENDER');
  -- Snapshot independent channel eligibility once; first decision only.
  with recipients as (
    select u.id,u.preferred_language,
      coalesce(np.in_app_enabled,true) as in_app_visible,
      coalesce(np.telegram_enabled,false) and nullif(btrim(np.telegram_chat_id),'') is not null as telegram_eligible
    from public.users u left join public.notification_preferences np on np.user_id = u.id
    where u.is_active and (u.role = 'HEAD_SA' or u.id = v_p.pic_id)
  ), inserted as (
    insert into public.notifications(user_id,type,title,message,project_id,action_url,in_app_visible)
    select r.id,'PRA_TENDER_CLOSED',
      case when r.preferred_language = 'id' then 'Proyek selesai di Pra-Tender' else 'Project completed at Pra-Tender' end,
      case when r.preferred_language = 'id' then 'Sales menutup proyek tanpa melanjutkan ke tender. Dokumen dan riwayat tetap tersedia.'
        else 'Sales closed the project without continuing to tender. Documents and history remain available.' end,
      p_project_id,'/projects/' || p_project_id::text || '#project-phase-panel',r.in_app_visible
    from recipients r where r.in_app_visible or r.telegram_eligible
    returning id,user_id
  )
  -- Follow the existing Phase 21 queue contract consumed by the retry worker.
  insert into public.notification_deliveries(notification_id,channel,status,failure_kind,next_retry_at,attempt_count)
    select i.id,'TELEGRAM','FAILED','RETRYABLE',now(),0 from inserted i join recipients r on r.id = i.user_id
    where r.telegram_eligible;
  return query select v_phase.id,true;
end $$;

revoke all on function public.assert_pra_tender_decision_ready(uuid,uuid),
  public.close_project_at_pra_tender(uuid,uuid),public.continue_project_tender_phase(uuid,uuid,text[]) from public,anon,authenticated;
grant execute on function public.assert_pra_tender_decision_ready(uuid,uuid),
  public.close_project_at_pra_tender(uuid,uuid),public.continue_project_tender_phase(uuid,uuid,text[]) to service_role;
commit;
