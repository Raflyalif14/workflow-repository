-- Phase 18a: expand first. Safe while the old application is running.
-- Apply after Phase 17 if Phase 17 is part of this deployment chain.
begin;

alter table public.workflow_stages add column if not exists stage_key text;

with keys(scenario_name, step_order, expected_name, expected_role, stage_key) as (values
  ('Pra-Tender', 1, 'Customer Assessment', 'SA', 'CUSTOMER_ASSESSMENT'),
  ('Pra-Tender', 2, 'Assessment Report', 'SA', 'ASSESSMENT_REPORT'),
  ('Pra-Tender', 3, 'Requirement Gathering', 'SA', 'REQUIREMENT_GATHERING'),
  ('Pra-Tender', 4, 'Pain Point Analysis', 'SA', 'PAIN_POINT_ANALYSIS'),
  ('Pra-Tender', 5, 'Proposal Solution', 'SA', 'PROPOSAL_SOLUTION'),
  ('Pra-Tender', 6, 'Deliverables', 'SA', 'DELIVERABLES'),
  ('Pra-Tender', 7, 'Technical Proposal & BOQ', 'SA', 'TECHNICAL_PROPOSAL_BOQ'),
  ('Pra-Tender', 8, 'Tender Process', 'SALES', 'TENDER_PROCESS'),
  ('On Submission Tender', 1, 'Requirement Gathering', 'SA', 'REQUIREMENT_GATHERING'),
  ('On Submission Tender', 2, 'Pain Point Analysis', 'SA', 'PAIN_POINT_ANALYSIS'),
  ('On Submission Tender', 3, 'Proposal Solution', 'SA', 'PROPOSAL_SOLUTION'),
  ('On Submission Tender', 4, 'Deliverables', 'SA', 'DELIVERABLES'),
  ('On Submission Tender', 5, 'Technical Proposal & BOQ', 'SA', 'TECHNICAL_PROPOSAL_BOQ'),
  ('On Submission Tender', 6, 'Tender Process', 'SALES', 'TENDER_PROCESS')
)
update public.workflow_stages ws set stage_key = keys.stage_key
from public.scenarios s join keys on keys.scenario_name = s.name
where ws.scenario_id = s.id and ws.step_order = keys.step_order
  and ws.default_role = keys.expected_role and ws.name = keys.expected_name
  and (ws.stage_key is null or ws.stage_key = keys.stage_key);

do $$ begin
  if exists (
    select 1 from public.workflow_stages ws join public.scenarios s on s.id = ws.scenario_id
    where s.name in ('Pra-Tender', 'On Submission Tender') and ws.stage_key is null
  ) then raise exception 'Phase 18: canonical stage identity/role mismatch'; end if;
end $$;
create unique index if not exists workflow_stages_scenario_stage_key_unique
  on public.workflow_stages(scenario_id, stage_key) where stage_key is not null;

alter table public.project_output_documents add column if not exists milestone_id uuid
  references public.project_milestones(id) on delete cascade;
create index if not exists project_output_documents_milestone_idx
  on public.project_output_documents(milestone_id, status);

with document_stage(document_key, stage_key) as (values
  ('proposal_deck_solusi','PROPOSAL_SOLUTION'), ('poc_demo','DELIVERABLES'),
  ('assessment','ASSESSMENT_REPORT'), ('kak_rfp','REQUIREMENT_GATHERING'),
  ('rab','TECHNICAL_PROPOSAL_BOQ'), ('kajian_teknis','PAIN_POINT_ANALYSIS'),
  ('spesifikasi_teknis','TECHNICAL_PROPOSAL_BOQ'), ('analisa_kebutuhan','REQUIREMENT_GATHERING'),
  ('operational_requirement','REQUIREMENT_GATHERING'), ('rencana_distribusi','DELIVERABLES'),
  ('proposal_teknis','TECHNICAL_PROPOSAL_BOQ'), ('metodologi_implementasi','PROPOSAL_SOLUTION'),
  ('timeline_proyek','TECHNICAL_PROPOSAL_BOQ'), ('identitas_barang_produk','DELIVERABLES'),
  ('spesifikasi_teknis_toc','TECHNICAL_PROPOSAL_BOQ'), ('arsitektur_sistem','PROPOSAL_SOLUTION'),
  ('poc_demo_report','DELIVERABLES')
)
update public.project_output_documents od set milestone_id = pm.id
from document_stage ds, public.project_milestones pm, public.workflow_stages ws
where od.document_key = ds.document_key and pm.project_id = od.project_id
  and ws.id = pm.workflow_stage_id and ws.stage_key = ds.stage_key
  and (od.milestone_id is null or od.milestone_id = pm.id);

do $$ begin
  if exists (select 1 from public.project_output_documents where milestone_id is null) then
    raise exception 'Phase 18: output document without matching SA milestone';
  end if;
end $$;
-- Atomic, idempotent SA completion. The service calls this only after a review
-- or for a PIC completing a stage with no selected output.
create or replace function public.complete_sa_output_milestone(p_milestone_id uuid, p_actor_id uuid, p_allow_empty boolean default false)
returns table(changed boolean, project_id uuid) language plpgsql security invoker set search_path = public as $$
declare v_m public.project_milestones%rowtype; v_p public.projects%rowtype; v_role text; v_count integer;
begin
  select * into v_m from public.project_milestones where id = p_milestone_id for update;
  if not found then raise exception 'Milestone not found'; end if;
  select * into v_p from public.projects where id = v_m.project_id;
  select default_role into v_role from public.workflow_stages where id = v_m.workflow_stage_id;
  if v_role <> 'SA' then raise exception 'Only SA output milestones use this completion gate'; end if;
  if v_p.status <> 'ACTIVE' or v_p.is_postponed then raise exception 'Project is not active'; end if;
  if v_m.status = 'COMPLETED' then return query select false, v_m.project_id; return; end if;
  if v_m.status <> 'IN_PROGRESS' then raise exception 'Milestone is not in progress'; end if;
  if v_m.start_date is not null and v_m.start_date > (now() at time zone 'Asia/Jakarta')::date then raise exception 'Milestone start date has not arrived'; end if;
  perform 1 from public.project_output_documents where milestone_id = p_milestone_id for update;
  select count(*) into v_count from public.project_output_documents od
    where od.milestone_id = p_milestone_id and (od.is_required or od.is_selected);
  if v_count = 0 then
    if not p_allow_empty or v_m.pic_id <> p_actor_id then raise exception 'Only the PIC may complete a stage without output'; end if;
  elsif exists (
    select 1 from public.project_output_documents od where od.milestone_id = p_milestone_id
      and (od.is_required or od.is_selected) and od.status <> 'APPROVED'
  ) then raise exception 'Selected outputs are not all approved';
  end if;
  update public.project_milestones set status = 'COMPLETED', completed_at = now(), updated_at = now()
    where id = p_milestone_id and status = 'IN_PROGRESS';
  return query select true, v_m.project_id;
end $$;
revoke all on function public.complete_sa_output_milestone(uuid,uuid,boolean) from public, anon, authenticated;
grant execute on function public.complete_sa_output_milestone(uuid,uuid,boolean) to service_role;

commit;
