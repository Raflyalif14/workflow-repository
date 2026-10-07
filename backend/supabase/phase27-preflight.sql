-- READ ONLY. No names, recipient data, notification text or Storage paths.
select to_regprocedure('public.review_project_phase_plan(uuid,uuid,uuid,text,text,uuid)') as phase24_core,
  to_regprocedure('public.close_project_at_pra_tender(uuid,uuid)') as phase25_close,
  to_regprocedure('public.update_project_estimated_value(uuid,uuid,text,timestamptz,uuid)') as phase26_estimate;
select p.id,p.status,p.phase_migration_state,p.active_phase_id,p.pic_id,
  u.role,u.is_active from public.projects p left join public.users u on u.id=p.pic_id
where p.pic_id is not null and (u.id is null or u.is_active is distinct from true or u.role not in('SA','HEAD_SA'));
-- Non-historical SA milestone ownership must agree with its active project.
select p.id as project_id,pm.id as milestone_id,p.active_phase_id,pm.phase_id,p.pic_id,pm.pic_id
from public.projects p join public.project_milestones pm on pm.project_id=p.id
join public.workflow_stages ws on ws.id=pm.workflow_stage_id
where p.status='ACTIVE' and pm.phase_id is not distinct from p.active_phase_id
  and pm.status not in('COMPLETED','APPROVED') and ws.default_role='SA' and pm.pic_id is distinct from p.pic_id;
select p.id,p.active_phase_id,ph.pic_id,p.pic_id from public.projects p
left join public.project_phases ph on ph.id=p.active_phase_id and ph.project_id=p.id
where p.phase_migration_state='READY' and (ph.id is null or ph.scenario_id is distinct from p.current_scenario_id
  or ph.pic_id is distinct from p.pic_id);
-- Inspect history inconsistencies. Pre-27 history lacks phase identity; this is
-- a candidate inventory, NOT a safe automatic backfill across phase resets.
select p.id,p.pic_id,h.pic_id as latest_history_pic,h.id as history_id from public.projects p
left join lateral(select a.id,a.pic_id from public.project_assignments a where a.project_id=p.id order by a.created_at desc,a.id desc limit 1) h on true
where p.pic_id is not null and h.pic_id is distinct from p.pic_id;
select pm.id,pm.project_id,pm.phase_id,ws.id as stage_id from public.project_milestones pm
join public.projects p on p.id=pm.project_id left join public.workflow_stages ws on ws.id=pm.workflow_stage_id
left join public.project_phases ph on ph.id=pm.phase_id and ph.project_id=pm.project_id
where ws.id is null or (pm.phase_id is not null and (ph.id is null or ws.scenario_id is distinct from ph.scenario_id));
-- Legacy step-5 identity must be reviewed against Phase 2 before using fallback.
select s.id,s.workflow_model,s.workflow_version,ws.id as stage_id,ws.step_order,ws.stage_key,ws.default_role
from public.scenarios s join public.workflow_stages ws on ws.scenario_id=s.id
where s.workflow_model='LEGACY' and (ws.stage_key='ASSIGN_PIC' or ws.step_order=5);
select conname,pg_get_constraintdef(oid) from pg_constraint where conrelid in
 ('public.project_assignments'::regclass,'public.activity_logs'::regclass,'public.notification_deliveries'::regclass);
select tgname,pg_get_triggerdef(oid) from pg_trigger where tgrelid='public.projects'::regclass and not tgisinternal;
