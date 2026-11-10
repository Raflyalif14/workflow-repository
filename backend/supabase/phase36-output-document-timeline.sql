-- Apply before deploying the output timeline API. No local browser drafts are imported.
begin;
alter table public.project_output_documents
  add column if not exists start_date date,
  add column if not exists duration_working_days integer,
  add column if not exists due_date date;

alter table public.project_output_documents add constraint output_timeline_complete
  check ((start_date is null and duration_working_days is null and due_date is null)
    or (start_date is not null and duration_working_days > 0 and duration_working_days is not null
      and due_date is not null and due_date >= start_date));

-- Keep existing plans readable using their last server-approved parent schedule.
update public.project_output_documents d set start_date=m.start_date,
  duration_working_days=m.duration_working_days,due_date=m.due_date
from public.project_milestones m where m.id=d.milestone_id
  and d.start_date is null and m.start_date is not null and m.duration_working_days>0
  and m.due_date>=m.start_date;

create function public.mutate_project_output_timeline(p_project_id uuid,p_actor_id uuid,p_action text,p_payload jsonb,
  p_expected_updated_at timestamptz,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare v_result jsonb; v_item jsonb; v_d public.project_output_documents%rowtype;
  v_phase uuid; v_before jsonb; v_after jsonb;
begin
  if p_action is distinct from 'TIMELINE' or jsonb_typeof(p_payload->'outputs') is distinct from 'array'
    or jsonb_array_length(p_payload->'outputs')=0
    or (select count(*) from jsonb_array_elements(p_payload->'outputs')) <>
       (select count(distinct e->>'id') from jsonb_array_elements(p_payload->'outputs') e) then
    raise exception 'Invalid output timeline' using errcode='22023';
  end if;
  -- Existing RPC owns project lock, owner/role checks, DRAFT/pending-plan guards,
  -- optimistic concurrency, exact-payload retry receipt, and parent timeline audit.
  -- All subsequent output writes share this transaction: any failure rolls back it all.
  v_result:=public.mutate_project_business(p_project_id,p_actor_id,p_action,p_payload,p_expected_updated_at,p_request_id);
  if (v_result->>'replayed')::boolean then return v_result; end if;
  select active_phase_id into v_phase from public.projects where id=p_project_id;
  if exists (
    select 1 from public.project_output_documents d
    where d.project_id=p_project_id and d.phase_id is not distinct from v_phase and (d.is_selected or d.is_required)
      and exists(select 1 from jsonb_array_elements(p_payload->'outputs') e where e->>'milestone_id'=d.milestone_id::text)
      and not exists(select 1 from jsonb_array_elements(p_payload->'outputs') e where e->>'id'=d.id::text)
  ) then raise exception 'Incomplete output timeline' using errcode='22023'; end if;
  for v_item in select * from jsonb_array_elements(p_payload->'outputs') loop
    select * into v_d from public.project_output_documents where id=(v_item->>'id')::uuid
      and project_id=p_project_id and phase_id is not distinct from v_phase
      and milestone_id=(v_item->>'milestone_id')::uuid and (is_selected or is_required) for update;
    if not found or not exists(select 1 from jsonb_array_elements(p_payload->'milestones') e
      where e->>'id'=v_item->>'milestone_id') then
      raise exception 'Invalid output milestone' using errcode='22023';
    end if;
    if v_item->>'start_date' is null or v_item->>'due_date' is null
      or coalesce((v_item->>'duration_working_days')::integer,0)<=0
      or (v_item->>'due_date')::date < (v_item->>'start_date')::date then
      raise exception 'Invalid output schedule' using errcode='22023';
    end if;
    v_before:=jsonb_build_object('start_date',v_d.start_date,'duration_working_days',v_d.duration_working_days,'due_date',v_d.due_date);
    update public.project_output_documents set start_date=(v_item->>'start_date')::date,
      duration_working_days=(v_item->>'duration_working_days')::integer,
      due_date=(v_item->>'due_date')::date,updated_at=now() where id=v_d.id;
    v_after:=jsonb_build_object('start_date',v_item->>'start_date','duration_working_days',(v_item->>'duration_working_days')::integer,'due_date',v_item->>'due_date');
    perform public.record_business_change(p_project_id,p_actor_id,'PROJECT_TIMELINE_UPDATED','OUTPUT_DOCUMENT',v_d.id,v_before,v_after,p_request_id);
  end loop;
  return v_result;
end $$;
revoke all on function public.mutate_project_output_timeline(uuid,uuid,text,jsonb,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.mutate_project_output_timeline(uuid,uuid,text,jsonb,timestamptz,uuid) to service_role;
notify pgrst, 'reload schema';
commit;
