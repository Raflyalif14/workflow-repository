-- Apply after Phase 45. Approved plans retain their effective scope until review.
begin;
create table public.project_scope_changes (
 id uuid primary key,
 project_id uuid not null references public.projects(id) on delete cascade,
 phase_id uuid not null references public.project_phases(id),
 requested_by uuid not null references public.users(id),
 requested_at timestamptz not null default now(),
 reason text not null check(length(btrim(reason)) between 1 and 2000),
 before_keys text[] not null,
 proposal jsonb not null,
 before_state jsonb not null,
 status text not null default 'PENDING' check(status in ('PENDING','APPROVED','REJECTED','CANCELLED')),
 reviewed_by uuid references public.users(id),reviewed_at timestamptz,review_note text,
 review_request_id uuid,after_state jsonb
);
create unique index scope_change_one_pending on public.project_scope_changes(project_id) where status='PENDING';
alter table public.project_scope_changes enable row level security;
create policy scope_change_service on public.project_scope_changes for all to service_role using(true) with check(true);
revoke all on public.project_scope_changes from public,anon,authenticated;
grant select,insert,update,delete on public.project_scope_changes to service_role;

create function public.scope_change_state(p_project uuid,p_phase uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog as $$
 select jsonb_build_object('milestones',(select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'name',m.name,'status',m.status,'start_date',m.start_date,'due_date',m.due_date) order by m.id),'[]')
 from public.project_milestones m where m.project_id=p_project and m.phase_id=p_phase),
 'outputs',(select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'document_key',d.document_key,'status',d.status,'start_date',d.start_date,'due_date',d.due_date) order by d.id),'[]') from public.project_output_documents d
 where d.project_id=p_project and d.phase_id=p_phase and (d.is_required or d.is_selected)));
$$;

-- All existing foreign-key references count as history. Only outputs that are themselves
-- being safely removed may be ignored when checking an empty parent milestone.
create function public.assert_scope_unreferenced(p_relation regclass,p_id uuid,p_ignore regclass default null) returns void
language plpgsql security definer set search_path=pg_catalog as $$
declare ref record; linked boolean;
begin
 if p_relation not in ('public.project_milestones'::regclass,'public.project_output_documents'::regclass) then
  raise exception 'Invalid scope object' using errcode='22023'; end if;
 for ref in select c.conrelid,a.attname from pg_constraint c join pg_attribute a
   on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
   where c.contype='f' and c.confrelid=p_relation and array_length(c.conkey,1)=1
    and (p_ignore is null or c.conrelid<>p_ignore)
 loop
  execute format('select exists(select 1 from %s where %I=$1)',ref.conrelid::regclass,ref.attname) into linked using p_id;
  if linked then raise exception 'Scope item has linked history' using errcode='55000'; end if;
 end loop;
end $$;

create function public.notify_scope_change(p_change uuid,p_event text) returns void
language plpgsql security definer set search_path=pg_catalog as $$
declare r public.project_scope_changes%rowtype; p public.projects%rowtype; recipient record; notification uuid;
begin
 select * into r from public.project_scope_changes where id=p_change;
 select * into p from public.projects where id=r.project_id;
 for recipient in select u.*,coalesce(n.in_app_enabled,true) visible,
   coalesce(n.telegram_enabled,false) and n.telegram_chat_id is not null telegram
  from public.users u left join public.notification_preferences n on n.user_id=u.id
  where u.is_active and ((p_event='REQUESTED' and u.role='HEAD_SA')
   or (p_event<>'REQUESTED' and u.id in (r.requested_by,p.pic_id)))
 loop
  insert into public.notifications(user_id,type,title,message,project_id,action_url,in_app_visible)
   values(recipient.id,'PROJECT_SCOPE_'||p_event,
    case when recipient.preferred_language='id' then 'Perubahan project plan' else 'Project plan change' end,
    p.name||' - '||p_event||': '||r.reason,p.id,'/projects/'||p.id::text||'#project-scope-changes',recipient.visible)
   returning id into notification;
  if recipient.telegram then insert into public.notification_deliveries(notification_id,channel,status,failure_kind,next_retry_at,attempt_count)
   values(notification,'TELEGRAM','FAILED','RETRYABLE',now(),0); end if;
 end loop;
end $$;

create function public.mutate_approved_project_scope(p_project_id uuid,p_actor_id uuid,p_action text,
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
   if m.status<>'CREATED' or d.status not in ('TO_DO','NOT_REQUIRED') or d.file_name is not null or d.storage_path is not null
    or d.current_version_id is not null or d.uploaded_at is not null or d.reviewed_at is not null or d.draft_revision<>0 then
    raise exception 'Started output cannot be removed' using errcode='55000'; end if;
   perform public.assert_scope_unreferenced('public.project_output_documents'::regclass,d.id);
  end loop;
  if jsonb_array_length(p_payload->'additions')<>(select count(*) from unnest(keys) k where not(k=any(original)))
   or exists(select 1 from jsonb_array_elements(p_payload->'additions') a where not(a->>'key'=any(keys)) or a->>'key'=any(original)) then
   raise exception 'Invalid additions' using errcode='22023'; end if;
  if exists(select 1 from public.output_document_stage_catalog c join public.workflow_stages ws
   on ws.stage_key=c.stage_key and ws.scenario_id=p.current_scenario_id join public.project_milestones pm
   on pm.workflow_stage_id=ws.id and pm.project_id=p.id and pm.phase_id=p.active_phase_id
   where c.document_key=any(keys) and not(c.document_key=any(original)) and pm.status in ('COMPLETED','APPROVED')) then
   raise exception 'Completed milestone cannot receive new outputs' using errcode='55000'; end if;
  -- A request is a proposal only. Recheck all removal/addition guards again on approval.
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
  -- Parent first, then output locks match the existing project mutation lock order.
  perform 1 from public.project_milestones where project_id=p.id and phase_id=r.phase_id order by id for update;
  perform 1 from public.project_output_documents where project_id=p.id and phase_id=r.phase_id order by id for update;
  for d in select od.* from public.project_output_documents od where od.project_id=p.id and od.phase_id=r.phase_id
    and (od.is_required or od.is_selected) and not(od.document_key=any(keys)) loop
   select * into m from public.project_milestones where id=d.milestone_id;
   if m.status<>'CREATED' or d.status not in ('TO_DO','NOT_REQUIRED') or d.file_name is not null or d.storage_path is not null
    or d.current_version_id is not null or d.uploaded_at is not null or d.reviewed_at is not null or d.draft_revision<>0 then
    raise exception 'Started output cannot be removed' using errcode='55000'; end if;
   perform public.assert_scope_unreferenced('public.project_output_documents'::regclass,d.id);
  end loop;
  delete from public.project_output_documents where project_id=p.id and phase_id=r.phase_id and (is_required or is_selected) and not(document_key=any(keys));
  for m in select pm.* from public.project_milestones pm join public.workflow_stages ws on ws.id=pm.workflow_stage_id
    where pm.project_id=p.id and pm.phase_id=r.phase_id and ws.default_role='SA'
    and not exists(select 1 from public.output_document_stage_catalog c where c.document_key=any(keys) and c.stage_key=ws.stage_key) loop
   if m.status<>'CREATED' then raise exception 'Started milestone cannot be removed' using errcode='55000'; end if;
   perform public.assert_scope_unreferenced('public.project_milestones'::regclass,m.id);
   delete from public.project_milestones where id=m.id;
  end loop;
  for d in select c.*,ws.id stage_id,ws.name stage_name,ws.description stage_description,ws.step_order stage_order
   from public.output_document_stage_catalog c join public.workflow_stages ws on ws.stage_key=c.stage_key
    and ws.scenario_id=p.current_scenario_id and ws.default_role='SA' and ws.is_active
   where c.group_key=group_name and c.document_key=any(keys) and not(c.document_key=any(original)) loop
   select * into m from public.project_milestones where project_id=p.id and phase_id=r.phase_id and workflow_stage_id=d.stage_id;
   if found and m.status in ('APPROVED','COMPLETED') then raise exception 'Completed milestone cannot receive new outputs' using errcode='55000'; end if;
   select value into item from jsonb_array_elements(r.proposal->'additions') where value->>'key'=d.document_key;
   if item is null then raise exception 'New output schedule required' using errcode='22023'; end if;
   start_day:=(item->>'start_date')::date; duration:=(item->>'duration_working_days')::integer; due_day:=(item->>'due_date')::date;
   if start_day is null or duration is null or duration<1 or due_day is null or due_day<start_day then raise exception 'Invalid output schedule' using errcode='22023'; end if;
   if m.id is null then
    insert into public.project_milestones(project_id,phase_id,workflow_stage_id,name,description,step_order,status,pic_id,start_date,duration_working_days,due_date)
     values(p.id,r.phase_id,d.stage_id,d.stage_name,d.stage_description,d.stage_order,'CREATED',p.pic_id,start_day,duration,due_day) returning * into m;
   end if;
   insert into public.project_output_documents(project_id,phase_id,document_key,milestone_id,title,is_required,is_selected,status,start_date,duration_working_days,due_date)
    values(p.id,r.phase_id,d.document_key,m.id,d.title,d.is_required,true,'TO_DO',start_day,duration,due_day);
  end loop;
  if exists(select 1 from unnest(keys) k where not exists(select 1 from public.project_output_documents od where od.project_id=p.id and od.phase_id=r.phase_id and od.document_key=k and od.is_selected)) then
   raise exception 'Output mapping unavailable' using errcode='55000'; end if;
  update public.project_milestones pm set step_order=ranked.position+(select coalesce(max(step_order),0) from public.project_milestones where project_id=p.id and phase_id<>r.phase_id)
   from (select pm2.id,row_number() over(order by ws.step_order,pm2.id)::integer position from public.project_milestones pm2
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
revoke all on function public.scope_change_state(uuid,uuid),public.assert_scope_unreferenced(regclass,uuid,regclass),public.notify_scope_change(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.mutate_approved_project_scope(uuid,uuid,text,jsonb,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.mutate_approved_project_scope(uuid,uuid,text,jsonb,uuid,timestamptz) to service_role;
notify pgrst,'reload schema';
commit;
