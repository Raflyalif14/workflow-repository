-- READ ONLY. No business RPC invocation or Storage access.
-- Run as a verified database administrator with complete SELECT visibility.
-- Replace NULL with the affected project/request UUIDs from existing evidence.
-- Leave request_id NULL to inventory that project's existing review receipts.
with params(project_id,request_id) as (values(null::uuid,null::uuid))
select p.id,p.status,p.is_postponed,p.phase_migration_state,p.active_phase_id,p.current_scenario_id,
  p.pic_id is not null as pic_present,p.pic_revision,
  a.id as approval_id,a.status as approval_status,a.reviewed_at,
  a.phase_id is not distinct from p.active_phase_id as approval_in_current_phase,
  (select count(*) from public.project_pic_requests r where r.project_id=p.id
    and r.operation='PLAN_REVIEW' and r.payload->>'approval_id'=a.id::text) as approval_receipt_count
from params x join public.projects p on p.id=x.project_id
left join public.project_plan_approvals a on a.project_id=p.id
order by a.submitted_at desc,a.id desc;

with params(project_id,request_id) as (values(null::uuid,null::uuid))
select r.project_id,r.request_id,r.operation,r.created_at,r.payload->>'approval_id' as approval_id,
  r.result->>'status' as saved_approval_status,r.result->>'project_status' as saved_project_status,
  r.result->>'pic_revision' as saved_pic_revision,
  r.result->>'current_pic_id' is not null as saved_pic_present
from params x join public.project_pic_requests r on r.project_id=x.project_id
where r.operation='PLAN_REVIEW' and (x.request_id is null or r.request_id=x.request_id)
order by r.created_at desc,r.request_id desc limit 20;

-- Catalog evidence only; function hashes do not prove behavioral equivalence.
with signatures(signature,private_core) as (values
  ('public.review_project_plan_pic_atomic(uuid,uuid,uuid,text,text,uuid,bigint,uuid)',false),
  ('public.review_project_phase_plan_phase24_core(uuid,uuid,uuid,text,text,uuid)',true),
  ('public.queue_pic_operation_notification(uuid,uuid,text)',true))
select s.signature,p.oid is not null as present,p.prosecdef as security_definer,
  p.proconfig,md5(p.prosrc) as body_hash,
  case when p.oid is not null then has_function_privilege('authenticated',p.oid,'EXECUTE') end as client_execute_must_be_false,
  case when p.oid is not null then has_function_privilege('service_role',p.oid,'EXECUTE') end as service_execute,
  not s.private_core as expected_service_execute
from signatures s left join pg_catalog.pg_proc p on p.oid=to_regprocedure(s.signature);

select t.tgname,t.tgenabled from pg_catalog.pg_trigger t
where t.tgrelid=to_regclass('public.projects') and t.tgname='guard_pic_revision' and not t.tgisinternal;
select c.conname,pg_catalog.pg_get_constraintdef(c.oid) as definition
from pg_catalog.pg_constraint c where c.conrelid in
  (to_regclass('public.notifications'),to_regclass('public.notification_deliveries'),to_regclass('public.project_pic_requests'))
  and c.contype in('c','u','p') order by c.conrelid,c.conname;
