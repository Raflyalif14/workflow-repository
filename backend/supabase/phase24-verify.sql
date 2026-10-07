-- READ ONLY. Mismatch queries must return zero rows. No SQL is executed by the agent.
select phase_migration_state,count(*) from public.projects group by phase_migration_state;
select p.id,p.active_phase_id,p.current_scenario_id from public.projects p
left join public.project_phases ph on ph.id = p.active_phase_id and ph.project_id = p.id
where p.phase_migration_state = 'READY' and (ph.id is null or ph.scenario_id is distinct from p.current_scenario_id);
select od.id,od.project_id,od.document_key from public.project_output_documents od
join public.projects p on p.id = od.project_id
left join public.project_phases ph on ph.id = od.phase_id and ph.project_id = od.project_id
left join public.project_milestones pm on pm.id = od.milestone_id
left join public.workflow_stages ws on ws.id = pm.workflow_stage_id
left join public.output_document_stage_catalog c on c.document_key = od.document_key
where p.phase_migration_state = 'READY' and (ph.id is null or pm.phase_id is distinct from ph.id
  or c.group_key is distinct from ph.phase_key or ws.scenario_id is distinct from ph.scenario_id
  or ws.stage_key is distinct from c.stage_key or ws.default_role is distinct from 'SA');
select ph.id from public.project_phases ph where ph.status = 'COMPLETED'
  and exists(select 1 from public.project_output_documents od where od.phase_id = ph.id and (od.is_required or od.is_selected) and od.status <> 'APPROVED');
select a.id,a.project_id from public.project_plan_approvals a join public.projects p on p.id = a.project_id
where p.phase_migration_state = 'READY' and a.phase_id is null;
select project_id,phase_key,count(*) from public.project_phases group by project_id,phase_key having count(*) > 1;
