-- READ ONLY. Mismatch queries must return zero rows; never executes mutations.
select p.id,p.pic_revision from public.projects p where p.pic_revision<0;
select pm.id,pm.project_id from public.project_milestones pm join public.projects p on p.id=pm.project_id
join public.workflow_stages ws on ws.id=pm.workflow_stage_id
where p.status='ACTIVE' and pm.phase_id is not distinct from p.active_phase_id
  and pm.status not in('COMPLETED','APPROVED') and ws.default_role='SA' and pm.pic_id is distinct from p.pic_id;
select a.id,a.project_id from public.project_assignments a left join public.project_phases ph on ph.id=a.phase_id and ph.project_id=a.project_id
where a.phase_id is not null and ph.id is null;
select a.id,a.project_id from public.activity_logs a where a.pic_assignment_audit is not null and
 (a.user_id is null or a.pic_assignment_audit->>'object_id' is distinct from a.project_id::text
  or a.pic_assignment_audit->>'object_type' is distinct from 'PROJECT'
  or not(a.pic_assignment_audit ?& array['before','after','phase_id','revision']));
select r.project_id,r.request_id from public.project_pic_requests r where
  not(r.result ?& array['pic_revision','current_pic_id','replayed']) or r.payload->>'expected_revision' is null;
select to_regprocedure('public.review_project_phase_plan(uuid,uuid,uuid,text,text,uuid)') as retired_public_rpc,
  to_regprocedure('public.review_project_plan_pic_atomic(uuid,uuid,uuid,text,text,uuid,bigint,uuid)') as plan_rpc;
select has_function_privilege('authenticated','public.assign_project_pic_atomic(uuid,uuid,uuid,text,bigint,uuid)','EXECUTE') as client_must_be_false,
  has_function_privilege('service_role','public.assign_project_pic_atomic(uuid,uuid,uuid,text,bigint,uuid)','EXECUTE') as server_must_be_true,
  has_function_privilege('service_role','public.review_project_phase_plan_phase24_core(uuid,uuid,uuid,text,text,uuid)','EXECUTE') as private_core_must_be_false;
