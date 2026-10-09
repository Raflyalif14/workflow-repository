-- Additive. Apply manually after Phase33, with all old artifact writers drained.
-- Storage is outside PostgreSQL. RESERVED/FROZEN receipts retain exact owned paths.
begin;
do $$ begin
  if to_regclass('public.milestone_contribution_attachments') is null or
    to_regclass('public.project_business_requests') is null then raise exception 'Phase34 requires Phase30-33'; end if;
end $$;
create table public.artifact_mutation_requests (
  request_id uuid primary key, actor_id uuid not null, project_id uuid not null,
  operation text not null check(operation in ('VERSION','REVIEW','COMMENT','CONTRIBUTION','PROMOTE')),
  payload jsonb not null, manifest jsonb not null default '[]', retired_manifest jsonb not null default '[]', result jsonb,
  object_id uuid not null, token uuid not null default gen_random_uuid(),
  status text not null check(status in ('RESERVED','COMMITTED','FROZEN')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
-- Only one worker may copy/promote an attachment. Other operations use request IDs.
create unique index artifact_one_promotion on public.artifact_mutation_requests((payload->>'attachment_id'))
  where operation='PROMOTE' and status='RESERVED';
alter table public.artifact_mutation_requests enable row level security;
revoke all on public.artifact_mutation_requests from public,anon,authenticated,service_role;
grant select on public.artifact_mutation_requests to service_role;

-- Keep the existing UUID + sanitized basename/extension Storage naming convention.
create function public.artifact_storage_filename(p_name text) returns text language sql immutable set search_path=pg_catalog as $$
  with filename as (select regexp_replace(p_name,'^.*[/\\]','') as n),
  parts as (select n,coalesce(substring(n from '(\.[^.]*)$'),'') as extension from filename)
  select coalesce(nullif(left(regexp_replace(left(n,length(n)-length(extension)),'[^a-zA-Z0-9_-]','_','g'),120),''),'document')||lower(extension) from parts;
$$;
revoke all on function public.artifact_storage_filename(text) from public,anon,authenticated,service_role;

create function public.mutate_official_artifact(p_actor_id uuid,p_request_id uuid,p_operation text,
  p_payload jsonb,p_step text default 'COMMIT',p_token uuid default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
#variable_conflict use_column
declare
  v_u public.users%rowtype; v_p public.projects%rowtype; v_d public.documents%rowtype;
  v_v public.document_versions%rowtype; v_initial public.document_versions%rowtype;
  v_a public.document_version_approvals%rowtype; v_m public.project_milestones%rowtype;
  v_c public.milestone_contributions%rowtype; v_f public.milestone_contribution_attachments%rowtype;
  v_r public.artifact_mutation_requests%rowtype; v_s public.scenarios%rowtype;
  v_project uuid; v_object uuid; v_version uuid; v_item jsonb; v_files jsonb := '[]';
  v_approvals_before jsonb; v_restart boolean := false; v_before jsonb; v_after jsonb; v_result jsonb; v_action text; v_number integer; v_comment public.document_comments%rowtype;
begin
  if p_request_id is null or p_actor_id is null or p_operation is null or p_operation not in ('VERSION','REVIEW','COMMENT','CONTRIBUTION','PROMOTE')
    or p_step is null or p_step not in ('LOOKUP','RESERVE','COMMIT','CANCEL') or jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'Invalid artifact request' using errcode='22023'; end if;
  -- Discover identity without locking; every write then follows project -> object -> receipt.
  if p_operation in ('VERSION','COMMENT','REVIEW') then
    if p_operation='REVIEW' then
      select * into v_v from public.document_versions where id=(p_payload->>'version_id')::uuid;
      select * into v_d from public.documents where id=v_v.document_id;
    else select * into v_d from public.documents where id=(p_payload->>'document_id')::uuid; end if;
    v_project:=v_d.project_id;
  else
    select * into v_m from public.project_milestones where id=(p_payload->>'milestone_id')::uuid;
    v_project:=v_m.project_id;
  end if;
  select * into v_p from public.projects where id=v_project for update;
  if not found then raise exception 'Artifact not found' using errcode='P0002'; end if;
  select * into v_u from public.users where id=p_actor_id for share;
  if not found or v_u.is_active is distinct from true or coalesce(v_u.must_change_password,false) then
    raise exception 'Forbidden' using errcode='42501'; end if;
  if p_operation in ('VERSION','COMMENT','REVIEW') then
    select * into v_d from public.documents where id=v_d.id and project_id=v_p.id for update;
    if not found then raise exception 'Artifact not found' using errcode='P0002'; end if;
    if not (v_u.role in ('HEAD_SA','SUPER_ADMIN') or v_u.role='SALES' and v_p.sales_id=p_actor_id
      or v_u.role='SA' and v_p.pic_id=p_actor_id) then raise exception 'Forbidden' using errcode='42501'; end if;
    if p_operation='REVIEW' and v_u.role not in ('HEAD_SA','SUPER_ADMIN') then raise exception 'Forbidden' using errcode='42501'; end if;
    if p_operation='VERSION' then
      select * into v_initial from public.document_versions where document_id=v_d.id order by version_number,id limit 1;
      if not found or v_u.role not in ('SALES','SA','HEAD_SA') or not (
        case when v_initial.changelog in ('Initial SALES milestone document upload.','Promoted from supporting input.')
          then v_u.role='SALES' and v_p.sales_id=p_actor_id
        when v_initial.changelog='Promoted from approved milestone submission.' then v_u.role in ('SA','HEAD_SA') and v_p.pic_id=p_actor_id
        else v_initial.uploaded_by=p_actor_id end) then raise exception 'Forbidden' using errcode='42501'; end if;
    end if;
    v_object:=v_d.id;
  else
    select * into v_m from public.project_milestones where id=v_m.id and project_id=v_p.id for update;
    if not found then raise exception 'Artifact not found' using errcode='P0002'; end if;
    select * into v_s from public.scenarios where id=v_p.scenario_id;
    if v_s.workflow_model is distinct from 'OPERATIONAL_V2' or v_s.workflow_version is distinct from 2 or v_m.step_order<>1 then
      raise exception 'Invalid contribution milestone' using errcode='55000'; end if;
    if p_operation='CONTRIBUTION' then
      if v_u.role<>'SALES' or v_p.sales_id<>p_actor_id then raise exception 'Forbidden' using errcode='42501'; end if;
      v_object:=v_m.id;
    else
      if v_u.role not in ('HEAD_SA','SUPER_ADMIN') then raise exception 'Forbidden' using errcode='42501'; end if;
      select * into v_c from public.milestone_contributions where id=(p_payload->>'contribution_id')::uuid
        and project_id=v_p.id and milestone_id=v_m.id and status='READY' for update;
      select * into v_f from public.milestone_contribution_attachments where id=(p_payload->>'attachment_id')::uuid and contribution_id=v_c.id for update;
      if not found then raise exception 'Attachment not found' using errcode='P0002'; end if;
      v_object:=v_f.id;
    end if;
  end if;
  select * into v_r from public.artifact_mutation_requests where request_id=p_request_id for update;
  if found then
    if v_r.actor_id<>p_actor_id or v_r.operation<>p_operation or v_r.project_id<>v_p.id
      or (v_r.payload-'expected_updated_at') is distinct from (p_payload-'expected_updated_at') then
      raise exception 'Conflicting receipt' using errcode='40001'; end if;
    if v_r.status='COMMITTED' then return jsonb_build_object('state','COMMITTED','result',v_r.result); end if;
    if p_step='LOOKUP' then return jsonb_build_object('state',v_r.status); end if;
    if v_r.status='FROZEN' then
      if p_step<>'RESERVE' then raise exception 'Frozen upload' using errcode='55000'; end if;
      v_restart:=true; p_payload:=v_r.payload;
    end if;
    if not v_restart then
    if p_step='RESERVE' then raise exception 'Artifact upload is already reserved' using errcode='55P03'; end if;
    if v_r.token is distinct from p_token then raise exception 'Worker does not own reservation' using errcode='42501'; end if;
    if p_step='CANCEL' then
      -- Lock serializes against a late COMMIT. After this fence no worker can attach these paths.
      if exists(select 1 from jsonb_array_elements(v_r.manifest) f where
        exists(select 1 from public.document_versions where storage_path=f->>'path') or
        exists(select 1 from public.milestone_contribution_attachments where storage_path=f->>'path')) then
        raise exception 'Reserved path is referenced' using errcode='55000'; end if;
      update public.artifact_mutation_requests set status='FROZEN',updated_at=now() where request_id=p_request_id;
      return jsonb_build_object('state','FROZEN','files',v_r.manifest);
    end if;
    p_payload:=v_r.payload; -- CAS captured at reservation, never refreshed silently.
    end if;
  end if;
  if v_r.request_id is null or v_restart then
    if p_step='LOOKUP' then return jsonb_build_object('state','NONE'); end if;
    if p_step='CANCEL' or p_step='COMMIT' and p_operation in ('VERSION','CONTRIBUTION','PROMOTE') then
      raise exception 'Reservation missing' using errcode='55000'; end if;
    if p_operation='PROMOTE' and v_f.promotion_status='PROMOTED' and v_f.promoted_document_id is not null then
      return jsonb_build_object('state','COMMITTED','result',jsonb_build_object('attachment_id',v_f.id,'promotion_status','PROMOTED','promoted_document_id',v_f.promoted_document_id,'idempotent',true)); end if;
    if p_operation='PROMOTE' and v_f.promotion_status<>'NOT_PROMOTED' then raise exception 'Promotion is in progress' using errcode='40001'; end if;
    if p_operation in ('VERSION','CONTRIBUTION') and (v_p.status<>'ACTIVE' or coalesce(v_p.is_postponed,false)) then
      raise exception 'Project is not active' using errcode='55000'; end if;
    if p_operation='CONTRIBUTION' and (v_m.status<>'IN_PROGRESS' or v_m.pic_id is null) then raise exception 'Milestone not writable' using errcode='55000'; end if;
    v_version:=gen_random_uuid();
    if p_operation='PROMOTE' then
      v_object:=gen_random_uuid();
      v_files:=jsonb_build_array(jsonb_build_object('id',v_version,'path',v_p.id::text||'/'||v_object::text||'/'||gen_random_uuid()::text||'-'||public.artifact_storage_filename(v_f.original_filename),
        'name',v_f.original_filename,'mime',v_f.mime_type,'size',v_f.size_bytes));
    elsif p_operation in ('VERSION','CONTRIBUTION') then
      if jsonb_typeof(p_payload->'files') is distinct from 'array' or jsonb_array_length(p_payload->'files')>10
        or p_operation='VERSION' and jsonb_array_length(p_payload->'files')<>1 then raise exception 'Invalid files' using errcode='22023'; end if;
      if p_operation='CONTRIBUTION' then v_object:=gen_random_uuid(); end if;
      for v_item in select value from jsonb_array_elements(p_payload->'files') loop
        if nullif(btrim(v_item->>'name'),'') is null or nullif(btrim(v_item->>'mime'),'') is null
          or v_item->>'size' is null or (v_item->>'size')::bigint not between 0 and 52428800 or coalesce(v_item->>'sha256','') !~ '^[0-9a-f]{64}$' then
          raise exception 'Invalid file manifest' using errcode='22023'; end if;
        v_files:=v_files||jsonb_build_array(v_item||jsonb_build_object('id',gen_random_uuid(),'path',
          case when p_operation='CONTRIBUTION' then 'milestone-contributions/'||v_p.id::text||'/'||v_m.id::text||'/'||v_object::text||'/'
            else v_p.id::text||'/'||v_d.id::text||'/' end||gen_random_uuid()::text||'-'||public.artifact_storage_filename(v_item->>'name')));
      end loop;
    end if;
    if v_restart then
      update public.artifact_mutation_requests set status='RESERVED',retired_manifest=retired_manifest||manifest,
        manifest=v_files,object_id=v_object,token=gen_random_uuid(),updated_at=now() where request_id=p_request_id returning * into v_r;
    else
      insert into public.artifact_mutation_requests(request_id,actor_id,project_id,operation,payload,manifest,object_id,status)
        values(p_request_id,p_actor_id,v_p.id,p_operation,p_payload,v_files,v_object,'RESERVED') returning * into v_r;
    end if;
    if p_step='RESERVE' then return jsonb_build_object('state','RESERVED','token',v_r.token,'files',v_r.manifest,'object_id',v_r.object_id); end if;
  end if;
  if p_step<>'COMMIT' then raise exception 'Invalid step' using errcode='22023'; end if;
  if p_operation in ('VERSION','CONTRIBUTION') and (v_p.status<>'ACTIVE' or coalesce(v_p.is_postponed,false)) then
    raise exception 'Project is not active' using errcode='55000'; end if;
  if p_operation in ('VERSION','REVIEW') and v_d.updated_at is distinct from (p_payload->>'expected_updated_at')::timestamptz then
    raise exception 'Stale document' using errcode='40001'; end if;
  if p_operation='VERSION' then
    if length(coalesce(p_payload->>'changelog',''))<2 then raise exception 'Invalid changelog' using errcode='22023'; end if;
    select coalesce(max(version_number),0)+1 into v_number from public.document_versions where document_id=v_d.id;
    select coalesce(jsonb_agg(jsonb_build_object('id',id,'status',status,'is_latest',is_latest) order by version_number),'[]') into v_before
      from public.document_versions where document_id=v_d.id;
    select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'status',a.status)),'[]') into v_approvals_before
      from public.document_version_approvals a join public.document_versions v on v.id=a.document_version_id where v.document_id=v_d.id;
    update public.document_version_approvals set status='REVISED' where status='PENDING' and document_version_id in
      (select id from public.document_versions where document_id=v_d.id and is_latest);
    update public.document_versions set status='SUPERSEDED',is_latest=false where document_id=v_d.id and is_latest;
    v_item:=v_r.manifest->0; v_version:=(v_item->>'id')::uuid;
    insert into public.document_versions(id,document_id,version_number,file_name,storage_path,file_size,mime_type,changelog,status,is_latest,uploaded_by)
      values(v_version,v_d.id,v_number,v_item->>'name',v_item->>'path',(v_item->>'size')::bigint,v_item->>'mime',btrim(p_payload->>'changelog'),'SUBMITTED',true,p_actor_id);
    insert into public.document_version_approvals(document_version_id,status,action_role) values(v_version,'PENDING','HEAD_SA');
    update public.documents set status='SUBMITTED',updated_at=clock_timestamp() where id=v_d.id;
    v_before:=jsonb_build_object('status',v_d.status,'versions',v_before,'approvals',v_approvals_before);
    v_after:=jsonb_build_object('status',(select status from public.documents where id=v_d.id),'version_id',v_version,'version_number',v_number,
      'versions',(select jsonb_agg(jsonb_build_object('id',id,'status',status,'is_latest',is_latest) order by version_number) from public.document_versions where document_id=v_d.id),
      'approvals',(select jsonb_agg(jsonb_build_object('id',a.id,'status',a.status)) from public.document_version_approvals a join public.document_versions v on v.id=a.document_version_id where v.document_id=v_d.id));
    v_action:='DOCUMENT_VERSION_UPLOADED';
    v_result:=jsonb_build_object('documentId',v_d.id,'versionId',v_version,'versionNumber',v_number,'status','SUBMITTED');
  elsif p_operation='REVIEW' then
    select * into v_v from public.document_versions where id=(p_payload->>'version_id')::uuid and document_id=v_d.id for update;
    select * into v_a from public.document_version_approvals where document_version_id=v_v.id and status='PENDING' for update;
    if not found or v_v.status<>'SUBMITTED' or not v_v.is_latest then raise exception 'Stale review' using errcode='40001'; end if;
    if p_payload->>'status' is null or p_payload->>'status' not in ('APPROVED','REJECTED') then raise exception 'Invalid decision' using errcode='22023'; end if;
    v_before:=jsonb_build_object('status',v_d.status,'version_status',v_v.status,'approval_status',v_a.status,'feedback',v_a.feedback);
    update public.document_versions set status=p_payload->>'status' where id=v_v.id;
    update public.documents set status=p_payload->>'status',updated_at=clock_timestamp() where id=v_d.id;
    update public.document_version_approvals set status=p_payload->>'status',feedback=nullif(btrim(p_payload->>'feedback'),''),reviewed_by=p_actor_id,reviewed_at=now() where id=v_a.id;
    v_after:=jsonb_build_object('status',p_payload->>'status','version_status',p_payload->>'status','approval_status',p_payload->>'status','feedback',nullif(btrim(p_payload->>'feedback'),''),'reviewed_by',p_actor_id);
    v_action:=case when p_payload->>'status'='APPROVED' then 'DOCUMENT_APPROVED' else 'DOCUMENT_REJECTED' end;
    v_result:=jsonb_build_object('document_id',v_d.id);
  elsif p_operation='COMMENT' then
    if nullif(btrim(p_payload->>'content'),'') is null then raise exception 'Invalid comment' using errcode='22023'; end if;
    if p_payload->>'milestone_id' is not null and not exists(select 1 from public.project_milestones where id=(p_payload->>'milestone_id')::uuid and project_id=v_p.id) then
      raise exception 'Invalid milestone' using errcode='22023'; end if;
    insert into public.document_comments(document_id,milestone_id,author_id,content) values(v_d.id,
      coalesce((p_payload->>'milestone_id')::uuid,v_d.milestone_id),p_actor_id,btrim(p_payload->>'content')) returning * into v_comment;
    v_before:='{}'; v_after:=jsonb_build_object('comment_id',v_comment.id,'content',v_comment.content,'milestone_id',v_comment.milestone_id);
    v_action:='DOCUMENT_COMMENT_ADDED'; v_result:=to_jsonb(v_comment);
  elsif p_operation='CONTRIBUTION' then
    if v_m.status<>'IN_PROGRESS' or v_m.pic_id is null then raise exception 'Stale milestone' using errcode='40001'; end if;
    if nullif(btrim(p_payload->>'note'),'') is null and jsonb_array_length(v_r.manifest)=0 then raise exception 'Empty contribution' using errcode='22023'; end if;
    insert into public.milestone_contributions(id,project_id,milestone_id,contributed_by,note,status)
      values(v_r.object_id,v_p.id,v_m.id,p_actor_id,nullif(btrim(p_payload->>'note'),''),'READY') returning * into v_c;
    for v_item in select value from jsonb_array_elements(v_r.manifest) loop
      insert into public.milestone_contribution_attachments(id,contribution_id,original_filename,mime_type,size_bytes,storage_path)
        values((v_item->>'id')::uuid,v_c.id,v_item->>'name',v_item->>'mime',(v_item->>'size')::bigint,v_item->>'path'); end loop;
    v_before:='{}'; v_after:=jsonb_build_object('contribution_id',v_c.id,'note',v_c.note,'attachment_count',jsonb_array_length(v_r.manifest),'status',v_c.status);
    v_action:='SUPPORTING_INPUT_ADDED';
    v_result:=jsonb_build_object('contribution',to_jsonb(v_c),'attachments',(select coalesce(jsonb_agg(to_jsonb(a) order by f.ordinal),'[]') from jsonb_array_elements(v_r.manifest) with ordinality f(item,ordinal) join public.milestone_contribution_attachments a on a.id=(f.item->>'id')::uuid where a.contribution_id=v_c.id));
  else
    if v_f.promotion_status<>'NOT_PROMOTED' then raise exception 'Stale promotion' using errcode='40001'; end if;
    v_item:=v_r.manifest->0;
    insert into public.documents(id,project_id,milestone_id,title,category,status)
      values(v_r.object_id,v_p.id,v_m.id,left('Supporting document - '||v_f.original_filename,500),'OTHER','APPROVED');
    insert into public.document_versions(id,document_id,version_number,file_name,storage_path,file_size,mime_type,changelog,status,is_latest,uploaded_by)
      values((v_item->>'id')::uuid,v_r.object_id,1,v_f.original_filename,v_item->>'path',v_f.size_bytes,v_f.mime_type,'Promoted from supporting input.','APPROVED',true,v_c.contributed_by);
    update public.milestone_contribution_attachments set promotion_status='PROMOTED',promoted_document_id=v_r.object_id where id=v_f.id;
    v_before:=jsonb_build_object('promotion_status',v_f.promotion_status,'promoted_document_id',v_f.promoted_document_id);
    v_after:=jsonb_build_object('promotion_status','PROMOTED','promoted_document_id',v_r.object_id);
    v_action:='SUPPORTING_DOCUMENT_PROMOTED';
    v_result:=jsonb_build_object('attachment_id',v_f.id,'promotion_status','PROMOTED','promoted_document_id',v_r.object_id,'idempotent',false);
  end if;
  insert into public.activity_logs(project_id,user_id,action,description,business_audit)
    values(v_p.id,p_actor_id,v_action,v_action,jsonb_build_object('object_type',case when p_operation in ('VERSION','REVIEW') then 'OFFICIAL_DOCUMENT' when p_operation='COMMENT' then 'DOCUMENT_COMMENT' else 'SUPPORTING_CONTRIBUTION' end,'object_id',case when p_operation='COMMENT' then v_comment.id when p_operation='PROMOTE' then v_f.id else v_r.object_id end,
      'changed_fields',(select jsonb_agg(k) from jsonb_object_keys(v_after) k),'before',v_before,'after',v_after,'request_id',p_request_id));
  update public.artifact_mutation_requests set status='COMMITTED',result=v_result,updated_at=now() where request_id=p_request_id;
  return jsonb_build_object('state','COMMITTED','result',v_result);
end $$;
revoke all on function public.mutate_official_artifact(uuid,uuid,text,jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.mutate_official_artifact(uuid,uuid,text,jsonb,text,uuid) to service_role;
-- Preserve exact reserved bytes in project deletion cleanup as well as committed refs.
alter function public.delete_project_with_cleanup(uuid,text,uuid) rename to delete_project_with_cleanup_phase34_core;
revoke all on function public.delete_project_with_cleanup_phase34_core(uuid,text,uuid) from public,anon,authenticated,service_role;
create function public.delete_project_with_cleanup(p_project_id uuid,p_confirmation text,p_initiated_by uuid)
returns table(cleanup_id uuid,storage_paths jsonb,storage_object_count integer)
language plpgsql security definer set search_path=pg_catalog as $$
declare v_result record;v_paths jsonb;v_count bigint;
begin
  perform 1 from public.projects where id=p_project_id for update;
  select coalesce(jsonb_agg(distinct f->>'path'),'[]') into v_paths
    from public.artifact_mutation_requests r cross join lateral jsonb_array_elements(r.manifest||r.retired_manifest) f where r.project_id=p_project_id;
  select count(*) into v_count from public.artifact_mutation_requests where project_id=p_project_id;
  select * into v_result from public.delete_project_with_cleanup_phase34_core(p_project_id,p_confirmation,p_initiated_by);
  update public.artifact_mutation_requests set status='FROZEN',updated_at=now() where project_id=p_project_id and status='RESERVED';
  select coalesce(jsonb_agg(distinct value),'[]') into v_paths from jsonb_array_elements(v_paths||v_result.storage_paths);
  update public.project_deletion_cleanups set storage_paths=v_paths,storage_object_count=jsonb_array_length(v_paths),
    dependency_counts=dependency_counts||jsonb_build_object('artifact_mutation_requests',v_count) where id=v_result.cleanup_id;
  return query select v_result.cleanup_id,v_paths,jsonb_array_length(v_paths);
end $$;
revoke all on function public.delete_project_with_cleanup(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.delete_project_with_cleanup(uuid,text,uuid) to service_role;
commit;
