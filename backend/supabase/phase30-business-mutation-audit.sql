-- Additive Phase 30. Stop old writers; never run automatically.
begin;
do $$ begin
  if to_regclass('public.document_repository_access') is null or
    to_regprocedure('public.review_project_output_document_snapshot(uuid,uuid,uuid,text,uuid,text,jsonb)') is null then
    raise exception 'Phase 30 requires Phase 24-29';
  end if;
  if to_regprocedure('public.record_output_upload_outcome(uuid,uuid,uuid,text,boolean)') is null then
    raise exception 'Phase 30 requires Phase 23 upload outcome tracking';
  end if;
end $$;
alter table public.activity_logs add column business_audit jsonb;
create table public.project_business_requests (
  project_id uuid not null references public.projects(id) on delete cascade,
  request_id uuid not null, actor_id uuid not null references public.users(id),
  action text not null, payload jsonb not null, expected_updated_at timestamptz not null,
  result jsonb not null, created_at timestamptz not null default now(),
  primary key(project_id,request_id)
);
alter table public.project_business_requests enable row level security;
revoke all on public.project_business_requests from public,anon,authenticated,service_role;
grant select on public.project_business_requests to service_role;

-- Explicit safe snapshots; never serialize entire rows or Storage references.
create function public.business_project_state(p_id uuid) returns jsonb
language sql security definer set search_path=pg_catalog as $$
  select jsonb_build_object('name',name,'customer',customer,'scenario_id',scenario_id,
    'status',status,'is_postponed',is_postponed,'postpone_reason',postpone_reason,
    'final_contract_value',final_contract_value::text,'loss_reason',loss_reason)
  from public.projects where id=p_id
$$;
create function public.business_draft_state(p_id uuid) returns jsonb
language sql security definer set search_path=pg_catalog as $$
  select jsonb_build_object('files',coalesce(jsonb_agg(jsonb_build_object(
    'id',f.id,'name',f.file_name,'size',f.file_size) order by df.position,df.file_id),'[]'::jsonb))
  from public.project_output_document_draft_files df
  join public.project_output_document_files f on f.id=df.file_id where df.output_document_id=p_id
$$;
create function public.business_timeline_state(p_project uuid,p_phase uuid) returns jsonb
language sql security definer set search_path=pg_catalog as $$
  select jsonb_build_object('schedule',coalesce(jsonb_agg(jsonb_build_object('id',id,
    'start_date',start_date,'duration_working_days',duration_working_days,'due_date',due_date)
    order by step_order,id),'[]'::jsonb)) from public.project_milestones
    where project_id=p_project and phase_id is not distinct from p_phase
$$;
create function public.record_business_change(p_project uuid,p_actor uuid,p_action text,p_type text,p_object uuid,
  p_before jsonb,p_after jsonb,p_request uuid default null) returns void
language plpgsql security definer set search_path=pg_catalog as $$
declare v_fields jsonb; v_key text;
begin
  if p_before is not distinct from p_after then return; end if;
  if p_type not in ('PROJECT','MILESTONE','OUTPUT_DOCUMENT','PROJECT_PLAN') or p_object is null
    or p_actor is null or jsonb_typeof(p_before) <> 'object' or jsonb_typeof(p_after) <> 'object'
    or exists(select 1 from jsonb_object_keys(p_before || p_after) k where k not in
      ('name','customer','scenario_id','estimated_revenue','status','is_postponed','postpone_reason','final_contract_value','loss_reason',
       'files','selected_keys','schedule','start_date','duration_working_days','due_date','request_note','review_note',
       'version_id','version_number','file_count','phase_id')) then
    raise exception 'Invalid business audit projection' using errcode='22023';
  end if;
  select coalesce(jsonb_agg(k order by k),'[]'::jsonb) into v_fields
    from jsonb_object_keys(p_before || p_after) k where p_before->k is distinct from p_after->k;
  if p_type='OUTPUT_DOCUMENT' then select document_key into v_key from public.project_output_documents where id=p_object;
  elsif p_type='MILESTONE' then select ws.stage_key into v_key from public.project_milestones pm join public.workflow_stages ws on ws.id=pm.workflow_stage_id where pm.id=p_object; end if;
  insert into public.activity_logs(project_id,user_id,action,description,business_audit)
  values(p_project,p_actor,p_action,p_action,jsonb_build_object('object_type',p_type,'object_id',p_object,
    'object_key',v_key,'changed_fields',v_fields,'before',p_before,'after',p_after,'request_id',p_request));
end $$;

create function public.mutate_project_business(p_project_id uuid,p_actor_id uuid,p_action text,p_payload jsonb,
  p_expected_updated_at timestamptz,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
#variable_conflict use_column
declare v_p public.projects%rowtype; v_u public.users%rowtype; v_r public.project_business_requests%rowtype;
  v_m public.project_milestones%rowtype; v_a public.milestone_deadline_approvals%rowtype;
  v_h public.milestone_deadline_history%rowtype; v_plan public.project_plan_approvals%rowtype;
  v_before jsonb; v_after jsonb; v_result jsonb; v_item jsonb; v_object uuid:=p_project_id;
  v_type text:='PROJECT'; v_action text; v_id uuid; v_phase uuid;
begin
  select * into v_p from public.projects where id=p_project_id for update;
  if not found then raise exception 'Project not found' using errcode='42501'; end if;
  select * into v_u from public.users where id=p_actor_id for share;
  if not found or v_u.is_active is not true then raise exception 'Forbidden' using errcode='42501'; end if;
  if (p_action='INFO' and not(v_u.role='SUPER_ADMIN' or (v_u.role='SALES' and v_p.sales_id=p_actor_id)))
    or (p_action in ('DEADLINE_REVIEW','LEGACY_PLAN_REVIEW') and v_u.role<>'HEAD_SA')
    or (p_action not in ('INFO','DEADLINE_REVIEW','LEGACY_PLAN_REVIEW') and (v_u.role<>'SALES' or v_p.sales_id is distinct from p_actor_id)) then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  if p_action is null or p_action not in ('INFO','POSTPONE','RESUME','OUTCOME','TIMELINE','PLAN_SUBMIT','DEADLINE_REQUEST','DEADLINE_REVIEW','SCOPE','LEGACY_PLAN_REVIEW')
    or p_request_id is null or p_expected_updated_at is null or jsonb_typeof(p_payload)<>'object' then
    raise exception 'Invalid business request' using errcode='22023';
  end if;
  select * into v_r from public.project_business_requests where project_id=p_project_id and request_id=p_request_id;
  if found then
    if v_r.actor_id is distinct from p_actor_id or v_r.action is distinct from p_action
      or v_r.payload is distinct from p_payload or v_r.expected_updated_at is distinct from p_expected_updated_at then
      raise exception 'Request receipt conflicts' using errcode='40001';
    end if;
    return jsonb_build_object('value',v_r.result,'replayed',true);
  end if;
  if v_p.updated_at is distinct from p_expected_updated_at then
    raise exception 'Business data changed; review current data' using errcode='40001';
  end if;
  v_before:=public.business_project_state(v_p.id);
  if p_action='INFO' then
    if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('name','customer','scenario_id','selected_keys'))
      or (p_payload ? 'name' and (p_payload->>'name' is null or length(btrim(p_payload->>'name'))<2))
      or (p_payload ? 'customer' and (p_payload->>'customer' is null or length(btrim(p_payload->>'customer'))<2)) then
      raise exception 'Invalid project information' using errcode='22023';
    end if;
    if p_payload ? 'scenario_id' and (p_payload->>'scenario_id')::uuid is distinct from v_p.scenario_id then
      if exists(select 1 from public.project_milestones where project_id=v_p.id)
        or not exists(select 1 from public.scenarios where id=(p_payload->>'scenario_id')::uuid and is_active) then
        raise exception 'Scenario cannot be changed after workflow milestones exist' using errcode='22023';
      end if;
    end if;
    if p_payload ? 'selected_keys' then
      if v_p.active_phase_id is not null then perform public.sync_phase_output_scope(v_p.id,p_actor_id,array(select jsonb_array_elements_text(p_payload->'selected_keys')));
      else perform public.sync_draft_output_scope(v_p.id,p_actor_id,array(select jsonb_array_elements_text(p_payload->'selected_keys'))); end if;
    end if;
    update public.projects set name=coalesce(p_payload->>'name',name),customer=coalesce(p_payload->>'customer',customer),
      scenario_id=coalesce((p_payload->>'scenario_id')::uuid,scenario_id) where id=v_p.id;
    v_action:='PROJECT_UPDATED';
  elsif p_action='SCOPE' then
    if v_p.active_phase_id is not null then select to_jsonb(r) into v_result from public.sync_phase_output_scope(v_p.id,p_actor_id,array(select jsonb_array_elements_text(p_payload->'selected_keys'))) r;
    else select to_jsonb(r) into v_result from public.sync_draft_output_scope(v_p.id,p_actor_id,array(select jsonb_array_elements_text(p_payload->'selected_keys'))) r; end if;
    v_after:=v_before;v_action:='PROJECT_SCOPE_CHANGED';
  elsif p_action='POSTPONE' then
    if v_p.status<>'ACTIVE' or coalesce(v_p.is_postponed,false) then raise exception 'Only ACTIVE projects can be postponed' using errcode='55000'; end if;
    if nullif(btrim(p_payload->>'reason'),'') is null then raise exception 'Reason required' using errcode='22023'; end if;
    update public.projects set status='POSTPONED',is_postponed=true,postponed_at=now(),postponed_by=p_actor_id,
      postpone_reason=p_payload->>'reason' where id=v_p.id;
    v_action:='PROJECT_POSTPONED';
  elsif p_action='RESUME' then
    if v_p.status<>'POSTPONED' or v_p.is_postponed is not true then raise exception 'Only POSTPONED projects can be resumed' using errcode='55000'; end if;
    update public.projects set status='ACTIVE',is_postponed=false where id=v_p.id;
    v_action:='PROJECT_RESUMED';
  elsif p_action='OUTCOME' then
    if v_p.status<>'WAITING_RESULT' then raise exception 'Project is not awaiting result' using errcode='55000'; end if;
    if p_payload->>'outcome' not in ('WON','LOST') or p_payload->>'outcome' is null
      or (p_payload->>'outcome'='WON' and (coalesce((p_payload->>'final_contract_value')::numeric,0)<=0
        or (p_payload->>'final_contract_value')::numeric='NaN'::numeric or p_payload ? 'loss_reason'))
      or (p_payload->>'outcome'='LOST' and (nullif(btrim(p_payload->>'loss_reason'),'') is null
        or length(p_payload->>'loss_reason')>2000 or p_payload ? 'final_contract_value')) then
      raise exception 'Invalid project result' using errcode='22023';
    end if;
    update public.projects set status=p_payload->>'outcome',final_contract_value=(p_payload->>'final_contract_value')::numeric,
      loss_reason=p_payload->>'loss_reason',outcome_decided_by=p_actor_id,outcome_decided_at=now() where id=v_p.id;
    v_action:='PROJECT_'||(p_payload->>'outcome');
  elsif p_action in ('TIMELINE','PLAN_SUBMIT') then
    if v_p.status<>'DRAFT' or coalesce(v_p.is_postponed,false) then raise exception 'Project plan is not editable' using errcode='55000'; end if;
    if exists(select 1 from public.project_plan_approvals where project_id=v_p.id
      and phase_id is not distinct from v_p.active_phase_id and status='PENDING') then
      raise exception 'Project plan is pending review' using errcode='55000';
    end if;
    if p_action='TIMELINE' then
      v_before:=public.business_timeline_state(v_p.id,v_p.active_phase_id);
      if jsonb_typeof(p_payload->'milestones') is distinct from 'array' or jsonb_array_length(p_payload->'milestones')=0
        or (select count(*) from jsonb_array_elements(p_payload->'milestones')) <>
           (select count(distinct e->>'id') from jsonb_array_elements(p_payload->'milestones') e) then
        raise exception 'Invalid timeline' using errcode='22023';
      end if;
      for v_item in select * from jsonb_array_elements(p_payload->'milestones') loop
        select * into v_m from public.project_milestones where id=(v_item->>'id')::uuid and project_id=v_p.id
          and phase_id is not distinct from v_p.active_phase_id for update;
        if not found or (v_item->>'duration_working_days')::integer<=0
          or v_item->>'start_date' is null or v_item->>'due_date' is null then
          raise exception 'Invalid milestone timeline' using errcode='22023';
        end if;
        update public.project_milestones set start_date=(v_item->>'start_date')::date,
          duration_working_days=(v_item->>'duration_working_days')::integer,due_date=(v_item->>'due_date')::date,
          updated_at=now() where id=v_m.id;
      end loop;
      v_after:=public.business_timeline_state(v_p.id,v_p.active_phase_id);
      v_action:='PROJECT_TIMELINE_UPDATED';
      v_result:=p_payload->'milestones';
    else
      -- Service verifies working-day/holiday calculation before RPC; compare that exact verified snapshot under lock.
      if p_payload->'schedule' is distinct from (public.business_timeline_state(v_p.id,v_p.active_phase_id)->'schedule') then
        raise exception 'Timeline changed; review current data' using errcode='40001';
      end if;
      insert into public.project_plan_approvals(project_id,phase_id,requested_by,status,request_note)
        values(v_p.id,v_p.active_phase_id,p_actor_id,'PENDING',nullif(btrim(p_payload->>'request_note'),'')) returning * into v_plan;
      v_before:=jsonb_build_object('status',null,'request_note',null,'phase_id',v_p.active_phase_id);
      v_after:=jsonb_build_object('status','PENDING','request_note',v_plan.request_note,'phase_id',v_p.active_phase_id);
      v_type:='PROJECT_PLAN';v_object:=v_plan.id;v_action:='PROJECT_PLAN_SUBMITTED';
      v_result:=jsonb_build_object('id',v_plan.id,'project_id',v_p.id,'status',v_plan.status,
        'request_note',v_plan.request_note,'submitted_at',v_plan.submitted_at);
    end if;
  elsif p_action='LEGACY_PLAN_REVIEW' then
    if v_p.active_phase_id is not null or v_p.status<>'DRAFT' or coalesce(v_p.is_postponed,false)
      or not exists(select 1 from public.scenarios where id=v_p.scenario_id and workflow_model='LEGACY' and workflow_version=1) then
      raise exception 'Legacy plan is not editable' using errcode='55000'; end if;
    select * into v_plan from public.project_plan_approvals where id=(p_payload->>'approval_id')::uuid
      and project_id=v_p.id and phase_id is null and status='PENDING' for update;
    if not found then raise exception 'Plan no longer pending' using errcode='40001'; end if;
    if p_payload->>'decision' is null or p_payload->>'decision' not in ('APPROVED','REJECTED')
      or (p_payload->>'decision'='REJECTED' and nullif(btrim(p_payload->>'note'),'') is null) then
      raise exception 'Invalid plan decision' using errcode='22023'; end if;
    v_type:='PROJECT_PLAN';v_object:=v_plan.id;
    v_before:=jsonb_build_object('status',v_plan.status,'review_note',v_plan.review_note,'phase_id',null);
    if p_payload->>'decision'='APPROVED' then
      if p_payload->'schedule' is distinct from (public.business_timeline_state(v_p.id,null)->'schedule') then
        raise exception 'Timeline changed; review current data' using errcode='40001'; end if;
      select * into v_m from public.project_milestones where project_id=v_p.id and phase_id is null
        and step_order=2 for update;
      if not found or v_m.status<>'IN_PROGRESS' then raise exception 'Set Deadline is not ready' using errcode='40001'; end if;
      update public.project_milestones set status='COMPLETED',completed_at=now(),updated_at=now() where id=v_m.id;
      update public.projects set status='ACTIVE',is_postponed=false where id=v_p.id;
    end if;
    update public.project_plan_approvals set status=p_payload->>'decision',reviewed_by=p_actor_id,
      review_note=nullif(btrim(p_payload->>'note'),''),reviewed_at=now(),updated_at=now()
      where id=v_plan.id returning * into v_plan;
    v_after:=jsonb_build_object('status',v_plan.status,'review_note',v_plan.review_note,'phase_id',null);
    v_action:='PROJECT_PLAN_'||v_plan.status;
    v_result:=to_jsonb(v_plan)||jsonb_build_object('project_status',case when v_plan.status='APPROVED' then 'ACTIVE' else 'DRAFT' end,
      'set_deadline_milestone',case when v_plan.status='APPROVED' then jsonb_build_object('id',v_m.id,'name',v_m.name,'status','COMPLETED','completed_at',now()) else null end);
  elsif p_action in ('DEADLINE_REQUEST','DEADLINE_REVIEW') then
    if v_p.status<>'ACTIVE' or coalesce(v_p.is_postponed,false) then raise exception 'Project is not active' using errcode='55000'; end if;
    select * into v_m from public.project_milestones where id=(p_payload->>'milestone_id')::uuid and project_id=v_p.id for update;
    if not found or v_m.status in ('COMPLETED','APPROVED') then raise exception 'Milestone is not editable' using errcode='55000'; end if;
    v_type:='MILESTONE';v_object:=v_m.id;
    v_before:=jsonb_build_object('start_date',v_m.start_date,'duration_working_days',v_m.duration_working_days,'due_date',v_m.due_date,'status',null);
    if p_action='DEADLINE_REQUEST' then
      if exists(select 1 from public.milestone_deadline_approvals where milestone_id=v_m.id and status='PENDING') then
        raise exception 'Deadline review is pending' using errcode='55000';
      end if;
      if (v_m.start_date is not null or v_m.due_date is not null or v_m.duration_working_days is not null)
        and nullif(btrim(p_payload->>'reason'),'') is null then raise exception 'Reason required' using errcode='22023'; end if;
      if coalesce((p_payload->>'duration_working_days')::integer,0)<=0 or p_payload->>'start_date' is null
        or p_payload->>'due_date' is null then raise exception 'Invalid deadline' using errcode='22023'; end if;
      insert into public.milestone_deadline_history(milestone_id,start_date,duration_working_days,due_date,changed_by,change_reason)
        values(v_m.id,(p_payload->>'start_date')::date,(p_payload->>'duration_working_days')::integer,
          (p_payload->>'due_date')::date,p_actor_id,coalesce(nullif(btrim(p_payload->>'reason'),''),'Initial deadline')) returning * into v_h;
      insert into public.milestone_deadline_approvals(milestone_id,deadline_history_id,status,requested_by)
        values(v_m.id,v_h.id,'PENDING',p_actor_id) returning * into v_a;
      v_after:=jsonb_build_object('start_date',v_h.start_date,'duration_working_days',v_h.duration_working_days,'due_date',v_h.due_date,'status','PENDING','request_note',v_h.change_reason);
      v_action:='DEADLINE_CHANGE_REQUESTED';
    else
      select * into v_a from public.milestone_deadline_approvals where id=(p_payload->>'approval_id')::uuid and milestone_id=v_m.id for update;
      if not found or v_a.status<>'PENDING' then raise exception 'Deadline approval is no longer pending' using errcode='40001'; end if;
      if p_payload->>'decision' not in ('APPROVED','REJECTED') or p_payload->>'decision' is null
        or (p_payload->>'decision'='REJECTED' and nullif(btrim(p_payload->>'note'),'') is null) then raise exception 'Invalid deadline decision' using errcode='22023'; end if;
      select * into v_h from public.milestone_deadline_history where id=v_a.deadline_history_id;
      if not found then raise exception 'Deadline history missing' using errcode='55000'; end if;
      v_before:=v_before||jsonb_build_object('status','PENDING');
      update public.milestone_deadline_approvals set status=p_payload->>'decision',reviewed_by=p_actor_id,
        review_note=nullif(btrim(p_payload->>'note'),''),reviewed_at=now() where id=v_a.id returning * into v_a;
      if v_a.status='APPROVED' then update public.project_milestones set start_date=v_h.start_date,
        duration_working_days=v_h.duration_working_days,due_date=v_h.due_date,updated_at=now() where id=v_m.id returning * into v_m; end if;
      v_after:=jsonb_build_object('start_date',v_m.start_date,'duration_working_days',v_m.duration_working_days,'due_date',v_m.due_date,'status',v_a.status,'review_note',v_a.review_note);
      v_action:='DEADLINE_'||v_a.status;
    end if;
    v_result:=jsonb_build_object('approval',jsonb_build_object('id',v_a.id,'milestone_id',v_a.milestone_id,
      'deadline_history_id',v_a.deadline_history_id,'status',v_a.status,'requested_by',v_a.requested_by,
      'reviewed_by',v_a.reviewed_by,'review_note',v_a.review_note,'requested_at',v_a.requested_at,'reviewed_at',v_a.reviewed_at),
      'effective_deadline',jsonb_build_object('start_date',v_m.start_date,'duration_working_days',v_m.duration_working_days,'due_date',v_m.due_date));
  end if;
  v_after:=coalesce(v_after,public.business_project_state(v_p.id));
  if v_before is distinct from v_after then update public.projects set updated_at=clock_timestamp() where id=v_p.id; end if;
  perform public.record_business_change(v_p.id,p_actor_id,v_action,v_type,v_object,v_before,v_after,p_request_id);
  v_result:=coalesce(v_result,jsonb_build_object('project_id',v_p.id));
  insert into public.project_business_requests(project_id,request_id,actor_id,action,payload,expected_updated_at,result)
    values(v_p.id,p_request_id,p_actor_id,p_action,p_payload,p_expected_updated_at,v_result);
  return jsonb_build_object('value',v_result,'replayed',false);
end $$;
revoke all on function public.mutate_project_business(uuid,uuid,text,jsonb,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.mutate_project_business(uuid,uuid,text,jsonb,timestamptz,uuid) to service_role;

-- Wrap unchanged Phase22/28 cores: their CAS, receipt, retry and file policies remain authoritative.
alter function public.mutate_project_output_document_draft(uuid,bigint,uuid,text,uuid,uuid,uuid,text,text,bigint,text,timestamptz,text)
  rename to mutate_output_draft_phase30_core;
revoke all on function public.mutate_output_draft_phase30_core(uuid,bigint,uuid,text,uuid,uuid,uuid,text,text,bigint,text,timestamptz,text) from public,anon,authenticated,service_role;
create function public.mutate_project_output_document_draft(
  p_output_document_id uuid,p_expected_revision bigint,p_request_id uuid,p_action text,p_actor_id uuid,
  p_target_file_id uuid,p_file_id uuid,p_file_name text,p_storage_path text,p_file_size bigint,
  p_mime_type text,p_uploaded_at timestamptz,p_content_sha256 text)
returns table(draft_revision bigint,file_id uuid,applied boolean)
language plpgsql security definer set search_path=pg_catalog as $$
declare v_d public.project_output_documents%rowtype; v_before jsonb; v_result record;
begin
  v_d:=public.lock_output_file_document(p_output_document_id);
  v_before:=public.business_draft_state(v_d.id);
  select * into v_result from public.mutate_output_draft_phase30_core(p_output_document_id,p_expected_revision,p_request_id,
    p_action,p_actor_id,p_target_file_id,p_file_id,p_file_name,p_storage_path,p_file_size,p_mime_type,p_uploaded_at,p_content_sha256);
  if v_result.applied then
    perform public.record_business_change(v_d.project_id,p_actor_id,'OUTPUT_DRAFT_'||p_action,'OUTPUT_DOCUMENT',v_d.id,
      v_before,public.business_draft_state(v_d.id),p_request_id);
  end if;
  return query select v_result.draft_revision,v_result.file_id,v_result.applied;
end $$;
revoke all on function public.mutate_project_output_document_draft(uuid,bigint,uuid,text,uuid,uuid,uuid,text,text,bigint,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.mutate_project_output_document_draft(uuid,bigint,uuid,text,uuid,uuid,uuid,text,text,bigint,text,timestamptz,text) to service_role;

alter function public.submit_project_output_document_draft(uuid,bigint,uuid,uuid,text) rename to submit_output_draft_phase30_core;
revoke all on function public.submit_output_draft_phase30_core(uuid,bigint,uuid,uuid,text) from public,anon,authenticated,service_role;
create function public.submit_project_output_document_draft(p_output_document_id uuid,p_expected_revision bigint,p_request_id uuid,p_actor_id uuid,p_submission_note text)
returns table(document_id uuid,version_id uuid,version_number integer,draft_revision bigint,new_status text,created boolean)
language plpgsql security definer set search_path=pg_catalog as $$
declare v_d public.project_output_documents%rowtype; v_result record; v_count integer;
begin
  v_d:=public.lock_output_file_document(p_output_document_id);
  select * into v_result from public.submit_output_draft_phase30_core(p_output_document_id,p_expected_revision,p_request_id,p_actor_id,p_submission_note);
  if v_result.created then
    select count(*) into v_count from public.project_output_document_version_files where version_id=v_result.version_id;
    perform public.record_business_change(v_d.project_id,p_actor_id,'OUTPUT_DOCUMENTS_SUBMITTED','OUTPUT_DOCUMENT',v_d.id,
      jsonb_build_object('status',v_d.status,'version_id',v_d.current_version_id),
      jsonb_build_object('status',v_result.new_status,'version_id',v_result.version_id,'version_number',v_result.version_number,'file_count',v_count),p_request_id);
  end if;
  return query select v_result.document_id,v_result.version_id,v_result.version_number,v_result.draft_revision,v_result.new_status,v_result.created;
end $$;
revoke all on function public.submit_project_output_document_draft(uuid,bigint,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.submit_project_output_document_draft(uuid,bigint,uuid,uuid,text) to service_role;

alter function public.sync_phase_output_scope(uuid,uuid,text[]) rename to sync_phase_output_scope_phase30_core;
revoke all on function public.sync_phase_output_scope_phase30_core(uuid,uuid,text[]) from public,anon,authenticated,service_role;
create function public.sync_phase_output_scope(p_project_id uuid,p_sales_id uuid,p_selected_keys text[])
returns table(selected_keys text[],milestone_count integer)
language plpgsql security definer set search_path=pg_catalog as $$
declare v_before jsonb; v_result record;
begin
  perform 1 from public.projects where id=p_project_id for update;
  select jsonb_build_object('selected_keys',coalesce((select jsonb_agg(k order by k) from jsonb_array_elements_text(coalesce(selected_document_keys,'[]'::jsonb)) k),'[]'::jsonb))
    into v_before from public.projects where id=p_project_id;
  select * into v_result from public.sync_phase_output_scope_phase30_core(p_project_id,p_sales_id,p_selected_keys);
  perform public.record_business_change(p_project_id,p_sales_id,'PROJECT_SCOPE_CHANGED','PROJECT',p_project_id,
    v_before,jsonb_build_object('selected_keys',to_jsonb(v_result.selected_keys)));
  return query select v_result.selected_keys,v_result.milestone_count;
end $$;
revoke all on function public.sync_phase_output_scope(uuid,uuid,text[]) from public,anon,authenticated;
grant execute on function public.sync_phase_output_scope(uuid,uuid,text[]) to service_role;

alter function public.sync_draft_output_scope(uuid,uuid,text[]) rename to sync_draft_output_scope_phase30_core;
revoke all on function public.sync_draft_output_scope_phase30_core(uuid,uuid,text[]) from public,anon,authenticated,service_role;
create function public.sync_draft_output_scope(p_project_id uuid,p_sales_id uuid,p_selected_keys text[])
returns table(selected_keys text[],milestone_count integer)
language plpgsql security definer set search_path=pg_catalog as $$
declare v_before jsonb; v_result record;
begin
  perform 1 from public.projects where id=p_project_id for update;
  select jsonb_build_object('selected_keys',coalesce((select jsonb_agg(k order by k) from jsonb_array_elements_text(coalesce(selected_document_keys,'[]'::jsonb)) k),'[]'::jsonb))
    into v_before from public.projects where id=p_project_id;
  select * into v_result from public.sync_draft_output_scope_phase30_core(p_project_id,p_sales_id,p_selected_keys);
  perform public.record_business_change(p_project_id,p_sales_id,'PROJECT_SCOPE_CHANGED','PROJECT',p_project_id,
    v_before,jsonb_build_object('selected_keys',to_jsonb(v_result.selected_keys)));
  return query select v_result.selected_keys,v_result.milestone_count;
end $$;
revoke all on function public.sync_draft_output_scope(uuid,uuid,text[]) from public,anon,authenticated;
grant execute on function public.sync_draft_output_scope(uuid,uuid,text[]) to service_role;

alter function public.complete_phase_final_sales_milestone_with_outcome(uuid,uuid,text,numeric,text,text[]) rename to complete_phase_final_sales_milestone_with_outcome_phase30_core;
revoke all on function public.complete_phase_final_sales_milestone_with_outcome_phase30_core(uuid,uuid,text,numeric,text,text[]) from public,anon,authenticated,service_role;
create function public.complete_phase_final_sales_milestone_with_outcome(p_milestone_id uuid,p_sales_id uuid,p_outcome text,p_final_contract_value numeric,p_loss_reason text,p_required_output_keys text[])
returns table(changed boolean,project_id uuid,milestone_name text,completed_at timestamptz,project_status text)
language plpgsql security definer set search_path=pg_catalog as $$
declare v_project uuid; v_before jsonb; v_result record; v_status text;
begin
  select p.id into v_project from public.projects p join public.project_milestones m on m.project_id=p.id
    where m.id=p_milestone_id for update of p;
  select status into v_status from public.project_milestones where id=p_milestone_id for update;
  v_before:=public.business_project_state(v_project);
  select * into v_result from public.complete_phase_final_sales_milestone_with_outcome_phase30_core(p_milestone_id,p_sales_id,p_outcome,p_final_contract_value,p_loss_reason,p_required_output_keys);
  if v_result.changed and exists(select 1 from public.projects where id=v_project and active_phase_id is not null) then
    perform public.record_business_change(v_project,p_sales_id,'PROJECT_'||p_outcome,'PROJECT',v_project,
      v_before,public.business_project_state(v_project));
    perform public.record_business_change(v_project,p_sales_id,'MILESTONE_COMPLETED','MILESTONE',p_milestone_id,
      jsonb_build_object('status',v_status),jsonb_build_object('status','COMPLETED'));
  end if;
  return query select v_result.changed,v_result.project_id,v_result.milestone_name,v_result.completed_at,v_result.project_status;
end $$;
revoke all on function public.complete_phase_final_sales_milestone_with_outcome(uuid,uuid,text,numeric,text,text[]) from public,anon,authenticated;
grant execute on function public.complete_phase_final_sales_milestone_with_outcome(uuid,uuid,text,numeric,text,text[]) to service_role;

alter function public.complete_final_sales_milestone_with_outcome(uuid,uuid,text,numeric,text,text[]) rename to complete_final_sales_milestone_with_outcome_phase30_core;
revoke all on function public.complete_final_sales_milestone_with_outcome_phase30_core(uuid,uuid,text,numeric,text,text[]) from public,anon,authenticated,service_role;
create function public.complete_final_sales_milestone_with_outcome(p_milestone_id uuid,p_sales_id uuid,p_outcome text,p_final_contract_value numeric,p_loss_reason text,p_required_output_keys text[])
returns table(changed boolean,project_id uuid,milestone_name text,completed_at timestamptz,project_status text)
language plpgsql security definer set search_path=pg_catalog as $$
declare v_project uuid; v_before jsonb; v_result record; v_status text;
begin
  select p.id into v_project from public.projects p join public.project_milestones m on m.project_id=p.id
    where m.id=p_milestone_id for update of p;
  select status into v_status from public.project_milestones where id=p_milestone_id for update;
  v_before:=public.business_project_state(v_project);
  select * into v_result from public.complete_final_sales_milestone_with_outcome_phase30_core(p_milestone_id,p_sales_id,p_outcome,p_final_contract_value,p_loss_reason,p_required_output_keys);
  if v_result.changed then
    perform public.record_business_change(v_project,p_sales_id,'PROJECT_'||p_outcome,'PROJECT',v_project,
      v_before,public.business_project_state(v_project));
    perform public.record_business_change(v_project,p_sales_id,'MILESTONE_COMPLETED','MILESTONE',p_milestone_id,
      jsonb_build_object('status',v_status),jsonb_build_object('status','COMPLETED'));
  end if;
  return query select v_result.changed,v_result.project_id,v_result.milestone_name,v_result.completed_at,v_result.project_status;
end $$;
revoke all on function public.complete_final_sales_milestone_with_outcome(uuid,uuid,text,numeric,text,text[]) from public,anon,authenticated;
grant execute on function public.complete_final_sales_milestone_with_outcome(uuid,uuid,text,numeric,text,text[]) to service_role;

-- Creation actor is the verified Sales ID written by the protected server endpoint.
-- Compensation deletion cascades this log; surviving metadata is never missing its creation audit.
create function public.audit_project_creation_phase30() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
  if not exists(select 1 from public.users where id=new.sales_id and role='SALES' and is_active is true) then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  perform public.record_business_change(new.id,new.sales_id,'PROJECT_CREATED','PROJECT',new.id,'{}'::jsonb,
    jsonb_build_object('name',new.name,'customer',new.customer,'scenario_id',new.scenario_id,
      'estimated_revenue',new.estimated_revenue::text,'status',new.status));
  return new;
end $$;
create trigger project_creation_business_audit after insert on public.projects
  for each row execute function public.audit_project_creation_phase30();
-- Internal helpers and cores must not become alternate service/client writers.
revoke all on function public.record_business_change(uuid,uuid,text,text,uuid,jsonb,jsonb,uuid),
  public.business_project_state(uuid),public.business_draft_state(uuid),public.business_timeline_state(uuid,uuid),
  public.audit_project_creation_phase30() from public,anon,authenticated,service_role;

alter function public.complete_phase_sa_milestone(uuid,uuid,boolean) rename to complete_phase_sa_milestone_phase30_core;
revoke all on function public.complete_phase_sa_milestone_phase30_core(uuid,uuid,boolean) from public,anon,authenticated,service_role;
create function public.complete_phase_sa_milestone(p_milestone_id uuid,p_actor_id uuid,p_allow_empty boolean default false)
returns table(changed boolean,project_id uuid)
language plpgsql security definer set search_path=pg_catalog as $$
declare v_project uuid; v_status text; v_result record; v_phase uuid;
begin
  select p.id,p.active_phase_id into v_project,v_phase from public.projects p join public.project_milestones m on m.project_id=p.id
    where m.id=p_milestone_id for update of p;
  select status into v_status from public.project_milestones where id=p_milestone_id for update;
  select * into v_result from public.complete_phase_sa_milestone_phase30_core(p_milestone_id,p_actor_id,p_allow_empty);
  if v_result.changed and v_phase is not null then
    perform public.record_business_change(v_project,p_actor_id,'MILESTONE_COMPLETED','MILESTONE',p_milestone_id,
      jsonb_build_object('status',v_status),jsonb_build_object('status','COMPLETED'));
  end if;
  return query select v_result.changed,v_result.project_id;
end $$;
revoke all on function public.complete_phase_sa_milestone(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.complete_phase_sa_milestone(uuid,uuid,boolean) to service_role;

alter function public.complete_sa_output_milestone(uuid,uuid,boolean) rename to complete_sa_output_milestone_phase30_core;
revoke all on function public.complete_sa_output_milestone_phase30_core(uuid,uuid,boolean) from public,anon,authenticated,service_role;
create function public.complete_sa_output_milestone(p_milestone_id uuid,p_actor_id uuid,p_allow_empty boolean default false)
returns table(changed boolean,project_id uuid)
language plpgsql security definer set search_path=pg_catalog as $$
declare v_project uuid; v_status text; v_result record; v_phase uuid;
begin
  select p.id,p.active_phase_id into v_project,v_phase from public.projects p join public.project_milestones m on m.project_id=p.id
    where m.id=p_milestone_id for update of p;
  select status into v_status from public.project_milestones where id=p_milestone_id for update;
  select * into v_result from public.complete_sa_output_milestone_phase30_core(p_milestone_id,p_actor_id,p_allow_empty);
  if v_result.changed  then
    perform public.record_business_change(v_project,p_actor_id,'MILESTONE_COMPLETED','MILESTONE',p_milestone_id,
      jsonb_build_object('status',v_status),jsonb_build_object('status','COMPLETED'));
  end if;
  return query select v_result.changed,v_result.project_id;
end $$;
revoke all on function public.complete_sa_output_milestone(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.complete_sa_output_milestone(uuid,uuid,boolean) to service_role;

-- Manual non-SA completion for legacy stages. Preserve role/lifecycle policy; no new workflow progression.
create function public.complete_business_milestone(p_milestone_id uuid,p_actor_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare v_p public.projects%rowtype;v_m public.project_milestones%rowtype;v_role text;v_stage text;
begin
  select p.* into v_p from public.projects p join public.project_milestones m on m.project_id=p.id where m.id=p_milestone_id for update of p;
  select * into v_m from public.project_milestones where id=p_milestone_id for update;
  if not found then raise exception 'Milestone not found' using errcode='42501'; end if;
  select role into v_role from public.users where id=p_actor_id and is_active is true for share;
  select default_role into v_stage from public.workflow_stages where id=v_m.workflow_stage_id;
  if v_role is null or not((v_stage='SALES' and v_role='SALES' and v_p.sales_id=p_actor_id) or (v_stage='HEAD_SA' and v_role='HEAD_SA')) then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  if lower(btrim(v_m.name))='assign pic' or (v_stage='SALES' and not exists(select 1 from public.project_milestones
    where project_id=v_p.id and phase_id is not distinct from v_p.active_phase_id and step_order>v_m.step_order)) then
    raise exception 'Use the existing PIC or final result operation' using errcode='55000';
  end if;
  if v_m.status='COMPLETED' then return jsonb_build_object('id',v_m.id,'status',v_m.status,'completed_at',v_m.completed_at); end if;
  if v_p.status<>'ACTIVE' or coalesce(v_p.is_postponed,false) or v_m.status<>'IN_PROGRESS'
    or v_m.phase_id is distinct from v_p.active_phase_id then raise exception 'Milestone is not editable' using errcode='55000'; end if;
  update public.project_milestones set status='COMPLETED',completed_at=now(),updated_at=now() where id=v_m.id;
  perform public.record_business_change(v_p.id,p_actor_id,'MILESTONE_COMPLETED','MILESTONE',v_m.id,
    jsonb_build_object('status',v_m.status),jsonb_build_object('status','COMPLETED'));
  return jsonb_build_object('id',v_m.id,'status','COMPLETED','completed_at',now());
end $$;
revoke all on function public.complete_business_milestone(uuid,uuid) from public,anon,authenticated;
grant execute on function public.complete_business_milestone(uuid,uuid) to service_role;

-- The durable deletion receipt, rather than cascading activity, is the deletion evidence.
alter function public.delete_project_with_cleanup(uuid,text,uuid) rename to delete_project_with_cleanup_phase30_core;
revoke all on function public.delete_project_with_cleanup_phase30_core(uuid,text,uuid) from public,anon,authenticated,service_role;
create function public.delete_project_with_cleanup(p_project_id uuid,p_confirmation text,p_initiated_by uuid)
returns table(cleanup_id uuid,storage_paths jsonb,storage_object_count integer)
language plpgsql security definer set search_path=pg_catalog as $$
declare v_count bigint;v_result record;
begin
  perform 1 from public.projects where id=p_project_id for update;
  select count(*) into v_count from public.project_business_requests where project_id=p_project_id;
  select * into v_result from public.delete_project_with_cleanup_phase30_core(p_project_id,p_confirmation,p_initiated_by);
  update public.project_deletion_cleanups set dependency_counts=dependency_counts||jsonb_build_object('project_business_requests',v_count) where id=v_result.cleanup_id;
  return query select v_result.cleanup_id,v_result.storage_paths,v_result.storage_object_count;
end $$;
revoke all on function public.delete_project_with_cleanup(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.delete_project_with_cleanup(uuid,text,uuid) to service_role;

commit;
