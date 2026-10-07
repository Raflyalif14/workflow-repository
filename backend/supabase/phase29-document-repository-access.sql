-- Additive ACLs for repository results; never grants project or workflow access.
begin;
do $$ begin
  if to_regclass('public.project_output_document_version_files') is null
    or to_regclass('public.project_output_review_requests') is null
    or to_regclass('public.document_versions') is null then
    raise exception 'Phase 29 requires the document repository and Phase 28';
  end if;
  -- Existing direct client access to activity must already be protected by RLS.
  -- Do not silently enable RLS for unrelated application tables.
  if not (select relrowsecurity from pg_class where oid='public.activity_logs'::regclass)
    and (has_table_privilege('anon','public.activity_logs','SELECT,INSERT,UPDATE,DELETE')
      or has_table_privilege('authenticated','public.activity_logs','SELECT,INSERT,UPDATE,DELETE')) then
    raise exception 'Phase 29 requires protected activity_logs client access';
  end if;
  if exists(select 1 from public.activity_logs where action='DOCUMENT_ACCESS_CHANGED') then
    raise exception 'Phase 29 action namespace is already in use';
  end if;
end $$;

create table public.document_repository_access (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check(source_type in ('OFFICIAL','OUTPUT')),
  document_id uuid unique references public.documents(id) on delete cascade,
  output_document_id uuid unique references public.project_output_documents(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  access_mode text not null default 'RESTRICTED' check(access_mode in ('RESTRICTED','SHARED_INTERNAL')),
  revision bigint not null default 0 check(revision >= 0),
  constraint document_access_source_identity check (
    (source_type='OFFICIAL' and document_id is not null and output_document_id is null)
    or (source_type='OUTPUT' and output_document_id is not null and document_id is null))
);
create table public.document_repository_grants (
  access_id uuid not null references public.document_repository_access(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  primary key(access_id,user_id)
);
create table public.document_repository_access_requests (
  access_id uuid not null references public.document_repository_access(id) on delete cascade,
  request_id uuid not null,
  actor_id uuid not null references public.users(id) on delete cascade,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(access_id,request_id)
);
alter table public.activity_logs add column document_access_audit jsonb;
alter table public.activity_logs add constraint document_access_audit_shape check (
  action <> 'DOCUMENT_ACCESS_CHANGED' or (user_id is not null and document_access_audit is not null
    and jsonb_typeof(document_access_audit)='object'
    and document_access_audit ?& array['source_type','object_id','before','after','revision','request_id']));

-- API service_role exposes this audit only through manager-checked ACL details.
-- Restrictive policy cannot broaden an existing permissive activity policy.
create policy document_access_private_audit on public.activity_logs as restrictive
for select to anon,authenticated using (action <> 'DOCUMENT_ACCESS_CHANGED');
create policy document_access_server_audit_insert on public.activity_logs as restrictive
for insert to anon,authenticated with check (action <> 'DOCUMENT_ACCESS_CHANGED');
create policy document_access_server_audit_update on public.activity_logs as restrictive
for update to anon,authenticated using (action <> 'DOCUMENT_ACCESS_CHANGED')
with check (action <> 'DOCUMENT_ACCESS_CHANGED');
create policy document_access_server_audit_delete on public.activity_logs as restrictive
for delete to anon,authenticated using (action <> 'DOCUMENT_ACCESS_CHANGED');

create function public.check_document_repository_identity() returns trigger
language plpgsql set search_path=pg_catalog as $$
declare v_project uuid;
begin
  if new.source_type='OFFICIAL' then
    select d.project_id into v_project from public.documents d where d.id=new.document_id;
  else
    select d.project_id into v_project from public.project_output_documents d where d.id=new.output_document_id;
  end if;
  if v_project is distinct from new.project_id then
    raise exception 'Invalid repository identity' using errcode='23514';
  end if;
  return new;
end $$;
create trigger document_repository_identity before insert or update on public.document_repository_access
for each row execute function public.check_document_repository_identity();

-- Missing ACL rows mean RESTRICTED with revision zero, including newly created documents.
-- Actor is resolved from the server-supplied ID; service_role is the only caller.
-- The same authorized source IDs filter lists/search BEFORE pagination and downloads.
create function public.list_document_repository_access(p_actor_id uuid,p_source_type text)
returns table(source_id uuid,project_id uuid,access_mode text,revision bigint,
  project_access boolean,can_manage boolean,approved boolean)
language sql stable security definer set search_path=pg_catalog as $$
with actor as (
  select u.id,u.role from public.users u where u.id=p_actor_id and u.is_active
    and not coalesce(u.must_change_password,false) and u.role in ('SALES','SA','HEAD_SA','SUPER_ADMIN')
), sources as (
  select d.id,d.project_id,d.status::text,
    (d.status='APPROVED' and exists(select 1 from public.document_versions v
      where v.document_id=d.id and v.is_latest and v.status='APPROVED'
        and nullif(btrim(v.storage_path),'') is not null)) as valid_approved,
    a.id as acl_id,coalesce(a.access_mode,'RESTRICTED') as mode,coalesce(a.revision,0) as rev
  from public.documents d left join public.document_repository_access a on a.document_id=d.id
  where p_source_type='OFFICIAL'
  union all
  select d.id,d.project_id,d.status::text,
    (d.status='APPROVED' and (d.is_required or d.is_selected)
      and exists(select 1 from public.project_output_document_versions v
        where v.id=d.current_version_id and v.output_document_id=d.id and v.project_id=d.project_id
          and v.status='APPROVED' and v.snapshot_kind <> 'LEGACY_UPLOAD_UNCONFIRMED')
      and exists(select 1 from public.project_output_document_version_files vf
        where vf.version_id=d.current_version_id and vf.output_document_id=d.id and vf.project_id=d.project_id)
      and not exists(select 1 from public.project_output_document_version_files vf
        left join public.project_output_document_files f on f.id=vf.file_id
        where vf.version_id=d.current_version_id and
          (vf.output_document_id is distinct from d.id or vf.project_id is distinct from d.project_id
            or f.output_document_id is distinct from d.id or f.project_id is distinct from d.project_id
            or nullif(btrim(f.storage_path),'') is null))) as valid_approved,
    a.id,coalesce(a.access_mode,'RESTRICTED'),coalesce(a.revision,0)
  from public.project_output_documents d left join public.document_repository_access a on a.output_document_id=d.id
  where p_source_type='OUTPUT'
), scoped as (
  select s.*,u.id as actor_id,u.role,
    coalesce((u.role in ('HEAD_SA','SUPER_ADMIN') or (u.role='SALES' and p.sales_id=u.id)
      or (u.role='SA' and p.pic_id=u.id)),false) as native_access
  from sources s join public.projects p on p.id=s.project_id cross join actor u
)
select s.id,s.project_id,s.mode,s.rev,s.native_access,
  s.native_access and s.role in ('HEAD_SA','SUPER_ADMIN') and s.valid_approved,s.valid_approved
from scoped s where
  (s.native_access and (case when p_source_type='OFFICIAL' then s.role <> 'SALES' or s.status='APPROVED'
    else s.status='APPROVED' or s.role in ('SA','HEAD_SA') end))
  or (s.valid_approved and (s.mode='SHARED_INTERNAL' or exists(
    select 1 from public.document_repository_grants g where g.access_id=s.acl_id and g.user_id=s.actor_id)));
$$;

create function public.set_document_repository_access(p_actor_id uuid,p_source_type text,p_source_id uuid,
  p_mode text,p_grants uuid[],p_expected_revision bigint,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
#variable_conflict use_column
declare v_project uuid; v_acl public.document_repository_access%rowtype;
  v_actor public.users%rowtype; v_receipt public.document_repository_access_requests%rowtype;
  v_read record; v_grants uuid[]; v_before uuid[]; v_payload jsonb; v_result jsonb; v_changed boolean;
begin
  if p_source_type not in ('OFFICIAL','OUTPUT') or p_source_type is null or p_source_id is null
    or p_mode not in ('RESTRICTED','SHARED_INTERNAL') or p_mode is null or p_grants is null
    or p_expected_revision is null or p_expected_revision<0 or p_request_id is null
    or cardinality(p_grants)>100 or array_position(p_grants,null) is not null then
    raise exception 'Invalid access input' using errcode='22023';
  end if;
  if p_source_type='OFFICIAL' then select d.project_id into v_project from public.documents d where d.id=p_source_id;
  else select d.project_id into v_project from public.project_output_documents d where d.id=p_source_id; end if;
  -- Same project-first lock order as upload/review/project deletion.
  perform 1 from public.projects p where p.id=v_project for update;
  if not found then raise exception 'Document not found' using errcode='P0002'; end if;
  select * into v_actor from public.users u where u.id=p_actor_id for share;
  if not found or not v_actor.is_active or coalesce(v_actor.must_change_password,false)
    or v_actor.role not in ('HEAD_SA','SUPER_ADMIN') then raise exception 'Forbidden' using errcode='42501'; end if;
  if p_source_type='OFFICIAL' then perform 1 from public.documents d where d.id=p_source_id and d.project_id=v_project for update;
  else perform 1 from public.project_output_documents d where d.id=p_source_id and d.project_id=v_project for update; end if;
  if not found then raise exception 'Document not found' using errcode='P0002'; end if;
  -- HEAD_SA's current policy is all projects; never derives management from a grant.
  select * into v_read from public.list_document_repository_access(p_actor_id,p_source_type) r where r.source_id=p_source_id;
  if not found or not v_read.can_manage then raise exception 'Forbidden' using errcode='42501'; end if;
  select coalesce(array_agg(distinct id order by id),'{}'::uuid[]) into v_grants from unnest(p_grants) id;
  -- Lock recipients through commit so an inactive account cannot receive a new grant.
  perform 1 from public.users u where u.id=any(v_grants) order by u.id for share;
  if (select count(*) from public.users u where u.id=any(v_grants) and u.is_active
    and u.role in ('SALES','SA','HEAD_SA','SUPER_ADMIN')) <> cardinality(v_grants) then
    raise exception 'Grant recipient is not active' using errcode='22023';
  end if;
  insert into public.document_repository_access(source_type,document_id,output_document_id,project_id)
    values(p_source_type,case when p_source_type='OFFICIAL' then p_source_id end,
      case when p_source_type='OUTPUT' then p_source_id end,v_project) on conflict do nothing;
  select * into v_acl from public.document_repository_access a
    where (p_source_type='OFFICIAL' and a.document_id=p_source_id)
      or (p_source_type='OUTPUT' and a.output_document_id=p_source_id) for update;
  v_payload:=jsonb_build_object('actor_id',p_actor_id,'mode',p_mode,'grants',to_jsonb(v_grants),'expected_revision',p_expected_revision);
  select * into v_receipt from public.document_repository_access_requests r where r.access_id=v_acl.id and r.request_id=p_request_id;
  if found then
    if v_receipt.actor_id is distinct from p_actor_id or v_receipt.payload is distinct from v_payload then
      raise exception 'Access receipt conflicts' using errcode='40001'; end if;
    return v_receipt.result || jsonb_build_object('replayed',true);
  end if;
  if v_acl.revision <> p_expected_revision then raise exception 'Access changed; reload' using errcode='40001'; end if;
  select coalesce(array_agg(g.user_id order by g.user_id),'{}'::uuid[]) into v_before
    from public.document_repository_grants g where g.access_id=v_acl.id;
  v_changed:=v_acl.access_mode is distinct from p_mode or v_before is distinct from v_grants;
  if v_changed then
    update public.document_repository_access set access_mode=p_mode,revision=revision+1 where id=v_acl.id;
    delete from public.document_repository_grants where access_id=v_acl.id and not(user_id=any(v_grants));
    insert into public.document_repository_grants(access_id,user_id) select v_acl.id,id from unnest(v_grants) id on conflict do nothing;
    insert into public.activity_logs(project_id,user_id,action,description,document_access_audit)
      values(v_project,p_actor_id,'DOCUMENT_ACCESS_CHANGED','DOCUMENT_ACCESS_CHANGED',jsonb_build_object(
        'source_type',p_source_type,'object_id',p_source_id,'request_id',p_request_id,'revision',v_acl.revision+1,
        'before',jsonb_build_object('mode',v_acl.access_mode,'grants',v_before),
        'after',jsonb_build_object('mode',p_mode,'grants',v_grants)));
  end if;
  v_result:=jsonb_build_object('revision',v_acl.revision+case when v_changed then 1 else 0 end,'changed',v_changed,'replayed',false);
  insert into public.document_repository_access_requests(access_id,request_id,actor_id,payload,result)
    values(v_acl.id,p_request_id,p_actor_id,v_payload,v_result);
  return v_result;
end $$;

alter table public.document_repository_access enable row level security;
alter table public.document_repository_grants enable row level security;
alter table public.document_repository_access_requests enable row level security;
revoke all on public.document_repository_access,public.document_repository_grants,public.document_repository_access_requests from public,anon,authenticated,service_role;
-- Even service_role writes use the atomic RPC; direct reads support manager-only projections.
grant select on public.document_repository_access,public.document_repository_grants,public.document_repository_access_requests to service_role;
revoke all on function public.check_document_repository_identity() from public,anon,authenticated;
revoke all on function public.list_document_repository_access(uuid,text) from public,anon,authenticated;
revoke all on function public.set_document_repository_access(uuid,text,uuid,text,uuid[],bigint,uuid) from public,anon,authenticated;
grant execute on function public.list_document_repository_access(uuid,text) to service_role;
grant execute on function public.set_document_repository_access(uuid,text,uuid,text,uuid[],bigint,uuid) to service_role;
commit;
