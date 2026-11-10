-- Apply after phase42 and before deploying the matching evidence upload API.
-- Previously recorded results retain their existing evidence links and retry behavior.
begin;

alter table public.document_versions
  add column if not exists is_outcome_evidence boolean not null default false;

create or replace function public.validate_outcome_evidence(p_project_id uuid,p_actor_id uuid,p_outcome text,p_ids uuid[])
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare v_p public.projects%rowtype;v_final uuid;v_count integer;
begin
  select * into v_p from public.projects where id=p_project_id for update;
  if not found then raise exception 'Project not found' using errcode='22023'; end if;
  if v_p.sales_id is distinct from p_actor_id or not exists(select 1 from public.users where id=p_actor_id and is_active and role='SALES') then raise exception 'Forbidden' using errcode='42501';end if;
  if p_outcome not in ('WON','LOST') or coalesce(cardinality(p_ids),0) not between 1 and 10
    or cardinality(p_ids)<>(select count(distinct x) from unnest(p_ids) x) then raise exception 'Valid result evidence is required' using errcode='22023';end if;
  if v_p.status in ('WON','LOST') then
    if v_p.status<>p_outcome or exists(select 1 from unnest(p_ids) x where not exists(select 1 from public.project_outcome_evidence e where e.project_id=p_project_id and e.document_id=x and e.outcome=p_outcome))
      or exists(select 1 from public.project_outcome_evidence e where e.project_id=p_project_id and not(e.document_id=any(p_ids))) then raise exception 'Project result already recorded' using errcode='55000';end if;
    return;
  end if;
  if v_p.status not in ('ACTIVE','WAITING_RESULT') or v_p.is_postponed then raise exception 'Project result is not editable' using errcode='55000';end if;
  select m.id into v_final from public.project_milestones m join public.workflow_stages s on s.id=m.workflow_stage_id
    where m.project_id=v_p.id and m.phase_id is not distinct from v_p.active_phase_id and s.default_role='SALES'
      and not exists(select 1 from public.project_milestones later where later.project_id=v_p.id and later.phase_id is not distinct from v_p.active_phase_id and later.step_order>m.step_order)
    order by m.step_order desc limit 1;
  if v_final is null then raise exception 'Final Sales milestone required' using errcode='55000';end if;
  perform 1 from public.documents where id=any(p_ids) for update;
  perform 1 from public.document_versions where document_id=any(p_ids) and is_latest for update;
  select count(distinct d.id) into v_count from public.documents d join public.document_versions v on v.document_id=d.id
    where d.id=any(p_ids) and d.project_id=v_p.id and d.milestone_id=v_final and d.status='DRAFT'
      and v.is_latest and v.status='DRAFT' and v.is_outcome_evidence and v.uploaded_by=p_actor_id and v.file_size between 1 and 52428800
      and lower(v.file_name) ~ '\.(jpg|jpeg|png|pdf|doc|docx)$' and nullif(v.storage_path,'') is not null;
  if v_count<>cardinality(p_ids) then raise exception 'Valid result evidence is required' using errcode='22023';end if;
  update public.documents set status='APPROVED' where id=any(p_ids);
  update public.document_versions set status='APPROVED' where document_id=any(p_ids) and is_latest;
  delete from public.project_outcome_evidence where project_id=v_p.id;
  insert into public.project_outcome_evidence(project_id,document_id,version_id,outcome,recorded_by)
    select v_p.id,d.id,v.id,p_outcome,p_actor_id from public.documents d join public.document_versions v on v.document_id=d.id and v.is_latest where d.id=any(p_ids);
end $$;
revoke all on function public.validate_outcome_evidence(uuid,uuid,text,uuid[]) from public,anon,authenticated,service_role;

-- Serialize discard and result recording on the same project row. A discarded
-- draft remains eligible for cleanup retries but can no longer be finalized.
create or replace function public.claim_discarded_outcome_evidence(p_project_id uuid, p_actor_id uuid, p_document_ids uuid[])
returns table(document_id uuid, storage_path text)
language plpgsql security definer set search_path=pg_catalog as $$
begin
  perform 1 from public.projects p where p.id=p_project_id and p.sales_id=p_actor_id for update;
  if not found or not exists(select 1 from public.users u where u.id=p_actor_id and u.is_active and u.role='SALES') then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  if coalesce(cardinality(p_document_ids),0) not between 1 and 10 then
    raise exception 'Invalid result evidence IDs' using errcode='22023';
  end if;

  return query
    with claimed as (
      update public.documents d set status='REJECTED'
      where d.project_id=p_project_id and d.id=any(p_document_ids) and d.status in ('DRAFT','REJECTED')
        and exists(select 1 from public.document_versions v where v.document_id=d.id and v.is_latest
          and v.is_outcome_evidence and v.status='DRAFT' and v.uploaded_by=p_actor_id)
        and not exists(select 1 from public.project_outcome_evidence e where e.document_id=d.id)
      returning d.id
    )
    select c.id,v.storage_path from claimed c join public.document_versions v on v.document_id=c.id
    where v.is_latest and v.is_outcome_evidence and v.uploaded_by=p_actor_id;
end $$;
revoke all on function public.claim_discarded_outcome_evidence(uuid,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.claim_discarded_outcome_evidence(uuid,uuid,uuid[]) to service_role;

commit;
