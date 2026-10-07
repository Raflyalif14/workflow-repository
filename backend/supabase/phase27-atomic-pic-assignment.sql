-- Stop old PIC writers before applying. Additive; no SQL is executed by the agent.
begin;
do $$ begin
  if to_regprocedure('public.review_project_phase_plan(uuid,uuid,uuid,text,text,uuid)') is null
    or to_regprocedure('public.close_project_at_pra_tender(uuid,uuid)') is null
    or to_regprocedure('public.update_project_estimated_value(uuid,uuid,text,timestamptz,uuid)') is null then
    raise exception 'Phase 27 requires Phases 24, 25 and 26';
  end if;
end $$;
alter table public.projects add column pic_revision bigint not null default 0 check(pic_revision >= 0);
alter table public.activity_logs add column pic_assignment_audit jsonb;
alter table public.project_assignments add column phase_id uuid references public.project_phases(id);
create table public.project_pic_requests (
  project_id uuid not null references public.projects(id) on delete cascade,
  request_id uuid not null, actor_id uuid not null references public.users(id),
  operation text not null check(operation in ('ASSIGN','PLAN_REVIEW')),
  payload jsonb not null, result jsonb not null, created_at timestamptz not null default now(),
  primary key(project_id,request_id)
);
alter table public.project_pic_requests enable row level security;
revoke all on public.project_pic_requests from public,anon,authenticated;
grant select,insert,delete on public.project_pic_requests to service_role;
create policy project_pic_requests_service on public.project_pic_requests for all to service_role using(true) with check(true);

-- All project PIC writers (including phase reset) advance the same ABA-safe revision.
-- Old direct UPDATE writers fail closed rather than creating partial assignments.
create function public.guard_pic_revision() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
  if new.pic_id is distinct from old.pic_id or new.active_phase_id is distinct from old.active_phase_id then
    if current_setting('workflow.pic_write_project',true) is distinct from old.id::text then
      raise exception 'PIC writer must use Phase 27' using errcode='55000';
    end if;
    new.pic_revision := old.pic_revision + 1;
  elsif new.pic_revision is distinct from old.pic_revision then
    raise exception 'PIC revision is server-managed' using errcode='42501';
  end if;
  return new;
end $$;
create trigger guard_pic_revision before update on public.projects for each row execute function public.guard_pic_revision();

-- Preserve new-project initialization; it also advances phase identity revision.
create or replace function public.initialize_project_phase() returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare v_s public.scenarios%rowtype; v_id uuid; v_key text;
begin
  select * into v_s from public.scenarios where id = new.scenario_id;
  if v_s.workflow_model <> 'OPERATIONAL_V2' or v_s.workflow_version <> 2 then return new; end if;
  v_key := case v_s.name when 'Pra-Tender' then 'PRA_TENDER' when 'On Submission Tender' then 'ON_SUBMISSION_TENDER' end;
  if v_key is null then raise exception 'Unsupported phase scenario'; end if;
  if exists(select 1 from jsonb_array_elements_text(new.selected_document_keys) k
    where not exists(select 1 from public.output_document_stage_catalog c where c.document_key = k and c.group_key = v_key))
    or exists(select 1 from public.output_document_stage_catalog c where c.group_key = v_key and c.is_required
      and not (new.selected_document_keys ? c.document_key)) then raise exception 'Invalid initial phase scope'; end if;
  insert into public.project_phases(project_id,scenario_id,phase_key,selected_document_keys)
    values(new.id,new.scenario_id,v_key,new.selected_document_keys) returning id into v_id;
  perform set_config('workflow.pic_write_project',new.id::text,true);
  update public.projects set active_phase_id = v_id,current_scenario_id = new.scenario_id,phase_migration_state = 'READY' where id = new.id;
  perform set_config('workflow.pic_write_project','',true);
  return new;
end $$;

-- Durable notification records + existing Telegram retry queue; channels independent.
create function public.queue_pic_operation_notification(p_project_id uuid,p_recipient uuid,p_type text)
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare v_language text; v_in_app boolean; v_telegram boolean; v_id uuid; v_title text; v_message text;
begin
  if p_recipient is null then return; end if;
  select u.preferred_language,coalesce(np.in_app_enabled,true),
    coalesce(np.telegram_enabled,false) and nullif(btrim(np.telegram_chat_id),'') is not null
  into v_language,v_in_app,v_telegram from public.users u
    left join public.notification_preferences np on np.user_id=u.id where u.id=p_recipient and u.is_active;
  if not found or not(v_in_app or v_telegram) then return; end if;
  v_title := case p_type when 'PIC_ASSIGNED' then case when v_language='id' then 'Penugasan PIC' else 'PIC Assignment' end
    when 'PIC_REASSIGNED' then case when v_language='id' then 'Pergantian PIC' else 'PIC Reassignment' end
    when 'PROJECT_PLAN_APPROVED' then case when v_language='id' then 'Rencana Proyek Disetujui' else 'Project Plan Approved' end
    when 'PROJECT_PLAN_REJECTED' then case when v_language='id' then 'Rencana Proyek Ditolak' else 'Project Plan Rejected' end end;
  if v_title is null then raise exception 'Invalid notification type' using errcode='22023'; end if;
  v_message := case when p_type in ('PIC_ASSIGNED','PIC_REASSIGNED') then
    case when v_language='id' then 'Anda ditugaskan sebagai PIC proyek. Buka proyek untuk melihat tugas.' else 'You are assigned as project PIC. Open the project to view your tasks.' end
    when p_type='PROJECT_PLAN_APPROVED' then
    case when v_language='id' then 'Rencana fase proyek telah disetujui.' else 'The project phase plan has been approved.' end
    else case when v_language='id' then 'Rencana fase proyek membutuhkan revisi.' else 'The project phase plan requires revision.' end end;
  insert into public.notifications(user_id,type,title,message,project_id,action_url,in_app_visible)
    values(p_recipient,p_type,v_title,v_message,p_project_id,'/projects/'||p_project_id::text,v_in_app) returning id into v_id;
  if v_telegram then
    insert into public.notification_deliveries(notification_id,channel,status,failure_kind,next_retry_at,attempt_count)
      values(v_id,'TELEGRAM','FAILED','RETRYABLE',now(),0);
  end if;
end $$;

create function public.record_pic_assignment(p_project_id uuid,p_actor uuid,p_before uuid,p_after uuid,p_reason text,p_phase uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare v_history uuid; v_action text; v_revision bigint;
begin
  if p_before is not distinct from p_after then return null; end if;
  v_action:=case when p_before is null then 'PIC_ASSIGNED' else 'PIC_REASSIGNED' end;
  insert into public.project_assignments(project_id,pic_id,previous_pic_id,assigned_by,assignment_type,reason,phase_id)
    values(p_project_id,p_after,p_before,p_actor,case when p_before is null then 'INITIAL_ASSIGNMENT' else 'REASSIGNMENT' end,nullif(btrim(p_reason),''),p_phase) returning id into v_history;
  select pic_revision into v_revision from public.projects where id=p_project_id;
  insert into public.activity_logs(project_id,user_id,action,description,pic_assignment_audit)
    values(p_project_id,p_actor,v_action,v_action,jsonb_build_object('object_type','PROJECT','object_id',p_project_id,
      'before',p_before,'after',p_after,'phase_id',p_phase,'revision',v_revision,'assignment_id',v_history));
  perform public.queue_pic_operation_notification(p_project_id,p_after,v_action);
  return v_history;
end $$;

create function public.assign_project_pic_atomic(p_project_id uuid,p_actor_id uuid,p_pic_id uuid,p_reason text,p_expected_revision bigint,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_p public.projects%rowtype; v_actor public.users%rowtype; v_target public.users%rowtype;
  v_s public.scenarios%rowtype; v_phase public.project_phases%rowtype; v_receipt public.project_pic_requests%rowtype;
  v_payload jsonb; v_result jsonb; v_history uuid; v_first uuid; v_assign uuid; v_next uuid; v_first_role text;
begin
  select * into v_p from public.projects where id=p_project_id for update;
  if not found then raise exception 'Forbidden' using errcode='42501'; end if;
  -- Lock users in stable ID order after project, before phase/approval/milestones.
  perform id from public.users where id in(p_actor_id,p_pic_id) order by id for share;
  select * into v_actor from public.users where id=p_actor_id;
  if not found or v_actor.role <> 'HEAD_SA' or v_actor.is_active is distinct from true then raise exception 'Forbidden' using errcode='42501'; end if;
  if v_p.status is distinct from 'ACTIVE' or v_p.is_postponed is distinct from false then raise exception 'PIC not editable' using errcode='55000'; end if;
  if v_p.active_phase_id is not null then
    select * into v_phase from public.project_phases where id=v_p.active_phase_id and project_id=v_p.id for update;
    if not found or v_p.phase_migration_state <> 'READY' or v_phase.status <> 'ACTIVE'
      or v_phase.scenario_id is distinct from v_p.current_scenario_id then raise exception 'Invalid active phase' using errcode='55000'; end if;
  elsif v_p.phase_migration_state <> 'LEGACY_REVIEW' then raise exception 'Invalid legacy state' using errcode='55000'; end if;
  if p_request_id is null or p_expected_revision is null or p_expected_revision<0 or p_pic_id is null
    or length(coalesce(p_reason,''))>2000 then raise exception 'Invalid input' using errcode='22023'; end if;
  v_payload:=jsonb_build_object('pic_id',p_pic_id,'reason',nullif(btrim(p_reason),''),'expected_revision',p_expected_revision);
  select * into v_receipt from public.project_pic_requests where project_id=p_project_id and request_id=p_request_id;
  if found then
    if v_receipt.actor_id is distinct from p_actor_id or v_receipt.operation<>'ASSIGN' or v_receipt.payload<>v_payload then
      raise exception 'Conflicting request' using errcode='40001'; end if;
    if (v_receipt.result->>'phase_id')::uuid is distinct from v_p.active_phase_id then raise exception 'Phase changed' using errcode='40001'; end if;
    -- Read current state rather than returning the historical PIC as current.
    return v_receipt.result||jsonb_build_object('replayed',true,'current_pic_id',v_p.pic_id,'pic_revision',v_p.pic_revision::text);
  end if;
  if v_p.pic_revision<>p_expected_revision then raise exception 'Stale PIC revision' using errcode='40001'; end if;
  select * into v_target from public.users where id=p_pic_id;
  if not found or v_target.is_active is distinct from true or not(v_target.role='SA' or v_target.role='HEAD_SA' and v_target.id=p_actor_id) then
    raise exception 'Invalid target PIC' using errcode='22023'; end if;
  select * into v_s from public.scenarios where id=coalesce(v_p.current_scenario_id,v_p.scenario_id);
  if not found or not coalesce(((v_s.workflow_model='OPERATIONAL_V2' and v_s.workflow_version=2) or (v_s.workflow_model='LEGACY' and v_s.workflow_version=1)),false) then
    raise exception 'Unsupported workflow' using errcode='55000'; end if;
  if v_s.workflow_model='OPERATIONAL_V2' and not coalesce((select a.status='APPROVED' from public.project_plan_approvals a
    where a.project_id=v_p.id and a.phase_id is not distinct from v_p.active_phase_id order by a.submitted_at desc,a.id desc limit 1),false) then
    raise exception 'Plan not approved' using errcode='55000'; end if;
  if exists(select 1 from public.project_milestones pm left join public.workflow_stages ws on ws.id=pm.workflow_stage_id
    where pm.project_id=v_p.id and pm.phase_id is not distinct from v_p.active_phase_id and (ws.id is null or ws.scenario_id is distinct from v_s.id)) then
    raise exception 'Milestone stage mapping invalid' using errcode='55000'; end if;
  if v_p.pic_id is not distinct from p_pic_id then
    v_result:=jsonb_build_object('phase_id',v_p.active_phase_id,'changed',false,'replayed',false,'current_pic_id',v_p.pic_id,'pic_revision',v_p.pic_revision::text);
  else
    if v_p.pic_id is not null and nullif(btrim(p_reason),'') is null then raise exception 'Reason required' using errcode='22023'; end if;
    -- Stable phase ID + stage role. Completed/approved ownership is historical.
    perform pm.id from public.project_milestones pm where pm.project_id=v_p.id
      and pm.phase_id is not distinct from v_p.active_phase_id order by pm.id for update;
    perform set_config('workflow.pic_write_project',p_project_id::text,true);
    update public.projects set pic_id=p_pic_id,updated_at=clock_timestamp() where id=p_project_id returning pic_revision into v_p.pic_revision;
    update public.project_milestones pm set pic_id=p_pic_id,updated_at=clock_timestamp() from public.workflow_stages ws
      where pm.project_id=v_p.id and pm.phase_id is not distinct from v_p.active_phase_id and ws.id=pm.workflow_stage_id
        and ws.scenario_id=v_s.id and ws.is_active and (ws.default_role='SA' or ws.default_role='HEAD_SA' and v_target.role='HEAD_SA')
        and pm.status not in('COMPLETED','APPROVED');
    if v_s.workflow_model='OPERATIONAL_V2' then
      select pm.id,ws.default_role into v_first,v_first_role from public.project_milestones pm join public.workflow_stages ws on ws.id=pm.workflow_stage_id
        where pm.project_id=v_p.id and pm.phase_id is not distinct from v_p.active_phase_id order by pm.step_order,pm.id limit 1;
      if v_first is null or not(v_first_role='SA' or v_first_role='HEAD_SA' and v_target.role='HEAD_SA') then
        raise exception 'First milestone invalid' using errcode='55000'; end if;
      update public.project_milestones set status='IN_PROGRESS',updated_at=clock_timestamp() where id=v_first and status='CREATED';
    else
      -- Phase 2 legacy canonical Assign PIC identity is step 5/HEAD_SA, never display name.
      select pm.id into v_assign from public.project_milestones pm join public.workflow_stages ws on ws.id=pm.workflow_stage_id
        where pm.project_id=v_p.id and pm.phase_id is null and pm.status='IN_PROGRESS'
          and ws.default_role='HEAD_SA' and (ws.stage_key='ASSIGN_PIC' or ws.stage_key is null and ws.step_order=5);
      if v_assign is not null then
        update public.project_milestones set status='COMPLETED',completed_at=now(),updated_at=now() where id=v_assign;
        insert into public.activity_logs(project_id,user_id,action,description) values(v_p.id,p_actor_id,'MILESTONE_COMPLETED','ASSIGN_PIC');
        select pm.id into v_next from public.project_milestones pm join public.workflow_stages ws on ws.id=pm.workflow_stage_id
          where pm.project_id=v_p.id and pm.phase_id is null and pm.step_order>(select step_order from public.project_milestones where id=v_assign)
            order by pm.step_order,pm.id limit 1;
        if v_next is not null and exists(select 1 from public.project_milestones pm join public.workflow_stages ws on ws.id=pm.workflow_stage_id
          where pm.id=v_next and pm.status='CREATED' and (ws.default_role='SA' or ws.default_role='HEAD_SA')) then
          update public.project_milestones set status='IN_PROGRESS',updated_at=now() where id=v_next;
          insert into public.activity_logs(project_id,user_id,action,description) values(v_p.id,p_actor_id,'MILESTONE_STARTED','AFTER_ASSIGN_PIC');
        end if;
      end if;
    end if;
    v_history:=public.record_pic_assignment(v_p.id,p_actor_id,v_p.pic_id,p_pic_id,p_reason,v_p.active_phase_id);
    perform set_config('workflow.pic_write_project','',true);
    v_result:=jsonb_build_object('phase_id',v_p.active_phase_id,'changed',true,'replayed',false,'assignment_id',v_history,'current_pic_id',p_pic_id,'pic_revision',v_p.pic_revision::text);
  end if;
  insert into public.project_pic_requests(project_id,request_id,actor_id,operation,payload,result) values(v_p.id,p_request_id,p_actor_id,'ASSIGN',v_payload,v_result);
  return v_result;
end $$;

-- Keep Phase 24's atomic plan body intact behind a private wrapper.
alter function public.review_project_phase_plan(uuid,uuid,uuid,text,text,uuid) rename to review_project_phase_plan_phase24_core;
revoke all on function public.review_project_phase_plan_phase24_core(uuid,uuid,uuid,text,text,uuid) from public,anon,authenticated,service_role;
create function public.review_project_plan_pic_atomic(p_project_id uuid,p_approval_id uuid,p_actor_id uuid,p_decision text,p_note text,p_pic_id uuid,p_expected_revision bigint,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_p public.projects%rowtype; v_a public.project_plan_approvals%rowtype; v_s public.scenarios%rowtype;
  v_phase public.project_phases%rowtype; v_target public.users%rowtype; v_r public.project_pic_requests%rowtype;
  v_payload jsonb; v_result jsonb; v_first uuid; v_history uuid; v_revision bigint; v_saved uuid;
begin
  select * into v_p from public.projects where id=p_project_id for update;
  if not found then raise exception 'Forbidden' using errcode='42501'; end if;
  perform id from public.users where id in(p_actor_id,p_pic_id) order by id for share;
  if not exists(select 1 from public.users where id=p_actor_id and role='HEAD_SA' and is_active) then raise exception 'Forbidden' using errcode='42501'; end if;
  if coalesce(v_p.is_postponed,false) or v_p.status not in('DRAFT','ACTIVE') then raise exception 'Plan not editable' using errcode='55000'; end if;
  if v_p.active_phase_id is not null then
    select * into v_phase from public.project_phases where id=v_p.active_phase_id and project_id=v_p.id for update;
    if not found or v_p.phase_migration_state<>'READY' or v_phase.scenario_id is distinct from v_p.current_scenario_id then
      raise exception 'Invalid active phase' using errcode='55000'; end if;
  elsif v_p.phase_migration_state<>'LEGACY_REVIEW' then raise exception 'Invalid legacy state' using errcode='55000'; end if;
  if p_request_id is null or p_expected_revision is null or p_expected_revision<0 or p_approval_id is null
    or p_decision is null or p_decision not in('APPROVED','REJECTED') or length(coalesce(p_note,''))>2000
    or p_decision='REJECTED' and nullif(btrim(p_note),'') is null then raise exception 'Invalid input' using errcode='22023'; end if;
  v_payload:=jsonb_build_object('approval_id',p_approval_id,'decision',p_decision,'note',nullif(btrim(p_note),''),'pic_id',p_pic_id,'expected_revision',p_expected_revision);
  select * into v_r from public.project_pic_requests where project_id=v_p.id and request_id=p_request_id;
  if found then
    if v_r.actor_id is distinct from p_actor_id or v_r.operation<>'PLAN_REVIEW' or v_r.payload<>v_payload then raise exception 'Conflicting request' using errcode='40001'; end if;
    -- A replay must still belong to the active phase; never display saved PIC as current.
    if (v_r.result->>'phase_id')::uuid is distinct from v_p.active_phase_id then raise exception 'Phase changed' using errcode='40001'; end if;
    return v_r.result||jsonb_build_object('replayed',true,'current_pic_id',v_p.pic_id,'pic_revision',v_p.pic_revision::text,'project_status',v_p.status);
  end if;
  if v_p.pic_revision<>p_expected_revision then raise exception 'Stale PIC revision' using errcode='40001'; end if;
  if v_p.status<>'DRAFT' then raise exception 'Plan no longer pending' using errcode='40001'; end if;
  select * into v_a from public.project_plan_approvals where id=p_approval_id and project_id=v_p.id
    and phase_id is not distinct from v_p.active_phase_id and status='PENDING' for update;
  if not found then raise exception 'Plan no longer pending' using errcode='40001'; end if;
  select * into v_s from public.scenarios where id=coalesce(v_p.current_scenario_id,v_p.scenario_id);
  if not found or v_s.workflow_model is distinct from 'OPERATIONAL_V2' or v_s.workflow_version is distinct from 2 then raise exception 'Unsupported plan' using errcode='55000'; end if;
  if exists(select 1 from public.project_milestones pm left join public.workflow_stages ws on ws.id=pm.workflow_stage_id
    where pm.project_id=v_p.id and pm.phase_id is not distinct from v_p.active_phase_id and (ws.id is null or ws.scenario_id is distinct from v_s.id)) then
    raise exception 'Milestone stage mapping invalid' using errcode='55000'; end if;
  if p_decision='APPROVED' then
    select * into v_target from public.users where id=p_pic_id;
    if not found or v_target.is_active is distinct from true or not(v_target.role='SA' or v_target.role='HEAD_SA' and v_target.id=p_actor_id)
      or v_p.pic_id is not null then raise exception 'Invalid target PIC' using errcode='22023'; end if;
  end if;
  perform pm.id from public.project_milestones pm where pm.project_id=v_p.id
    and pm.phase_id is not distinct from v_p.active_phase_id order by pm.id for update;
  perform set_config('workflow.pic_write_project',p_project_id::text,true);
  if v_p.active_phase_id is not null then
    -- Preserve original approval, assignment and activation as ONE transaction.
    v_a:=public.review_project_phase_plan_phase24_core(p_project_id,p_approval_id,p_actor_id,p_decision,p_note,p_pic_id);
    if p_decision='APPROVED' then
      select id into v_history from public.project_assignments where project_id=v_p.id and assigned_by=p_actor_id and pic_id=p_pic_id
        order by created_at desc,id desc limit 1;
    end if;
  else
    -- Existing LEGACY_REVIEW V2 projects remain unclassified; no phase conversion.
    if p_decision='APPROVED' then
      if not exists(select 1 from public.project_milestones where project_id=v_p.id and phase_id is null)
        or exists(select 1 from public.project_milestones where project_id=v_p.id and phase_id is null
          and (status<>'CREATED' or start_date is null or duration_working_days is null or duration_working_days<=0 or due_date is null)) then
        raise exception 'Plan milestones not ready' using errcode='55000'; end if;
      select pm.id into v_first from public.project_milestones pm join public.workflow_stages ws on ws.id=pm.workflow_stage_id
        where pm.project_id=v_p.id and pm.phase_id is null order by pm.step_order,pm.id limit 1;
      if not exists(select 1 from public.project_milestones pm join public.workflow_stages ws on ws.id=pm.workflow_stage_id
        where pm.id=v_first and (ws.default_role='SA' or ws.default_role='HEAD_SA' and v_target.role='HEAD_SA')) then raise exception 'First milestone invalid' using errcode='55000'; end if;
      update public.project_milestones pm set pic_id=p_pic_id,updated_at=now() from public.workflow_stages ws
        where pm.project_id=v_p.id and pm.phase_id is null and ws.id=pm.workflow_stage_id and ws.scenario_id=v_s.id
          and (ws.default_role='SA' or ws.default_role='HEAD_SA' and v_target.role='HEAD_SA');
      update public.project_milestones set status='IN_PROGRESS',updated_at=now() where id=v_first;
      update public.projects set pic_id=p_pic_id,status='ACTIVE',updated_at=now() where id=v_p.id;
    end if;
    update public.project_plan_approvals set status=p_decision,reviewed_by=p_actor_id,review_note=nullif(btrim(p_note),''),reviewed_at=now(),updated_at=now() where id=v_a.id returning * into v_a;
  end if;
  select pic_revision into v_revision from public.projects where id=v_p.id;
  if p_decision='APPROVED' then
    if v_history is null then v_history:=public.record_pic_assignment(v_p.id,p_actor_id,null,p_pic_id,null,null);
    else
      update public.project_assignments set phase_id=v_p.active_phase_id where id=v_history;
      insert into public.activity_logs(project_id,user_id,action,description,pic_assignment_audit)
        values(v_p.id,p_actor_id,'PIC_ASSIGNED','PIC_ASSIGNED',jsonb_build_object('object_type','PROJECT','object_id',v_p.id,
          'before',null,'after',p_pic_id,'phase_id',v_p.active_phase_id,'revision',v_revision,'assignment_id',v_history));
      perform public.queue_pic_operation_notification(v_p.id,p_pic_id,'PIC_ASSIGNED');
    end if;
  end if;
  insert into public.activity_logs(project_id,user_id,action,description) values(v_p.id,p_actor_id,'PROJECT_PLAN_'||p_decision,'PROJECT_PLAN_'||p_decision);
  perform public.queue_pic_operation_notification(v_p.id,v_p.sales_id,'PROJECT_PLAN_'||p_decision);
  perform set_config('workflow.pic_write_project','',true);
  v_result:=to_jsonb(v_a)||jsonb_build_object('phase_id',v_p.active_phase_id,'current_pic_id',case when p_decision='APPROVED' then p_pic_id else v_p.pic_id end,
    'pic_revision',v_revision::text,'project_status',case when p_decision='APPROVED' then 'ACTIVE' else 'DRAFT' end,'replayed',false);
  insert into public.project_pic_requests(project_id,request_id,actor_id,operation,payload,result) values(v_p.id,p_request_id,p_actor_id,'PLAN_REVIEW',v_payload,v_result);
  return v_result;
end $$;

-- Phase transition keeps its existing Sales decision/idempotency policy.
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
  if v_p.status is distinct from 'ACTIVE' then raise exception 'Project is not active.'; end if;
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
  perform set_config('workflow.pic_write_project',p_project_id::text,true);
  update public.projects set active_phase_id = v_id,current_scenario_id = v_scenario,
    status = 'DRAFT',pic_id = null,selected_document_keys = '[]'::jsonb,updated_at = now() where id = p_project_id;
  perform set_config('workflow.pic_write_project','',true);
  insert into public.activity_logs(project_id,user_id,action,description,pic_assignment_audit)
    values(p_project_id,p_sales_id,'PIC_PHASE_RESET','PIC_PHASE_RESET',jsonb_build_object('object_type','PROJECT','object_id',p_project_id,
      'before',v_p.pic_id,'after',null,'phase_id',v_id,'revision',(select pic_revision from public.projects where id=p_project_id)));
  perform public.sync_phase_output_scope(p_project_id,p_sales_id,p_selected_keys);
  update public.project_phases set sales_decision = 'CONTINUE_TENDER',sales_decided_by = p_sales_id,sales_decided_at = now() where id = v_phase.id;
  insert into public.activity_logs(project_id,user_id,action,description) values(p_project_id,p_sales_id,'PRA_TENDER_DECIDED','CONTINUE_TENDER');
  insert into public.activity_logs(project_id,user_id,action,description)
    values(p_project_id,p_sales_id,'PROJECT_PHASE_CREATED','ON_SUBMISSION_TENDER');
  return query select v_id,true;
end $$;


revoke all on function public.guard_pic_revision(),public.queue_pic_operation_notification(uuid,uuid,text),
  public.record_pic_assignment(uuid,uuid,uuid,uuid,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.assign_project_pic_atomic(uuid,uuid,uuid,text,bigint,uuid),
  public.review_project_plan_pic_atomic(uuid,uuid,uuid,text,text,uuid,bigint,uuid) from public,anon,authenticated;
grant execute on function public.assign_project_pic_atomic(uuid,uuid,uuid,text,bigint,uuid),
  public.review_project_plan_pic_atomic(uuid,uuid,uuid,text,text,uuid,bigint,uuid) to service_role;
commit;
