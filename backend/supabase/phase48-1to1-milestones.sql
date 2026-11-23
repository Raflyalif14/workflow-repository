begin;

-- 1. Drop the legacy unique constraint on project_id, workflow_stage_id if still present
alter table public.project_milestones
  drop constraint if exists project_milestones_project_id_workflow_stage_id_key;

-- 2. Update mutate_approved_project_scope to enforce 1 Output Document = 1 Milestone
create or replace function public.mutate_approved_project_scope(p_project_id uuid,p_actor_id uuid,p_action text,
 p_payload jsonb,p_request_id uuid,p_expected_updated_at timestamptz default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare p public.projects%rowtype; actor public.users%rowtype; r public.project_scope_changes%rowtype;
 keys text[]; original text[]; group_name text; d record; m public.project_milestones%rowtype; item jsonb;
 changed boolean; start_day date; duration integer; due_day date;
begin
 select * into p from public.projects where id=p_project_id for update;
 select * into actor from public.users where id=p_actor_id and is_active;
 if p.id is null or actor.id is null then raise exception 'Forbidden' using errcode='42501'; end if;
 if p_request_id is null or p_action not in ('REQUEST','APPROVED','REJECTED','CANCELLED') or p_action is null then
  raise exception 'Invalid request' using errcode='22023'; end if;
 if p_action='REQUEST' then
  if actor.role<>'SALES' or p.sales_id is distinct from actor.id then raise exception 'Forbidden' using errcode='42501'; end if;
  select * into r from public.project_scope_changes where id=p_request_id;
  if found then
   if r.project_id<>p.id or r.requested_by<>actor.id or r.proposal<>p_payload then raise exception 'Request ID reused' using errcode='40001'; end if;
   return to_jsonb(r);
  end if;
  if p.status<>'ACTIVE' or coalesce(p.is_postponed,false) or p.active_phase_id is null or p.pic_id is null
   or not exists(select 1 from public.project_phases ph where ph.id=p.active_phase_id and ph.status='ACTIVE')
   or not exists(select 1 from public.project_plan_approvals a where a.project_id=p.id and a.phase_id=p.active_phase_id and a.status='APPROVED') then
   raise exception 'Approved active plan required' using errcode='55000'; end if;
  if p_expected_updated_at is null or p.updated_at<>p_expected_updated_at then raise exception 'Project changed' using errcode='40001'; end if;
  if exists(select 1 from public.project_scope_changes where project_id=p.id and status='PENDING') then raise exception 'Request already pending' using errcode='55000'; end if;
  if nullif(btrim(p_payload->>'reason'),'') is null or length(p_payload->>'reason')>2000
   or jsonb_typeof(p_payload->'selected_keys') is distinct from 'array'
   or jsonb_typeof(p_payload->'additions') is distinct from 'array' then raise exception 'Invalid proposal' using errcode='22023'; end if;
  select array_agg(value order by value) into keys from jsonb_array_elements_text(p_payload->'selected_keys');
  keys:=coalesce(keys,array[]::text[]);
  if cardinality(keys)<>(select count(distinct k) from unnest(keys) k) then raise exception 'Duplicate keys' using errcode='22023'; end if;
  select phase_key into group_name from public.project_phases where id=p.active_phase_id;
  if exists(select 1 from unnest(keys) k where not exists(select 1 from public.output_document_stage_catalog c where c.document_key=k and c.group_key=group_name))
   or exists(select 1 from public.output_document_stage_catalog c where c.group_key=group_name and c.is_required and not(c.document_key=any(keys))) then
   raise exception 'Invalid scope or missing mandatory output' using errcode='22023'; end if;
  select coalesce(array_agg(document_key order by document_key),array[]::text[]) into original from public.project_output_documents
   where project_id=p.id and phase_id=p.active_phase_id and (is_required or is_selected);
  if keys=original then raise exception 'Scope is unchanged' using errcode='22023'; end if;
  for d in select od.* from public.project_output_documents od where od.project_id=p.id and od.phase_id=p.active_phase_id
   and (od.is_required or od.is_selected) and not(od.document_key=any(keys)) loop
   select * into m from public.project_milestones where id=d.milestone_id;
   if (m.id is not null and m.status<>'CREATED') or d.status not in ('TO_DO','NOT_REQUIRED') or d.file_name is not null or d.storage_path is not null
    or d.current_version_id is not null or d.uploaded_at is not null or d.reviewed_at is not null or d.draft_revision<>0 then
    raise exception 'Started output cannot be removed' using errcode='55000'; end if;
   perform public.assert_scope_unreferenced('public.project_output_documents'::regclass,d.id);
  end loop;
  if jsonb_array_length(p_payload->'additions')<>(select count(*) from unnest(keys) k where not(k=any(original)))
   or exists(select 1 from jsonb_array_elements(p_payload->'additions') a where not(a->>'key'=any(keys)) or a->>'key'=any(original)) then
   raise exception 'Invalid additions' using errcode='22023'; end if;
  insert into public.project_scope_changes(id,project_id,phase_id,requested_by,reason,before_keys,proposal,before_state)
   values(p_request_id,p.id,p.active_phase_id,actor.id,btrim(p_payload->>'reason'),original,p_payload,public.scope_change_state(p.id,p.active_phase_id)) returning * into r;
  insert into public.activity_logs(project_id,user_id,action,description) values(p.id,actor.id,'PROJECT_SCOPE_REQUESTED','Project plan change requested: '||r.reason);
  perform public.notify_scope_change(r.id,'REQUESTED');
  return to_jsonb(r);
 end if;
 select * into r from public.project_scope_changes where id=(p_payload->>'change_id')::uuid and project_id=p.id for update;
 if r.id is null then raise exception 'Request not found' using errcode='22023'; end if;
 if (p_action='CANCELLED' and (actor.role<>'SALES' or actor.id<>p.sales_id or actor.id<>r.requested_by))
  or (p_action<>'CANCELLED' and actor.role<>'HEAD_SA') then raise exception 'Forbidden' using errcode='42501'; end if;
 if r.status<>'PENDING' then
  if r.review_request_id=p_request_id and r.status=p_action and r.reviewed_by=actor.id
   and r.review_note is not distinct from nullif(btrim(p_payload->>'note'),'') then return to_jsonb(r); end if;
  raise exception 'Request already reviewed' using errcode='40001';
 end if;
 if p_action='REJECTED' and nullif(btrim(p_payload->>'note'),'') is null then raise exception 'Review note required' using errcode='22023'; end if;
 if p_action='APPROVED' then
  if p.status<>'ACTIVE' or coalesce(p.is_postponed,false) or p.active_phase_id is distinct from r.phase_id or p.pic_id is null
   or not exists(select 1 from public.project_phases ph where ph.id=r.phase_id and ph.status='ACTIVE') then
   raise exception 'Project no longer editable' using errcode='55000'; end if;
  select coalesce(array_agg(document_key order by document_key),array[]::text[]) into original from public.project_output_documents
   where project_id=p.id and phase_id=r.phase_id and (is_required or is_selected);
  if original<>r.before_keys then raise exception 'Scope changed' using errcode='40001'; end if;
  select array_agg(value order by value) into keys from jsonb_array_elements_text(r.proposal->'selected_keys');
  keys:=coalesce(keys,array[]::text[]);
  select phase_key into group_name from public.project_phases where id=r.phase_id;
  if exists(select 1 from public.output_document_stage_catalog c where c.group_key=group_name and c.is_required and not(c.document_key=any(keys))) then
   raise exception 'Mandatory output cannot be removed' using errcode='55000'; end if;
  perform 1 from public.project_milestones where project_id=p.id and phase_id=r.phase_id order by id for update;
  perform 1 from public.project_output_documents where project_id=p.id and phase_id=r.phase_id order by id for update;
  for d in select od.* from public.project_output_documents od where od.project_id=p.id and od.phase_id=r.phase_id
    and (od.is_required or od.is_selected) and not(od.document_key=any(keys)) loop
   select * into m from public.project_milestones where id=d.milestone_id;
   if (m.id is not null and m.status<>'CREATED') or d.status not in ('TO_DO','NOT_REQUIRED') or d.file_name is not null or d.storage_path is not null
    or d.current_version_id is not null or d.uploaded_at is not null or d.reviewed_at is not null or d.draft_revision<>0 then
    raise exception 'Started output cannot be removed' using errcode='55000'; end if;
   perform public.assert_scope_unreferenced('public.project_output_documents'::regclass,d.id);
   delete from public.project_output_documents where id=d.id;
   if d.milestone_id is not null and not exists(select 1 from public.project_output_documents where milestone_id=d.milestone_id) then
     perform public.assert_scope_unreferenced('public.project_milestones'::regclass,d.milestone_id);
     delete from public.project_milestones where id=d.milestone_id;
   end if;
  end loop;
  for d in select c.*,ws.id stage_id,ws.name stage_name,ws.description stage_description,ws.step_order stage_order
   from public.output_document_stage_catalog c join public.workflow_stages ws on ws.stage_key=c.stage_key
    and ws.scenario_id=p.current_scenario_id and ws.default_role='SA' and ws.is_active
   where c.group_key=group_name and c.document_key=any(keys) and not(c.document_key=any(original)) loop
   select value into item from jsonb_array_elements(r.proposal->'additions') where value->>'key'=d.document_key;
   if item is null then raise exception 'New output schedule required' using errcode='22023'; end if;
   start_day:=(item->>'start_date')::date; duration:=(item->>'duration_working_days')::integer; due_day:=(item->>'due_date')::date;
   if start_day is null or duration is null or duration<1 or due_day is null or due_day<start_day then raise exception 'Invalid output schedule' using errcode='22023'; end if;
   insert into public.project_milestones(project_id,phase_id,workflow_stage_id,name,description,step_order,status,pic_id,start_date,duration_working_days,due_date)
    values(p.id,r.phase_id,d.stage_id,d.title,'Solution Architect menyiapkan '||lower(d.title)||'.',d.stage_order,'CREATED',p.pic_id,start_day,duration,due_day) returning * into m;
   insert into public.project_output_documents(project_id,phase_id,document_key,milestone_id,title,is_required,is_selected,status,start_date,duration_working_days,due_date)
    values(p.id,r.phase_id,d.document_key,m.id,d.title,d.is_required,true,'TO_DO',start_day,duration,due_day);
  end loop;
  if exists(select 1 from unnest(keys) k where not exists(select 1 from public.project_output_documents od where od.project_id=p.id and od.phase_id=r.phase_id and od.document_key=k and od.is_selected)) then
   raise exception 'Output mapping unavailable' using errcode='55000'; end if;
  update public.project_milestones pm set step_order=ranked.position+(select coalesce(max(step_order),0) from public.project_milestones where project_id=p.id and phase_id<>r.phase_id)
   from (select pm2.id,row_number() over(order by ws.step_order,pm2.start_date,pm2.created_at,pm2.id)::integer position from public.project_milestones pm2
    join public.workflow_stages ws on ws.id=pm2.workflow_stage_id where pm2.project_id=p.id and pm2.phase_id=r.phase_id) ranked where pm.id=ranked.id;
  update public.projects set selected_document_keys=to_jsonb(keys),updated_at=clock_timestamp() where id=p.id;
  update public.project_phases set selected_document_keys=to_jsonb(keys) where id=r.phase_id;
  if not exists(select 1 from public.project_milestones where project_id=p.id and phase_id=r.phase_id and status not in ('COMPLETED','APPROVED')) then
   perform public.finish_project_phase(p.id,r.phase_id,actor.id);
  end if;
 end if;
 update public.project_scope_changes set status=p_action,reviewed_by=actor.id,reviewed_at=now(),review_note=nullif(btrim(p_payload->>'note'),''),
  review_request_id=p_request_id,after_state=public.scope_change_state(p.id,r.phase_id) where id=r.id returning * into r;
 insert into public.activity_logs(project_id,user_id,action,description) values(p.id,actor.id,'PROJECT_SCOPE_'||p_action,'Project plan change '||lower(p_action)||': '||r.reason);
 perform public.notify_scope_change(r.id,p_action);
 return to_jsonb(r);
end $$;

revoke all on function public.mutate_approved_project_scope(uuid,uuid,text,jsonb,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.mutate_approved_project_scope(uuid,uuid,text,jsonb,uuid,timestamptz) to service_role;
notify pgrst,'reload schema';
commit;
