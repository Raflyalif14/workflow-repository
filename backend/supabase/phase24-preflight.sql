-- READ ONLY. Run before Phase 24; no Storage paths or user content are selected.
select name,workflow_model,workflow_version,count(*) from public.scenarios
where name in ('Pra-Tender','On Submission Tender') group by name,workflow_model,workflow_version;
select group_key,count(*) as outputs,count(*) filter(where is_required) as required_outputs
from public.output_document_stage_catalog group by group_key;
select c.document_key,c.group_key,c.stage_key from public.output_document_stage_catalog c
where not exists(select 1 from public.workflow_stages ws join public.scenarios s on s.id = ws.scenario_id
  where s.name = case c.group_key when 'PRA_TENDER' then 'Pra-Tender' else 'On Submission Tender' end
    and ws.stage_key = c.stage_key and ws.default_role = 'SA' and ws.is_active);

-- Every existing project is retained as LEGACY_REVIEW, including DRAFT.
-- Stable catalog keys classify scope; status alone cannot decide phase boundaries.
select p.id,p.status,p.is_postponed,s.name as initial_scenario,
  count(od.id) filter(where c.group_key = 'PRA_TENDER') as pra_outputs,
  count(od.id) filter(where c.group_key = 'ON_SUBMISSION_TENDER') as tender_outputs,
  count(od.id) filter(where c.group_key = 'PRA_TENDER' and (od.status not in ('TO_DO','NOT_REQUIRED')
    or exists(select 1 from public.project_output_document_versions v where v.output_document_id = od.id)
    or exists(select 1 from public.project_output_document_files f where f.output_document_id = od.id)
    or exists(select 1 from public.project_output_document_draft_requests r where r.output_document_id = od.id))) as pra_work,
  count(od.id) filter(where c.group_key = 'ON_SUBMISSION_TENDER' and (od.status not in ('TO_DO','NOT_REQUIRED')
    or exists(select 1 from public.project_output_document_versions v where v.output_document_id = od.id)
    or exists(select 1 from public.project_output_document_files f where f.output_document_id = od.id)
    or exists(select 1 from public.project_output_document_draft_requests r where r.output_document_id = od.id))) as tender_work,
  count(od.id) filter(where c.document_key is null) as unknown_outputs
from public.projects p join public.scenarios s on s.id = p.scenario_id
left join public.project_output_documents od on od.project_id = p.id
left join public.output_document_stage_catalog c on c.document_key = od.document_key
group by p.id,p.status,p.is_postponed,s.name order by p.id;

-- Must be empty. Do not classify records with broken mappings.
select od.id,od.project_id,od.document_key,od.milestone_id
from public.project_output_documents od
left join public.output_document_stage_catalog c on c.document_key = od.document_key
left join public.project_milestones pm on pm.id = od.milestone_id and pm.project_id = od.project_id
left join public.workflow_stages ws on ws.id = pm.workflow_stage_id
where c.document_key is null or pm.id is null or ws.default_role is distinct from 'SA'
  or ws.stage_key is distinct from c.stage_key;

select pm.project_id,ws.stage_key,count(*) from public.project_milestones pm
join public.workflow_stages ws on ws.id = pm.workflow_stage_id
group by pm.project_id,ws.stage_key having count(*) > 1;
