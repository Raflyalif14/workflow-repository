-- Read-only checks after Phase 18. Expect zero rows for mismatch queries.
select s.name, ws.step_order, ws.stage_key, ws.default_role
from public.scenarios s join public.workflow_stages ws on ws.scenario_id = s.id
where s.name in ('Pra-Tender','On Submission Tender')
order by s.name, ws.step_order;

select od.id, od.project_id, od.document_key, od.milestone_id
from public.project_output_documents od
left join public.project_milestones pm on pm.id = od.milestone_id and pm.project_id = od.project_id
where pm.id is null;

select pm.id, pm.project_id, pm.status, count(od.id) filter (where od.is_required or od.is_selected) as selected_outputs,
  count(od.id) filter (where (od.is_required or od.is_selected) and od.status <> 'APPROVED') as unapproved_outputs
from public.project_milestones pm join public.workflow_stages ws on ws.id = pm.workflow_stage_id
left join public.project_output_documents od on od.milestone_id = pm.id
where ws.default_role = 'SA'
group by pm.id, pm.project_id, pm.status
having pm.status = 'COMPLETED' and count(od.id) filter
  (where (od.is_required or od.is_selected) and od.status <> 'APPROVED') > 0;

select to_regclass('public.milestone_submission_packages') as packages,
  to_regclass('public.milestone_submission_attachments') as attachments,
  to_regclass('public.milestone_approvals') as approvals;
