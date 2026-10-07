-- Phase 32: atomic project-level sharing cutover. Run only after preflight/manual classification.
-- No files, versions, old ACL/grant rows or audit history are removed.
begin;
do $$ begin
  if to_regprocedure('public.list_document_repository_access(uuid,text)') is null
    or to_regclass('public.document_repository_access_requests') is null then
    raise exception 'Phase 32 requires Phase 29'; end if;
end $$;
-- Freeze legacy additional-access writes until classification and policy replacement commit.
lock table public.document_repository_access,public.document_repository_grants in share mode;
create table public.project_document_sharing (
  project_id uuid primary key references public.projects(id) on delete cascade,
  access_mode text not null default 'RESTRICTED' check(access_mode in ('RESTRICTED','SHARED_INTERNAL')),
  revision bigint not null default 0 check(revision between 0 and 9007199254740991),
  updated_at timestamptz not null default now(), updated_by uuid references public.users(id) on delete set null,
  legacy_classified_at timestamptz, legacy_classified_by text
);
create table public.project_document_sharing_requests (
  project_id uuid not null references public.projects(id) on delete cascade,
  request_id uuid not null, actor_id uuid not null, payload jsonb not null,
  result jsonb not null, created_at timestamptz not null default now(), primary key(project_id,request_id),
  check(jsonb_typeof(payload)='object' and jsonb_typeof(result)='object')
);
alter table public.project_document_sharing enable row level security;
alter table public.project_document_sharing_requests enable row level security;
revoke all on public.project_document_sharing,public.project_document_sharing_requests from public,anon,authenticated,service_role;
grant select on public.project_document_sharing,public.project_document_sharing_requests to service_role;

-- MANUAL CUTOVER MANIFEST. Empty by default: never infer whole-project sharing.
-- If preflight finds legacy SHARED_INTERNAL/grants, replace the empty SELECT below
-- with explicit reviewed VALUES ('project-uuid'::uuid,'RESTRICTED'::text), ... .
-- RESTRICTED retires every extra old grant; SHARED_INTERNAL opens every valid Approved result.
-- Include EVERY affected project, and only affected projects. Choices are recorded as
-- administrator migration classification, not a fabricated application-user decision.
with legacy_choices(project_id,access_mode) as (select null::uuid,null::text where false)
insert into public.project_document_sharing(project_id,access_mode,legacy_classified_at,legacy_classified_by)
select project_id,access_mode,now(),current_user from legacy_choices;
do $$ begin
  if exists(select 1 from public.document_repository_access a
    where (a.access_mode='SHARED_INTERNAL' or exists(select 1 from public.document_repository_grants g where g.access_id=a.id))
      and not exists(select 1 from public.project_document_sharing s where s.project_id=a.project_id and s.legacy_classified_at is not null))
    or exists(select 1 from public.project_document_sharing s where not exists(
      select 1 from public.document_repository_access a where a.project_id=s.project_id and
        (a.access_mode='SHARED_INTERNAL' or exists(select 1 from public.document_repository_grants g where g.access_id=a.id)))) then
    raise exception 'Classify every legacy shared/granted project explicitly before Phase 32 cutover';
  end if;
end $$;

create function public.get_project_document_sharing(p_actor_id uuid,p_project_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_s public.project_document_sharing%rowtype;
begin
  if not exists(select 1 from public.users where id=p_actor_id and is_active is true
    and not coalesce(must_change_password,false) and role in ('HEAD_SA','SUPER_ADMIN')) then
    raise exception 'Forbidden' using errcode='42501'; end if;
  if not exists(select 1 from public.projects where id=p_project_id) then
    raise exception 'Project not found' using errcode='P0002'; end if;
  select * into v_s from public.project_document_sharing where project_id=p_project_id;
  return jsonb_build_object('mode',coalesce(v_s.access_mode,'RESTRICTED'),'revision',coalesce(v_s.revision,0),
    'updatedAt',v_s.updated_at,'updatedBy',v_s.updated_by);
end $$;
create function public.set_project_document_sharing(p_actor_id uuid,p_project_id uuid,p_mode text,p_expected_revision bigint,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
#variable_conflict use_column
declare v_s public.project_document_sharing%rowtype; v_r public.project_document_sharing_requests%rowtype;
  v_payload jsonb; v_result jsonb; v_changed boolean; v_before text;
begin
  perform 1 from public.users where id=p_actor_id and is_active is true
    and not coalesce(must_change_password,false) and role in ('HEAD_SA','SUPER_ADMIN') for share;
  if not found then raise exception 'Forbidden' using errcode='42501'; end if;
  if p_project_id is null or p_mode is null or p_mode not in ('RESTRICTED','SHARED_INTERNAL')
    or p_expected_revision is null or p_expected_revision not between 0 and 9007199254740991 or p_request_id is null then
    raise exception 'Invalid project sharing request' using errcode='22023'; end if;
  -- Same native manager scope as Phase 29. Lock the parent even before the first setting exists.
  perform 1 from public.projects where id=p_project_id for update;
  if not found then raise exception 'Project not found' using errcode='P0002'; end if;
  v_payload:=jsonb_build_object('mode',p_mode,'expected_revision',p_expected_revision);
  select * into v_r from public.project_document_sharing_requests where project_id=p_project_id and request_id=p_request_id;
  if found then
    if v_r.actor_id is distinct from p_actor_id or v_r.payload is distinct from v_payload then
      raise exception 'Sharing receipt conflicts' using errcode='40001'; end if;
    return v_r.result || jsonb_build_object('replayed',true);
  end if;
  insert into public.project_document_sharing(project_id) values(p_project_id) on conflict(project_id) do nothing;
  select * into v_s from public.project_document_sharing where project_id=p_project_id for update;
  if v_s.revision <> p_expected_revision then raise exception 'Sharing changed; reload' using errcode='40001'; end if;
  v_before:=v_s.access_mode; v_changed:=v_before is distinct from p_mode;
  if v_changed then
    update public.project_document_sharing set access_mode=p_mode,revision=revision+1,updated_at=now(),updated_by=p_actor_id
      where project_id=p_project_id returning * into v_s;
    -- Reuse Phase 29 private audit and its restrictive policies; no second audit system.
    insert into public.activity_logs(project_id,user_id,action,description,document_access_audit)
    values(p_project_id,p_actor_id,'DOCUMENT_ACCESS_CHANGED','DOCUMENT_ACCESS_CHANGED',jsonb_build_object(
      'source_type','PROJECT','object_id',p_project_id,'before',jsonb_build_object('mode',v_before),
      'after',jsonb_build_object('mode',p_mode),'revision',v_s.revision,'request_id',p_request_id));
  end if;
  v_result:=jsonb_build_object('mode',v_s.access_mode,'revision',v_s.revision,'changed',v_changed,'replayed',false);
  insert into public.project_document_sharing_requests(project_id,request_id,actor_id,payload,result)
    values(p_project_id,p_request_id,p_actor_id,v_payload,v_result);
  return v_result;
end $$;
revoke all on function public.get_project_document_sharing(uuid,uuid) from public,anon,authenticated;
revoke all on function public.set_project_document_sharing(uuid,uuid,text,bigint,uuid) from public,anon,authenticated;
grant execute on function public.get_project_document_sharing(uuid,uuid),public.set_project_document_sharing(uuid,uuid,text,bigint,uuid) to service_role;

create or replace function public.list_document_repository_access(p_actor_id uuid,p_source_type text)
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
    null::uuid as acl_id,coalesce(a.access_mode,'RESTRICTED') as mode,coalesce(a.revision,0) as rev
  from public.documents d left join public.project_document_sharing a on a.project_id=d.project_id
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
    null::uuid,coalesce(a.access_mode,'RESTRICTED'),coalesce(a.revision,0)
  from public.project_output_documents d left join public.project_document_sharing a on a.project_id=d.project_id
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
  or (s.valid_approved and s.mode='SHARED_INTERNAL');
$$;

-- Retire old writer even for stale backend instances. Old data stays available for investigation.
create or replace function public.set_document_repository_access(p_actor_id uuid,p_source_type text,p_source_id uuid,
  p_mode text,p_grants uuid[],p_expected_revision bigint,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin raise exception 'Per-document sharing is retired; use project sharing' using errcode='0A000'; end $$;
revoke all on function public.set_document_repository_access(uuid,text,uuid,text,uuid[],bigint,uuid) from public,anon,authenticated,service_role;
-- Preserve service-only read permission and the original safe RPC response shape.
revoke all on function public.list_document_repository_access(uuid,text) from public,anon,authenticated;
grant execute on function public.list_document_repository_access(uuid,text) to service_role;
commit;
