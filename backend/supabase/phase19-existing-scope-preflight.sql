-- Read-only review after Phase 19, before application rollout.
-- Do not automatically delete or reconcile ACTIVE, WAITING_RESULT, WON, or LOST projects.
with selected as (
  select p.id as project_id, p.status, p.sales_id, s.name as scenario,
    c.stage_key, count(*) as selected_output_count
  from public.projects p
  join public.scenarios s on s.id = p.scenario_id
  join public.output_document_stage_catalog c
    on (s.name = 'Pra-Tender' or c.group_key = 'ON_SUBMISSION_TENDER')
   and (c.is_required or p.selected_document_keys ? c.document_key)
  group by p.id, p.status, p.sales_id, s.name, c.stage_key
)
select p.id as project_id, p.status, s.name as scenario, pm.id as milestone_id,
  ws.stage_key, ws.default_role, pm.status as milestone_status,
  coalesce(sel.selected_output_count, 0) as selected_output_count,
  (select count(*) from public.documents d where d.milestone_id = pm.id) as official_document_count,
  (select count(*) from public.milestone_contributions mc where mc.milestone_id = pm.id) as contribution_count,
  (select count(*) from public.project_output_documents od where od.milestone_id = pm.id
    and od.status not in ('TO_DO','NOT_REQUIRED')) as worked_output_count
from public.projects p
join public.scenarios s on s.id = p.scenario_id
join public.project_milestones pm on pm.project_id = p.id
join public.workflow_stages ws on ws.id = pm.workflow_stage_id
left join selected sel on sel.project_id = p.id and sel.stage_key = ws.stage_key
where ws.default_role = 'SA' and coalesce(sel.selected_output_count, 0) = 0
order by p.status, p.id, pm.step_order;

-- Review DRAFT projects separately. Their Sales owner may resave the output
-- checklist in the new application, which calls sync_draft_output_scope.
-- That RPC refuses deletion if the stage or output has work/history and rolls
-- back the entire scope change. Never call it for an ACTIVE or final project.
select p.id as project_id, p.sales_id, s.name as scenario,
  p.selected_document_keys,
  count(pm.id) filter (where ws.default_role = 'SA') as sa_milestones,
  count(pm.id) filter (where ws.default_role = 'SALES') as sales_milestones
from public.projects p
join public.scenarios s on s.id = p.scenario_id
left join public.project_milestones pm on pm.project_id = p.id
left join public.workflow_stages ws on ws.id = pm.workflow_stage_id
where p.status = 'DRAFT'
group by p.id, p.sales_id, s.name, p.selected_document_keys
order by p.id;
