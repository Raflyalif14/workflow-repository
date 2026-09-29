-- Run and save results before Phase 18. No writes or Storage deletion.
select 'milestone_submission_packages' as source, count(*) as records from public.milestone_submission_packages
union all select 'milestone_submission_attachments', count(*) from public.milestone_submission_attachments
union all select 'milestone_approvals', count(*) from public.milestone_approvals;

-- A non-SA role or invalid relationship must be resolved before Phase 18b.
-- Keep zero-count categories visible so an empty result cannot hide a missing join.
with approval_classification as (
  select ma.id,
    coalesce(ws.default_role, '<missing>') as stage_role,
    case
      when pm.id is null then 'MISSING_MILESTONE'
      when p.id is null then 'MISSING_PROJECT'
      when ws.id is null then 'MISSING_STAGE'
      when s.id is null then 'MISSING_SCENARIO'
      when ws.scenario_id is distinct from p.scenario_id then 'SCENARIO_MISMATCH'
      when ws.default_role is null or ws.default_role not in ('SA', 'SALES') then 'INVALID_STAGE_ROLE'
      else 'VALID'
    end as relationship_state
  from public.milestone_approvals ma
  left join public.project_milestones pm on pm.id = ma.milestone_id
  left join public.projects p on p.id = pm.project_id
  left join public.workflow_stages ws on ws.id = pm.workflow_stage_id
  left join public.scenarios s on s.id = p.scenario_id
), categories(stage_role, relationship_state) as (values
  ('SA', 'VALID'), ('SALES', 'VALID'), ('<missing>', 'MISSING_MILESTONE'),
  ('<missing>', 'MISSING_PROJECT'), ('<missing>', 'MISSING_STAGE'),
  ('<missing>', 'MISSING_SCENARIO'), ('<missing>', 'SCENARIO_MISMATCH'),
  ('<missing>', 'INVALID_STAGE_ROLE')
)
select coalesce(ac.stage_role, c.stage_role) as stage_role,
  coalesce(ac.relationship_state, c.relationship_state) as relationship_state,
  count(ac.id) as approval_count
from categories c
full join approval_classification ac
  on ac.stage_role = c.stage_role and ac.relationship_state = c.relationship_state
group by coalesce(ac.stage_role, c.stage_role), coalesce(ac.relationship_state, c.relationship_state)
order by relationship_state, stage_role;

select ma.id as approval_id, ma.milestone_id, pm.project_id, pm.workflow_stage_id,
  ws.default_role as stage_role, p.scenario_id as project_scenario_id,
  ws.scenario_id as stage_scenario_id
from public.milestone_approvals ma
left join public.project_milestones pm on pm.id = ma.milestone_id
left join public.projects p on p.id = pm.project_id
left join public.workflow_stages ws on ws.id = pm.workflow_stage_id
left join public.scenarios s on s.id = p.scenario_id
where pm.id is null or p.id is null or ws.id is null or s.id is null
  or ws.scenario_id is distinct from p.scenario_id
  or ws.default_role is distinct from 'SA'
order by ma.id;

select 'legacy_milestone_notifications' as source, count(*) as records from public.notifications
where type in ('MILESTONE_SUBMITTED','MILESTONE_APPROVED','MILESTONE_REJECTED')
union all select 'legacy_milestone_activity', count(*) from public.activity_logs
where action in ('MILESTONE_SUBMITTED','MILESTONE_APPROVED','MILESTONE_REJECTED','MILESTONE_REVISION_STARTED');

-- Exact objects to remove manually from the configured document bucket.
-- Keep a copy of this result until Storage cleanup has been confirmed.
select distinct a.storage_path, a.id as attachment_id, sp.project_id, sp.milestone_id,
  not (
    exists (select 1 from public.document_versions dv where dv.storage_path = a.storage_path)
    or exists (select 1 from public.project_output_document_versions ov where ov.storage_path = a.storage_path)
    or exists (select 1 from public.project_output_documents od where od.storage_path = a.storage_path)
    or exists (select 1 from public.project_intake_attachments ia where ia.storage_path = a.storage_path)
    or exists (select 1 from public.milestone_contribution_attachments ca where ca.storage_path = a.storage_path)
  ) as safe_to_delete_after_migration
from public.milestone_submission_attachments a
join public.milestone_submission_packages sp on sp.id = a.package_id
where a.storage_path is not null
order by sp.project_id, sp.milestone_id, a.storage_path;

-- Existing output rows that must find a canonical stage before Phase 18.
select s.name as scenario, ws.step_order, ws.name as stage, ws.default_role, count(pm.id) as milestone_count
from public.scenarios s join public.workflow_stages ws on ws.scenario_id = s.id
left join public.project_milestones pm on pm.workflow_stage_id = ws.id
where s.name in ('Pra-Tender','On Submission Tender')
group by s.name, ws.step_order, ws.name, ws.default_role
order by s.name, ws.step_order;
