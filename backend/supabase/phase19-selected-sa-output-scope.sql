-- Apply after the already-applied Phase 18a, before deploying the scoped-stage
-- application. Phase 18b remains the later contract step. Do not auto-rewrite
-- existing ACTIVE or final projects.
begin;

create table if not exists public.output_document_stage_catalog (
  document_key text primary key,
  title text not null,
  stage_key text not null,
  group_key text not null check (group_key in ('PRA_TENDER','ON_SUBMISSION_TENDER')),
  is_required boolean not null
);

insert into public.output_document_stage_catalog(document_key,title,stage_key,group_key,is_required) values
  ('proposal_deck_solusi','Proposal atau Deck Solusi','PROPOSAL_SOLUTION','PRA_TENDER',true),
  ('poc_demo','POC atau Demo','DELIVERABLES','PRA_TENDER',false),
  ('assessment','Assessment','ASSESSMENT_REPORT','PRA_TENDER',false),
  ('kak_rfp','KAK atau RFP','REQUIREMENT_GATHERING','PRA_TENDER',false),
  ('rab','RAB','TECHNICAL_PROPOSAL_BOQ','PRA_TENDER',false),
  ('kajian_teknis','Kajian Teknis','PAIN_POINT_ANALYSIS','PRA_TENDER',false),
  ('spesifikasi_teknis','Spesifikasi Teknis','TECHNICAL_PROPOSAL_BOQ','PRA_TENDER',false),
  ('analisa_kebutuhan','Analisa Kebutuhan','REQUIREMENT_GATHERING','PRA_TENDER',false),
  ('operational_requirement','Operational Requirement','REQUIREMENT_GATHERING','PRA_TENDER',false),
  ('rencana_distribusi','Rencana Distribusi','DELIVERABLES','PRA_TENDER',false),
  ('proposal_teknis','Proposal Teknis','TECHNICAL_PROPOSAL_BOQ','ON_SUBMISSION_TENDER',true),
  ('metodologi_implementasi','Metodologi Implementasi','PROPOSAL_SOLUTION','ON_SUBMISSION_TENDER',false),
  ('timeline_proyek','Timeline Proyek','TECHNICAL_PROPOSAL_BOQ','ON_SUBMISSION_TENDER',true),
  ('identitas_barang_produk','Identitas Barang/Produk yang Ditawarkan','DELIVERABLES','ON_SUBMISSION_TENDER',true),
  ('spesifikasi_teknis_toc','Spesifikasi Teknis Barang/Produk yang Ditawarkan atau TOC','TECHNICAL_PROPOSAL_BOQ','ON_SUBMISSION_TENDER',true),
  ('arsitektur_sistem','Arsitektur Sistem','PROPOSAL_SOLUTION','ON_SUBMISSION_TENDER',false),
  ('poc_demo_report','POC atau Solusi Demo Report','DELIVERABLES','ON_SUBMISSION_TENDER',false)
on conflict (document_key) do update set title = excluded.title, stage_key = excluded.stage_key,
  group_key = excluded.group_key, is_required = excluded.is_required;

revoke all on public.output_document_stage_catalog from public, anon, authenticated;
grant select on public.output_document_stage_catalog to service_role;

-- One transaction changes the stored checklist, its milestones, and output rows.
-- Retained milestone IDs keep their timeline and PIC. Empty DRAFT stages are
-- removed only when all dependent work/history checks pass.
create or replace function public.sync_draft_output_scope(
  p_project_id uuid, p_sales_id uuid, p_selected_keys text[]
)
returns table(selected_keys text[], milestone_count integer)
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_project public.projects%rowtype;
  v_scenario_name text;
  v_final text[];
  v_stage record;
  v_output record;
  v_milestone record;
  v_legacy_exists boolean;
begin
  select * into v_project from public.projects where id = p_project_id for update;
  if not found or v_project.sales_id is distinct from p_sales_id
    or v_project.status <> 'DRAFT' or coalesce(v_project.is_postponed,false)
    or not exists (select 1 from public.users where id = p_sales_id and role = 'SALES' and is_active is true) then
    raise exception 'Only the Sales owner may change an unlocked DRAFT scope';
  end if;
  if exists (select 1 from public.project_plan_approvals
    where project_id = p_project_id and status in ('PENDING','APPROVED')) then
    raise exception 'Project plan is pending review or locked';
  end if;
  select name into v_scenario_name from public.scenarios where id = v_project.scenario_id;
  if v_scenario_name not in ('Pra-Tender','On Submission Tender') or v_scenario_name is null then
    raise exception 'Unsupported project scenario';
  end if;
  if p_selected_keys is null or exists (
    select 1 from pg_catalog.unnest(p_selected_keys) k
    where k is null or pg_catalog.btrim(k) = '' or not exists (
      select 1 from public.output_document_stage_catalog c where c.document_key = k
        and (v_scenario_name = 'Pra-Tender' or c.group_key = 'ON_SUBMISSION_TENDER')
    )
  ) then raise exception 'Invalid output selection for scenario'; end if;

  select pg_catalog.array_agg(document_key order by document_key) into v_final
  from public.output_document_stage_catalog c
  where (v_scenario_name = 'Pra-Tender' or c.group_key = 'ON_SUBMISSION_TENDER')
    and (c.is_required or c.document_key = any(p_selected_keys));

  if exists (select 1 from public.project_milestones where project_id = p_project_id and status <> 'CREATED') then
    raise exception 'DRAFT milestone already contains workflow progress';
  end if;
  if exists (
    select 1 from public.project_output_documents od
    where od.project_id = p_project_id and not (od.document_key = any(v_final))
      and (od.status not in ('TO_DO','NOT_REQUIRED') or od.file_name is not null
        or od.storage_path is not null or od.current_version_id is not null
        or od.uploaded_at is not null or od.reviewed_at is not null
        or exists (select 1 from public.project_output_document_versions ov where ov.output_document_id = od.id))
  ) then raise exception 'An output to be removed has work or version history'; end if;
  if exists (
    select 1 from public.project_output_documents od
    join public.output_document_stage_catalog c on c.document_key = od.document_key
    left join public.project_milestones pm on pm.id = od.milestone_id
    left join public.workflow_stages ws on ws.id = pm.workflow_stage_id
    where od.project_id = p_project_id and od.document_key = any(v_final)
      and (od.status not in ('TO_DO','NOT_REQUIRED') or od.file_name is not null
        or od.storage_path is not null or od.current_version_id is not null
        or exists (select 1 from public.project_output_document_versions ov where ov.output_document_id = od.id))
      and (pm.id is null or pm.project_id is distinct from p_project_id
        or ws.stage_key is distinct from c.stage_key or ws.default_role is distinct from 'SA'
        or ws.scenario_id is distinct from v_project.scenario_id)
  ) then raise exception 'An output with work has an invalid milestone mapping'; end if;

  -- Preserve official files and every other milestone-linked record, even when
  -- the milestone is still CREATED.
  for v_milestone in
    select pm.id from public.project_milestones pm
    join public.workflow_stages ws on ws.id = pm.workflow_stage_id
    where pm.project_id = p_project_id and ws.default_role = 'SA'
      and not exists (
        select 1 from public.output_document_stage_catalog c
        where c.stage_key = ws.stage_key and c.document_key = any(v_final)
      )
  loop
    if exists (select 1 from public.documents where milestone_id = v_milestone.id)
      or exists (select 1 from public.milestone_contributions where milestone_id = v_milestone.id)
      or exists (select 1 from public.milestone_deadline_history where milestone_id = v_milestone.id)
      or exists (select 1 from public.milestone_deadline_approvals where milestone_id = v_milestone.id)
      or exists (select 1 from public.notifications where milestone_id = v_milestone.id) then
      raise exception 'An empty milestone has linked work or history';
    end if;
    if pg_catalog.to_regclass('public.milestone_submission_packages') is not null then
      execute 'select exists(select 1 from public.milestone_submission_packages where milestone_id = $1)'
        into v_legacy_exists using v_milestone.id;
      if v_legacy_exists then raise exception 'An empty milestone has legacy submissions'; end if;
    end if;
    if pg_catalog.to_regclass('public.milestone_approvals') is not null then
      execute 'select exists(select 1 from public.milestone_approvals where milestone_id = $1)'
        into v_legacy_exists using v_milestone.id;
      if v_legacy_exists then raise exception 'An empty milestone has legacy approvals'; end if;
    end if;
  end loop;

  -- No unselected output row with a file or history may be deleted.
  delete from public.project_output_documents od
  where od.project_id = p_project_id and not (od.document_key = any(v_final));
  delete from public.project_milestones pm using public.workflow_stages ws
  where pm.project_id = p_project_id and ws.id = pm.workflow_stage_id and ws.default_role = 'SA'
    and not exists (select 1 from public.output_document_stage_catalog c
      where c.stage_key = ws.stage_key and c.document_key = any(v_final));

  if exists (
    select 1 from public.output_document_stage_catalog c
    where c.document_key = any(v_final) and not exists (
      select 1 from public.workflow_stages ws where ws.scenario_id = v_project.scenario_id
        and ws.stage_key = c.stage_key and ws.default_role = 'SA' and ws.is_active is true)
  ) then raise exception 'Selected output has no active SA stage'; end if;
  if (select count(*) from public.workflow_stages
      where scenario_id = v_project.scenario_id and default_role = 'SALES' and stage_key = 'TENDER_PROCESS' and is_active is true) <> 1 then
    raise exception 'Final Sales stage is missing';
  end if;

  insert into public.project_milestones(project_id,workflow_stage_id,name,description,step_order,status)
  select p_project_id, ws.id, ws.name, ws.description, ws.step_order, 'CREATED'
  from public.workflow_stages ws
  where ws.scenario_id = v_project.scenario_id and ws.is_active is true
    and (ws.default_role = 'SALES' and ws.stage_key = 'TENDER_PROCESS'
      or ws.default_role = 'SA' and exists (select 1 from public.output_document_stage_catalog c
        where c.document_key = any(v_final) and c.stage_key = ws.stage_key))
  on conflict (project_id,workflow_stage_id) do nothing;

  update public.project_milestones pm set step_order = ranked.position, updated_at = pg_catalog.now()
  from (select pm2.id, pg_catalog.row_number() over (order by ws.step_order)::integer as position
    from public.project_milestones pm2 join public.workflow_stages ws on ws.id = pm2.workflow_stage_id
    where pm2.project_id = p_project_id) ranked
  where pm.id = ranked.id and pm.step_order is distinct from ranked.position;

  for v_output in
    select c.document_key,c.title,c.stage_key,c.is_required
    from public.output_document_stage_catalog c where c.document_key = any(v_final)
  loop
    select pm.id into v_milestone from public.project_milestones pm
    join public.workflow_stages ws on ws.id = pm.workflow_stage_id
    where pm.project_id = p_project_id and ws.scenario_id = v_project.scenario_id
      and ws.stage_key = v_output.stage_key and ws.default_role = 'SA';
    if v_milestone.id is null then raise exception 'Selected output has no project milestone'; end if;
    insert into public.project_output_documents(project_id,document_key,milestone_id,title,is_required,is_selected,status)
    values (p_project_id,v_output.document_key,v_milestone.id,v_output.title,v_output.is_required,true,'TO_DO')
    on conflict (project_id,document_key) do update
      set milestone_id = excluded.milestone_id, is_required = excluded.is_required,
        is_selected = true,
        status = case when public.project_output_documents.status = 'NOT_REQUIRED' then 'TO_DO'
          else public.project_output_documents.status end,
        updated_at = pg_catalog.now();
  end loop;

  update public.projects set selected_document_keys = pg_catalog.to_jsonb(v_final), updated_at = pg_catalog.now()
  where id = p_project_id;
  return query select v_final, (select count(*)::integer from public.project_milestones where project_id = p_project_id);
end;
$$;
revoke all on function public.sync_draft_output_scope(uuid,uuid,text[]) from public, anon, authenticated;
grant execute on function public.sync_draft_output_scope(uuid,uuid,text[]) to service_role;

-- Completion rejects a missing selected output row. Only old ACTIVE stages
-- without selected output retain the explicit PIC completion path.
create or replace function public.complete_sa_output_milestone(p_milestone_id uuid, p_actor_id uuid, p_allow_empty boolean default false)
returns table(changed boolean, project_id uuid) language plpgsql security invoker set search_path = public as $$
declare
  v_m public.project_milestones%rowtype;
  v_p public.projects%rowtype;
  v_stage public.workflow_stages%rowtype;
  v_scenario text;
  v_expected integer;
begin
  select * into v_m from public.project_milestones where id = p_milestone_id for update;
  if not found then raise exception 'Milestone not found'; end if;
  select * into v_p from public.projects where id = v_m.project_id;
  select * into v_stage from public.workflow_stages where id = v_m.workflow_stage_id;
  select name into v_scenario from public.scenarios where id = v_p.scenario_id;
  if v_stage.default_role is distinct from 'SA' or v_stage.scenario_id is distinct from v_p.scenario_id then
    raise exception 'Only SA output milestones use this completion gate';
  end if;
  if v_p.status <> 'ACTIVE' or v_p.is_postponed then raise exception 'Project is not active'; end if;
  if v_m.status = 'COMPLETED' then return query select false, v_m.project_id; return; end if;
  if v_m.status <> 'IN_PROGRESS' then raise exception 'Milestone is not in progress'; end if;
  if v_m.start_date is not null and v_m.start_date > (pg_catalog.now() at time zone 'Asia/Jakarta')::date then
    raise exception 'Milestone start date has not arrived';
  end if;
  perform 1 from public.project_output_documents where milestone_id = p_milestone_id for update;
  select count(*) into v_expected from public.output_document_stage_catalog c
    where c.stage_key = v_stage.stage_key
      and (v_scenario = 'Pra-Tender' or c.group_key = 'ON_SUBMISSION_TENDER')
      and (c.is_required or v_p.selected_document_keys ? c.document_key);
  if v_expected = 0 then
    if not p_allow_empty or v_m.pic_id is distinct from p_actor_id then
      raise exception 'Only the PIC may complete a stage without output'; end if;
  elsif exists (
    select 1 from public.output_document_stage_catalog c
    left join public.project_output_documents od on od.project_id = v_p.id
      and od.document_key = c.document_key
    where c.stage_key = v_stage.stage_key
      and (v_scenario = 'Pra-Tender' or c.group_key = 'ON_SUBMISSION_TENDER')
      and (c.is_required or v_p.selected_document_keys ? c.document_key)
      and (od.id is null or od.milestone_id is distinct from v_m.id
        or od.is_required is distinct from c.is_required or od.is_selected is distinct from true
        or od.status <> 'APPROVED')
  ) then raise exception 'Selected output is missing or not approved';
  end if;
  update public.project_milestones set status = 'COMPLETED', completed_at = pg_catalog.now(), updated_at = pg_catalog.now()
    where id = p_milestone_id and status = 'IN_PROGRESS';
  return query select true, v_m.project_id;
end $$;
revoke all on function public.complete_sa_output_milestone(uuid,uuid,boolean) from public, anon, authenticated;
grant execute on function public.complete_sa_output_milestone(uuid,uuid,boolean) to service_role;

commit;
