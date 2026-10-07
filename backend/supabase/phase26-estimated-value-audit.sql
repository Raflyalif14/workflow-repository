-- Additive; never changes Phase 24/25, workflow data, files or final contract values.
begin;
do $$ begin
  if to_regclass('public.activity_logs') is null or not exists(select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'projects' and column_name = 'estimated_revenue'
      and data_type = 'numeric' and numeric_precision = 18 and numeric_scale = 2) then
    raise exception 'Phase 26 requires activity_logs and numeric(18,2) estimated_revenue';
  end if;
  if exists(select 1 from public.activity_logs where action = 'PROJECT_ESTIMATED_VALUE_CHANGED') then
    raise exception 'Phase 26 action namespace is already in use; inspect before deployment';
  end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='activity_logs'
    and column_name='action' and data_type in ('text','character varying')
    and (character_maximum_length is null or character_maximum_length >= length('PROJECT_ESTIMATED_VALUE_CHANGED'))) then
    raise exception 'Phase 26 requires an activity action column that supports the stable action code';
  end if;
  if exists(select 1 from public.projects where status in ('DRAFT','ACTIVE') and updated_at is null) then
    raise exception 'Phase 26 requires a non-null project CAS timestamp';
  end if;
end $$;
alter table public.activity_logs add column estimated_value_audit jsonb;
create unique index activity_estimated_value_request on public.activity_logs
  (project_id,(estimated_value_audit->>'request_id')) where action = 'PROJECT_ESTIMATED_VALUE_CHANGED';
alter table public.activity_logs add constraint activity_estimated_value_audit_present check
  (action <> 'PROJECT_ESTIMATED_VALUE_CHANGED' or (estimated_value_audit is not null
    and jsonb_typeof(estimated_value_audit) = 'object'
    and estimated_value_audit ?& array['request_id','object_type','object_id','before','after','expected_updated_at','saved_updated_at']
    and (estimated_value_audit->>'object_type') is not distinct from 'PROJECT'
    and (estimated_value_audit->>'object_id') is not distinct from project_id::text
    and nullif(estimated_value_audit->>'request_id','') is not null
    and nullif(estimated_value_audit->>'after','') is not null
    and nullif(estimated_value_audit->>'expected_updated_at','') is not null
    and nullif(estimated_value_audit->>'saved_updated_at','') is not null
    and user_id is not null));

create function public.update_project_estimated_value(p_project_id uuid,p_actor_id uuid,p_value text,
  p_expected_updated_at timestamptz,p_request_id uuid)
returns table(estimated_revenue text,updated_at timestamptz,changed boolean,replayed boolean)
language plpgsql security definer set search_path = pg_catalog as $$
#variable_conflict use_column
declare v_p public.projects%rowtype; v_a public.activity_logs%rowtype;
  v_role text; v_active boolean; v_value numeric(18,2); v_saved timestamptz;
begin
  select * into v_p from public.projects where id = p_project_id for update;
  if not found or v_p.sales_id is distinct from p_actor_id then raise exception 'Forbidden' using errcode = '42501'; end if;
  select role,is_active into v_role,v_active from public.users where id = p_actor_id for share;
  if not found or v_role <> 'SALES' or not coalesce(v_active,false) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if v_p.status not in ('DRAFT','ACTIVE') or coalesce(v_p.is_postponed,false) then
    raise exception 'Estimate is not editable' using errcode = '55000';
  end if;
  if p_value is null or p_value !~ '^[0-9]{1,16}(\.[0-9]{1,2})?$'
    or p_expected_updated_at is null or p_request_id is null then
    raise exception 'Invalid estimated value input' using errcode = '22023';
  end if;
  v_value := p_value::numeric(18,2);
  select * into v_a from public.activity_logs where project_id = p_project_id
    and action = 'PROJECT_ESTIMATED_VALUE_CHANGED' and estimated_value_audit->>'request_id' = p_request_id::text;
  if found then
    if v_a.user_id is distinct from p_actor_id
      or (v_a.estimated_value_audit->>'after')::numeric is distinct from v_value
      or (v_a.estimated_value_audit->>'expected_updated_at')::timestamptz is distinct from p_expected_updated_at then
      raise exception 'Request receipt conflicts' using errcode = '40001';
    end if;
    return query select v_a.estimated_value_audit->>'after',
      (v_a.estimated_value_audit->>'saved_updated_at')::timestamptz,true,true; return;
  end if;
  if v_p.updated_at is distinct from p_expected_updated_at then raise exception 'Estimate changed; reload project' using errcode = '40001'; end if;
  if v_p.estimated_revenue is not distinct from v_value then
    return query select v_p.estimated_revenue::text,v_p.updated_at,false,false; return;
  end if;
  update public.projects set estimated_revenue = v_value,updated_at = clock_timestamp()
    where id = p_project_id returning projects.updated_at into v_saved;
  -- An audit INSERT failure propagates: PostgreSQL rolls back the entire RPC.
  -- Values and actor/time come from the locked server row and database clock.
  insert into public.activity_logs(project_id,user_id,action,description,created_at,estimated_value_audit)
    values(p_project_id,p_actor_id,'PROJECT_ESTIMATED_VALUE_CHANGED','PROJECT_ESTIMATED_VALUE_CHANGED',v_saved,jsonb_build_object(
      'request_id',p_request_id,'object_type','PROJECT','object_id',p_project_id,
      'before',v_p.estimated_revenue::text,'after',v_value::text,
      'expected_updated_at',p_expected_updated_at,'saved_updated_at',v_saved));
  return query select v_value::text,v_saved,true,false;
end $$;
revoke all on function public.update_project_estimated_value(uuid,uuid,text,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.update_project_estimated_value(uuid,uuid,text,timestamptz,uuid) to service_role;
commit;
