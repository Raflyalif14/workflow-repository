-- Additive Phase31; coordinated deployment, no historical receipt backfill.
-- Storage transfers occur outside these short transactions. No Storage object is deleted.
begin;
do $$ begin
  if to_regprocedure('public.audit_project_creation_phase30()') is null
    or to_regclass('public.project_phases') is null then raise exception 'Phase31 requires Phase24-30'; end if;
end $$;
create table public.project_creation_requests (
  request_id uuid primary key, actor_id uuid not null, operation text not null default 'PROJECT_CREATE'
    check(operation='PROJECT_CREATE'), fingerprint text not null check(fingerprint ~ '^[0-9a-f]{64}$'),
  payload jsonb not null check(jsonb_typeof(payload)='object'), plan jsonb not null check(jsonb_typeof(plan)='object'),
  -- Deliberately NOT cascading: COMMITTED tombstone prevents recreation after deletion.
  project_id uuid not null unique default gen_random_uuid(),
  status text not null default 'PROCESSING' check(status in ('PROCESSING','COMMITTED')),
  lease_token uuid, lease_until timestamptz, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), committed_at timestamptz,
  check((status='COMMITTED')=(committed_at is not null))
);
create table public.project_creation_files (
  request_id uuid not null references public.project_creation_requests(request_id),
  ordinal integer not null check(ordinal between 0 and 20), id uuid not null unique default gen_random_uuid(),
  kind text not null check(kind in ('MOM','PHOTO','DOCUMENT')), original_filename text not null,
  mime_type text not null, size_bytes bigint not null check(size_bytes between 0 and 52428800),
  content_sha256 text not null check(content_sha256 ~ '^[0-9a-f]{64}$'), storage_path text not null unique,
  state text not null default 'PENDING' check(state in ('PENDING','UPLOADING','STORED')),
  updated_at timestamptz not null default now(), primary key(request_id,ordinal)
);
alter table public.project_creation_requests enable row level security;
alter table public.project_creation_files enable row level security;
revoke all on public.project_creation_requests,public.project_creation_files from public,anon,authenticated,service_role;
-- Operational reconciliation is service-only; all writes use the actor/fence-checked RPC.
grant select on public.project_creation_requests,public.project_creation_files to service_role;

create function public.project_creation_operation(p_actor_id uuid,p_request_id uuid,p_fingerprint text,
  p_operation text,p_payload jsonb default null,p_plan jsonb default null,p_lease uuid default null,p_ordinal integer default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
#variable_conflict use_column
declare v_r public.project_creation_requests%rowtype;v_u public.users%rowtype;v_s public.scenarios%rowtype;
  v_f public.project_creation_files%rowtype;v_p public.projects%rowtype;v_item jsonb;v_id uuid;
  v_stages jsonb;v_keys text[];v_group text;v_count integer;v_stage record;v_milestone uuid;
begin
  select * into v_u from public.users where id=p_actor_id for share;
  if not found or v_u.role<>'SALES' or v_u.is_active is not true or coalesce(v_u.must_change_password,false) then
    raise exception 'Creation actor is not eligible' using errcode='42501'; end if;
  if p_request_id is null or p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$'
    or p_operation is null or p_operation not in ('LOOKUP','CLAIM','START_FILE','STORED_FILE','RELEASE','COMMIT') then
    raise exception 'Invalid creation operation' using errcode='22023'; end if;
  if p_operation in ('LOOKUP','CLAIM') and (p_payload is null or jsonb_typeof(p_payload)<>'object'
    or exists(select 1 from jsonb_object_keys(p_payload) k where k not in
      ('name','customer','scenario_id','estimated_revenue','selected_keys','attachments'))) then
    raise exception 'Invalid creation payload' using errcode='22023'; end if;
  select * into v_r from public.project_creation_requests where request_id=p_request_id for update;
  if not found then
    if p_operation='LOOKUP' then return jsonb_build_object('status','NONE'); end if;
    if p_operation<>'CLAIM' or p_plan is null or jsonb_typeof(p_plan)<>'object' then
      raise exception 'Creation reservation missing' using errcode='55000'; end if;
    if length(btrim(coalesce(p_payload->>'name','')))<2 or length(btrim(coalesce(p_payload->>'customer','')))<2
      or p_payload->>'estimated_revenue' is null or (p_payload->>'estimated_revenue')::numeric<0
      or (p_payload->>'estimated_revenue')::numeric in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)
      or jsonb_typeof(p_payload->'selected_keys') is distinct from 'array'
      or jsonb_typeof(p_payload->'attachments') is distinct from 'array'
      or jsonb_array_length(p_payload->'attachments') not between 2 and 21
      or (select count(*) from jsonb_array_elements(p_payload->'attachments') f where f->>'kind'='MOM')<>1
      or (select count(*) from jsonb_array_elements(p_payload->'attachments') f where f->>'kind'='PHOTO') not between 1 and 10
      or (select count(*) from jsonb_array_elements(p_payload->'attachments') f where f->>'kind'='DOCUMENT')>10 then
      raise exception 'Invalid creation manifest' using errcode='22023'; end if;
    -- The conflict row is locked below; no process-local mutex or open transaction during uploads.
    insert into public.project_creation_requests(request_id,actor_id,fingerprint,payload,plan)
      values(p_request_id,p_actor_id,p_fingerprint,p_payload,p_plan) on conflict(request_id) do nothing;
    select * into v_r from public.project_creation_requests where request_id=p_request_id for update;
    if not exists(select 1 from public.project_creation_files where request_id=p_request_id) then
      for v_item in select value||jsonb_build_object('ordinal',ordinality-1)
        from jsonb_array_elements(v_r.payload->'attachments') with ordinality loop
        if v_item->>'sha256' !~ '^[0-9a-f]{64}$' or nullif(btrim(v_item->>'name'),'') is null
          or nullif(btrim(v_item->>'mime'),'') is null or v_item->>'kind' not in ('MOM','PHOTO','DOCUMENT') then
          raise exception 'Invalid attachment manifest' using errcode='22023'; end if;
        v_id:=gen_random_uuid();
        insert into public.project_creation_files(request_id,ordinal,id,kind,original_filename,mime_type,size_bytes,content_sha256,storage_path)
          values(p_request_id,(v_item->>'ordinal')::integer,v_id,v_item->>'kind',v_item->>'name',v_item->>'mime',
            (v_item->>'size')::bigint,v_item->>'sha256','project-intake/'||v_r.project_id::text||'/'||v_id::text||'/'||v_id::text||'-intake');
      end loop;
    end if;
  end if;
  -- Check identity even for COMMITTED/deleted/expired operations.
  if v_r.actor_id is distinct from p_actor_id then raise exception 'Creation actor mismatch' using errcode='42501'; end if;
  if v_r.fingerprint is distinct from p_fingerprint
    or (p_payload is not null and v_r.payload is distinct from p_payload) then
    raise exception 'Creation payload conflicts' using errcode='40001'; end if;
  if v_r.status='COMMITTED' then
    select * into v_p from public.projects where id=v_r.project_id;
    if not found then raise exception 'Created project was deleted' using errcode='P0002'; end if;
    if v_p.sales_id is distinct from p_actor_id then raise exception 'Creation access no longer valid' using errcode='42501'; end if;
    -- No saved project response: service reads current authorized state.
    return jsonb_build_object('status','COMMITTED','project_id',v_r.project_id);
  end if;
  if p_operation='LOOKUP' then
    return jsonb_build_object('status',case when v_r.lease_until>clock_timestamp() then 'BUSY' else 'PROCESSING' end);
  end if;
  if p_operation='CLAIM' then
    if v_r.lease_until>clock_timestamp() then return jsonb_build_object('status','BUSY'); end if;
    update public.project_creation_requests set lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '10 minutes',updated_at=now()
      where request_id=p_request_id returning * into v_r;
    return jsonb_build_object('status','PROCESSING','project_id',v_r.project_id,'lease',v_r.lease_token,'files',
      (select jsonb_agg(jsonb_build_object('ordinal',ordinal,'state',state,'storage_path',storage_path) order by ordinal)
        from public.project_creation_files where request_id=p_request_id));
  end if;
  if v_r.lease_token is distinct from p_lease or p_lease is null then
    raise exception 'Creation worker is fenced' using errcode='55P03'; end if;
  if p_operation='RELEASE' then
    update public.project_creation_requests set lease_token=null,lease_until=null,updated_at=now() where request_id=p_request_id;
    return jsonb_build_object('status','PROCESSING');
  end if;
  if v_r.lease_until<=clock_timestamp() then raise exception 'Creation lease expired' using errcode='55P03'; end if;
  if p_operation in ('START_FILE','STORED_FILE') then
    select * into v_f from public.project_creation_files where request_id=p_request_id and ordinal=p_ordinal for update;
    if not found then raise exception 'Creation file missing' using errcode='22023'; end if;
    if p_operation='START_FILE' and v_f.state<>'PENDING' then raise exception 'Upload already started' using errcode='55000'; end if;
    if p_operation='STORED_FILE' and v_f.state not in ('UPLOADING','STORED') then raise exception 'Upload not started' using errcode='55000'; end if;
    update public.project_creation_files set state=case p_operation when 'START_FILE' then 'UPLOADING' else 'STORED' end,updated_at=now()
      where request_id=p_request_id and ordinal=p_ordinal;
    update public.project_creation_requests set lease_until=clock_timestamp()+interval '10 minutes',updated_at=now() where request_id=p_request_id;
    return jsonb_build_object('status','PROCESSING');
  end if;
  -- COMMIT is one PostgreSQL transaction: project, Phase24 initial phase, milestones,
  -- selected outputs, every intake row, Phase30 creation audit and success receipt.
  if exists(select 1 from public.project_creation_files where request_id=p_request_id and state<>'STORED') then
    raise exception 'Intake is not confirmed' using errcode='55000'; end if;
  select * into v_s from public.scenarios where id=(v_r.payload->>'scenario_id')::uuid for share;
  if not found or v_s.is_active is not true or jsonb_build_object('id',v_s.id,'name',v_s.name,
    'workflow_model',v_s.workflow_model,'workflow_version',v_s.workflow_version) is distinct from v_r.plan->'scenario' then
    raise exception 'Creation scenario changed' using errcode='55000'; end if;
  perform 1 from public.workflow_stages where scenario_id=v_s.id and is_active order by id for share;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'description',description,'step_order',step_order,
    'stage_key',stage_key,'default_role',default_role) order by step_order),'[]'::jsonb) into v_stages
    from public.workflow_stages where scenario_id=v_s.id and is_active;
  if v_stages is distinct from v_r.plan->'stages' or jsonb_array_length(v_r.plan->'milestones')=0 then
    raise exception 'Creation workflow changed' using errcode='55000'; end if;
  if v_s.workflow_model not in ('LEGACY','OPERATIONAL_V2')
    or (v_s.workflow_model='LEGACY' and v_s.workflow_version<>1)
    or (v_s.workflow_model='OPERATIONAL_V2' and (v_s.workflow_version<>2 or v_s.name not in ('Pra-Tender','On Submission Tender'))) then
    raise exception 'Unsupported creation workflow' using errcode='55000'; end if;
  v_group:=case v_s.name when 'On Submission Tender' then 'ON_SUBMISSION_TENDER' else 'PRA_TENDER' end;
  perform 1 from public.output_document_stage_catalog order by document_key for share;
  select array_agg(k order by k) into v_keys from jsonb_array_elements_text(v_r.plan->'selected_keys') k;
  if v_keys is null or exists(select 1 from unnest(v_keys) k where not exists(select 1 from public.output_document_stage_catalog
      where document_key=k and group_key=v_group))
    or exists(select 1 from public.output_document_stage_catalog where group_key=v_group and is_required and not(document_key=any(v_keys)))
    or (select count(*) from unnest(v_keys))<>(select count(distinct k) from unnest(v_keys) k)
    or jsonb_array_length(v_r.plan->'outputs')<>cardinality(v_keys)
    or exists(select 1 from jsonb_array_elements(v_r.plan->'outputs') o left join public.output_document_stage_catalog c on c.document_key=o->>'document_key'
      where c.document_key is null or not(c.document_key=any(v_keys)) or c.group_key<>v_group
        or c.stage_key is distinct from o->>'stage_key' or c.is_required is distinct from (o->>'is_required')::boolean) then
    raise exception 'Creation output mapping invalid' using errcode='55000'; end if;
  if exists(select 1 from jsonb_array_elements_text(v_r.payload->'selected_keys') k where not(k=any(v_keys)))
    or cardinality(v_keys)<>(select count(*) from public.output_document_stage_catalog where group_key=v_group
      and (is_required or v_r.payload->'selected_keys' ? document_key))
    or (select count(*) from jsonb_array_elements(v_r.plan->'outputs'))<>
      (select count(distinct o->>'document_key') from jsonb_array_elements(v_r.plan->'outputs') o)
    or (select count(*) from jsonb_array_elements(v_r.plan->'milestones'))<>
      (select count(distinct m->>'workflow_stage_id') from jsonb_array_elements(v_r.plan->'milestones') m)
    or jsonb_array_length(v_r.plan->'milestones')<>(select count(*) from public.workflow_stages ws where ws.scenario_id=v_s.id and ws.is_active
      and (v_s.workflow_model='LEGACY' or (ws.default_role='SA' and exists(select 1 from public.output_document_stage_catalog c
        where c.document_key=any(v_keys) and c.stage_key=ws.stage_key)) or (v_group='ON_SUBMISSION_TENDER' and ws.default_role='SALES')))
    or exists(select 1 from public.workflow_stages ws where ws.scenario_id=v_s.id and ws.is_active
      and not exists(select 1 from jsonb_array_elements(v_r.plan->'milestones') m where (m->>'workflow_stage_id')::uuid=ws.id)
      and (v_s.workflow_model='LEGACY' or (ws.default_role='SA' and exists(select 1 from public.output_document_stage_catalog c
        where c.document_key=any(v_keys) and c.stage_key=ws.stage_key)) or (v_group='ON_SUBMISSION_TENDER' and ws.default_role='SALES'))) then
    raise exception 'Creation scope or stage coverage invalid' using errcode='55000'; end if;
  if (select jsonb_agg(m->>'workflow_stage_id' order by n) from jsonb_array_elements(v_r.plan->'milestones') with ordinality as entries(m,n))
    is distinct from (select jsonb_agg(ws.id::text order by ws.step_order) from public.workflow_stages ws
      where ws.scenario_id=v_s.id and ws.is_active and (v_s.workflow_model='LEGACY'
        or (ws.default_role='SA' and exists(select 1 from public.output_document_stage_catalog c
          where c.document_key=any(v_keys) and c.stage_key=ws.stage_key))
        or (v_group='ON_SUBMISSION_TENDER' and ws.default_role='SALES')))
    or exists(select 1 from public.workflow_stages ws where ws.scenario_id=v_s.id and ws.is_active
      and ws.default_role='SA' and exists(select 1 from public.output_document_stage_catalog c
        where c.document_key=any(v_keys) and c.stage_key=ws.stage_key)
      group by ws.stage_key having count(*)<>1) then
    raise exception 'Creation stage order or mapping changed' using errcode='55000'; end if;
  insert into public.projects(id,name,customer,scenario_id,estimated_revenue,selected_document_keys,sales_id,status,is_postponed)
    values(v_r.project_id,v_r.payload->>'name',v_r.payload->>'customer',v_s.id,(v_r.payload->>'estimated_revenue')::numeric,
      to_jsonb(v_keys),p_actor_id,'DRAFT',false);
  -- AFTER INSERT triggers establish phase identity and the single creation audit.
  select * into v_p from public.projects where id=v_r.project_id;
  v_count:=0;
  for v_item in select value from jsonb_array_elements(v_r.plan->'milestones') loop
    v_count:=v_count+1;
    select * into v_stage from public.workflow_stages where id=(v_item->>'workflow_stage_id')::uuid and scenario_id=v_s.id and is_active;
    if not found or (v_item->>'step_order')::integer<>v_count
      or v_item->>'status' is distinct from (case when v_s.workflow_model='OPERATIONAL_V2' then 'CREATED'
        when v_count=1 then 'COMPLETED' when v_count=2 then 'IN_PROGRESS' else 'CREATED' end)
      or (v_s.workflow_model='OPERATIONAL_V2' and not((v_stage.default_role='SA' and exists(select 1 from public.output_document_stage_catalog
        where document_key=any(v_keys) and stage_key=v_stage.stage_key)) or (v_group='ON_SUBMISSION_TENDER' and v_stage.default_role='SALES'))) then
      raise exception 'Creation milestone mapping invalid' using errcode='55000'; end if;
    insert into public.project_milestones(project_id,workflow_stage_id,name,description,step_order,status,completed_at)
      values(v_p.id,v_stage.id,v_stage.name,v_stage.description,v_count,v_item->>'status',
        case when v_item->>'status'='COMPLETED' then now() end);
  end loop;
  for v_item in select value from jsonb_array_elements(v_r.plan->'outputs') loop
    select pm.id into v_milestone from public.project_milestones pm join public.workflow_stages ws on ws.id=pm.workflow_stage_id
      where pm.project_id=v_p.id and ws.stage_key=v_item->>'stage_key' and ws.default_role='SA';
    if not found then raise exception 'Output milestone missing' using errcode='55000'; end if;
    insert into public.project_output_documents(project_id,document_key,milestone_id,title,is_required,is_selected,status)
      values(v_p.id,v_item->>'document_key',v_milestone,v_item->>'title',(v_item->>'is_required')::boolean,true,'TO_DO');
  end loop;
  insert into public.project_intake_attachments(id,project_id,kind,original_filename,storage_path,mime_type,size_bytes,created_by)
    select id,v_p.id,kind,original_filename,storage_path,mime_type,size_bytes,p_actor_id from public.project_creation_files where request_id=p_request_id;
  update public.project_creation_requests set status='COMMITTED',committed_at=now(),updated_at=now(),lease_token=null,lease_until=null
    where request_id=p_request_id;
  return jsonb_build_object('status','COMMITTED','project_id',v_p.id);
end $$;
revoke all on function public.project_creation_operation(uuid,uuid,text,text,jsonb,jsonb,uuid,integer) from public,anon,authenticated;
grant execute on function public.project_creation_operation(uuid,uuid,text,text,jsonb,jsonb,uuid,integer) to service_role;
commit;
