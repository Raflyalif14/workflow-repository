-- Apply after phase34, before deploying the matching backend. No files or historic results are removed.
begin;

create table if not exists public.project_outcome_evidence (
  project_id uuid not null references public.projects(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  version_id uuid not null references public.document_versions(id) on delete cascade,
  outcome text not null check (outcome in ('WON','LOST')),
  recorded_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  primary key(project_id,document_id)
);
alter table public.project_outcome_evidence enable row level security;
revoke all on public.project_outcome_evidence from public,anon,authenticated;
grant select,insert,update,delete on public.project_outcome_evidence to service_role;

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
    where d.id=any(p_ids) and d.project_id=v_p.id and d.milestone_id=v_final and d.status='APPROVED'
      and v.is_latest and v.status='APPROVED' and v.uploaded_by=p_actor_id and v.file_size between 1 and 52428800
      and lower(v.file_name) ~ '\.(jpg|jpeg|png|pdf|doc|docx)$' and nullif(v.storage_path,'') is not null;
  if v_count<>cardinality(p_ids) then raise exception 'Valid result evidence is required' using errcode='22023';end if;
  delete from public.project_outcome_evidence where project_id=v_p.id;
  insert into public.project_outcome_evidence(project_id,document_id,version_id,outcome,recorded_by)
    select v_p.id,d.id,v.id,p_outcome,p_actor_id from public.documents d join public.document_versions v on v.document_id=d.id and v.is_latest where d.id=any(p_ids);
end $$;
revoke all on function public.validate_outcome_evidence(uuid,uuid,text,uuid[]) from public,anon,authenticated,service_role;

create or replace function public.complete_final_sales_with_evidence(p_milestone_id uuid,p_sales_id uuid,p_outcome text,p_final_contract_value numeric,p_loss_reason text,p_required_output_keys text[],p_evidence_document_ids uuid[])
returns table(changed boolean,project_id uuid,milestone_name text,completed_at timestamptz,project_status text)
language plpgsql security definer set search_path=pg_catalog as $$
declare v_p public.projects%rowtype;
begin
  select p.* into v_p from public.projects p join public.project_milestones m on m.project_id=p.id where m.id=p_milestone_id for update of p;
  if not found then raise exception 'Milestone not found';end if;
  perform public.validate_outcome_evidence(v_p.id,p_sales_id,p_outcome,p_evidence_document_ids);
  if v_p.active_phase_id is null then
    return query select * from public.complete_final_sales_milestone_with_outcome(p_milestone_id,p_sales_id,p_outcome,p_final_contract_value,p_loss_reason,p_required_output_keys);
  else
    return query select * from public.complete_phase_final_sales_milestone_with_outcome(p_milestone_id,p_sales_id,p_outcome,p_final_contract_value,p_loss_reason,p_required_output_keys);
  end if;
end $$;
revoke all on function public.complete_final_sales_with_evidence(uuid,uuid,text,numeric,text,text[],uuid[]) from public,anon,authenticated;
grant execute on function public.complete_final_sales_with_evidence(uuid,uuid,text,numeric,text,text[],uuid[]) to service_role;

create or replace function public.mutate_project_outcome_with_evidence(p_project_id uuid,p_actor_id uuid,p_action text,p_payload jsonb,p_expected_updated_at timestamptz,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_ids uuid[];
begin
  if p_action<>'OUTCOME' then raise exception 'Invalid action' using errcode='22023';end if;
  select array_agg(x::uuid) into v_ids from jsonb_array_elements_text(p_payload->'evidence_document_ids') x;
  perform public.validate_outcome_evidence(p_project_id,p_actor_id,p_payload->>'outcome',v_ids);
  return public.mutate_project_business(p_project_id,p_actor_id,p_action,p_payload-'evidence_document_ids',p_expected_updated_at,p_request_id);
end $$;
revoke all on function public.mutate_project_outcome_with_evidence(uuid,uuid,text,jsonb,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.mutate_project_outcome_with_evidence(uuid,uuid,text,jsonb,timestamptz,uuid) to service_role;

create or replace function public.require_result_evidence() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
  if new.status in ('WON','LOST') and old.status is distinct from new.status
    and not exists(select 1 from public.project_outcome_evidence e where e.project_id=new.id and e.outcome=new.status::text) then
    raise exception 'Result evidence is required' using errcode='22023';
  end if;
  return new;
end $$;
create trigger require_result_evidence before update of status on public.projects for each row execute function public.require_result_evidence();
revoke all on function public.require_result_evidence() from public,anon,authenticated;

create or replace function public.start_parallel_milestone(p_milestone_id uuid,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_p public.projects%rowtype;v_m public.project_milestones%rowtype;v_role text;v_actor public.users%rowtype;
begin
  select p.* into v_p from public.projects p join public.project_milestones m on m.project_id=p.id where m.id=p_milestone_id for update of p;
  select * into v_m from public.project_milestones where id=p_milestone_id for update;
  if not found then raise exception 'Milestone not found' using errcode='22023';end if;
  select * into v_actor from public.users where id=p_actor_id and is_active;
  select default_role into v_role from public.workflow_stages where id=v_m.workflow_stage_id;
  if v_actor.id is null or not (v_role='SALES' and v_actor.role='SALES' and v_p.sales_id=p_actor_id
    or v_role='SA' and v_actor.role in ('SA','HEAD_SA') and coalesce(v_m.pic_id,v_p.pic_id)=p_actor_id
    or v_role='HEAD_SA' and v_actor.role='HEAD_SA') then raise exception 'Forbidden' using errcode='42501';end if;
  if v_p.status<>'ACTIVE' or coalesce(v_p.is_postponed,false) or v_m.phase_id is distinct from v_p.active_phase_id or v_p.pic_id is null then raise exception 'Project is not ready' using errcode='55000';end if;
  if not exists(select 1 from public.project_plan_approvals a where a.project_id=v_p.id and a.phase_id is not distinct from v_p.active_phase_id and a.status='APPROVED') then raise exception 'Approved project plan required' using errcode='55000';end if;
  if v_m.start_date is null or v_m.start_date>(now() at time zone 'Asia/Jakarta')::date then raise exception 'Start date has not arrived' using errcode='55000';end if;
  if v_role='SALES' and not exists(select 1 from public.project_milestones later where later.project_id=v_p.id and later.phase_id is not distinct from v_p.active_phase_id and later.step_order>v_m.step_order) and exists(select 1 from public.project_milestones m where m.project_id=v_p.id and m.phase_id is not distinct from v_p.active_phase_id and m.id<>v_m.id and m.status not in ('COMPLETED','APPROVED')) then raise exception 'Other milestones must be completed first' using errcode='55000';end if;
  if v_m.status='IN_PROGRESS' then return jsonb_build_object('id',v_m.id,'status',v_m.status,'changed',false);end if;
  if v_m.status<>'CREATED' then raise exception 'Milestone cannot start' using errcode='55000';end if;
  update public.project_milestones set status='IN_PROGRESS',pic_id=case when v_role='SA' then coalesce(pic_id,v_p.pic_id) else pic_id end,updated_at=now() where id=v_m.id;
  perform public.record_business_change(v_p.id,p_actor_id,'MILESTONE_STARTED','MILESTONE',v_m.id,jsonb_build_object('status','CREATED'),jsonb_build_object('status','IN_PROGRESS'));
  return jsonb_build_object('id',v_m.id,'status','IN_PROGRESS','changed',true);
end $$;
revoke all on function public.start_parallel_milestone(uuid,uuid) from public,anon,authenticated;
grant execute on function public.start_parallel_milestone(uuid,uuid) to service_role;

-- Existing plan/PIC activation may nominate a first stage. Keep future stages unstarted.
create or replace function public.keep_future_milestone_unstarted() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
  if new.status='IN_PROGRESS' and new.start_date>(now() at time zone 'Asia/Jakarta')::date then
    if TG_OP='INSERT' then new.status:='CREATED';elsif old.status='CREATED' then new.status:='CREATED';end if;
  end if;
  return new;
end $$;
create trigger keep_future_milestone_unstarted before insert or update of status on public.project_milestones for each row execute function public.keep_future_milestone_unstarted();
revoke all on function public.keep_future_milestone_unstarted() from public,anon,authenticated;

update public.output_document_stage_catalog set is_required=(document_key='proposal_teknis') where group_key='ON_SUBMISSION_TENDER';
-- Preserve existing selections and all uploaded files; only remove the mandatory classification.
update public.project_output_documents od set is_required=false where document_key in ('timeline_proyek','identitas_barang_produk','spesifikasi_teknis_toc') and is_required;
commit;
