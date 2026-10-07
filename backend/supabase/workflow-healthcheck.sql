-- Read-only operational/integration healthcheck. ONE statement / ONE result set.
-- Run manually as a verified database administrator with complete SELECT visibility.
-- No business RPC is invoked, no helper/table/temp object is created, no Storage is accessed.
-- Built-in query_to_xml evaluates only the fixed SELECT count(*) strings below,
-- after table/column/type/visibility checks. Missing objects never use ::regclass casts.
-- PASS means this particular catalog/count invariant, not live workflow correctness.
with
roles as (
  select (select oid from pg_catalog.pg_roles where rolname='anon') as anon_id,
    (select oid from pg_catalog.pg_roles where rolname='authenticated') as client_id,
    (select oid from pg_catalog.pg_roles where rolname='service_role') as server_id
),
required_columns(table_name,column_name,required_type) as (values
    ('public.activity_logs','action',''),
    ('public.activity_logs','business_audit','jsonb'),
    ('public.activity_logs','document_access_audit','jsonb'),
    ('public.activity_logs','estimated_value_audit','jsonb'),
    ('public.activity_logs','pic_assignment_audit','jsonb'),
    ('public.activity_logs','project_id',''),
    ('public.activity_logs','user_id',''),
    ('public.document_repository_access','document_id',''),
    ('public.document_repository_access','output_document_id',''),
    ('public.document_repository_access','project_id',''),
    ('public.document_repository_access_requests','access_id',''),
    ('public.document_repository_access_requests','actor_id',''),
    ('public.document_repository_access_requests','payload','jsonb'),
    ('public.document_repository_access_requests','request_id',''),
    ('public.document_repository_access_requests','result','jsonb'),
    ('public.document_repository_grants','access_id',''),
    ('public.document_repository_grants','user_id',''),
    ('public.documents','id',''),
    ('public.documents','project_id',''),
    ('public.notification_deliveries','channel',''),
    ('public.notification_deliveries','notification_id',''),
    ('public.notification_deliveries','status',''),
    ('public.notification_preferences','in_app_enabled',''),
    ('public.notification_preferences','telegram_enabled',''),
    ('public.notifications','id',''),
    ('public.notifications','in_app_visible',''),
    ('public.output_document_stage_catalog','document_key',''),
    ('public.output_document_stage_catalog','group_key',''),
    ('public.output_document_stage_catalog','is_required',''),
    ('public.output_document_stage_catalog','stage_key',''),
    ('public.output_notification_outbox','attempt_count',''),
    ('public.output_notification_outbox','delivered_at',''),
    ('public.project_assignments','phase_id',''),
    ('public.project_assignments','project_id',''),
    ('public.project_business_requests','project_id',''),
    ('public.project_business_requests','request_id',''),
    ('public.project_creation_files','id',''),
    ('public.project_creation_files','request_id',''),
    ('public.project_creation_files','state',''),
    ('public.project_creation_files','storage_path',''),
    ('public.project_creation_requests','lease_until',''),
    ('public.project_creation_requests','project_id',''),
    ('public.project_creation_requests','request_id',''),
    ('public.project_creation_requests','status',''),
    ('public.project_creation_requests','updated_at',''),
    ('public.project_deletion_cleanups','status',''),
    ('public.project_intake_attachments','id',''),
    ('public.project_intake_attachments','project_id',''),
    ('public.project_intake_attachments','storage_path',''),
    ('public.project_milestones','id',''),
    ('public.project_milestones','phase_id',''),
    ('public.project_milestones','pic_id',''),
    ('public.project_milestones','project_id',''),
    ('public.project_milestones','status',''),
    ('public.project_milestones','workflow_stage_id',''),
    ('public.project_output_document_draft_files','file_id',''),
    ('public.project_output_document_draft_files','output_document_id',''),
    ('public.project_output_document_draft_files','position',''),
    ('public.project_output_document_draft_files','project_id',''),
    ('public.project_output_document_draft_requests','output_document_id',''),
    ('public.project_output_document_draft_requests','result_file_id',''),
    ('public.project_output_document_files','file_size',''),
    ('public.project_output_document_files','id',''),
    ('public.project_output_document_files','output_document_id',''),
    ('public.project_output_document_files','project_id',''),
    ('public.project_output_document_version_files','file_id',''),
    ('public.project_output_document_version_files','output_document_id',''),
    ('public.project_output_document_version_files','position',''),
    ('public.project_output_document_version_files','project_id',''),
    ('public.project_output_document_version_files','version_id',''),
    ('public.project_output_document_versions','id',''),
    ('public.project_output_document_versions','output_document_id',''),
    ('public.project_output_document_versions','project_id',''),
    ('public.project_output_document_versions','reviewed_at',''),
    ('public.project_output_document_versions','reviewed_by',''),
    ('public.project_output_document_versions','snapshot_kind',''),
    ('public.project_output_document_versions','status',''),
    ('public.project_output_documents','current_version_id',''),
    ('public.project_output_documents','document_key',''),
    ('public.project_output_documents','id',''),
    ('public.project_output_documents','is_required',''),
    ('public.project_output_documents','is_selected',''),
    ('public.project_output_documents','milestone_id',''),
    ('public.project_output_documents','phase_id',''),
    ('public.project_output_documents','project_id',''),
    ('public.project_output_documents','status',''),
    ('public.project_output_file_revisions','feedback',''),
    ('public.project_output_file_revisions','file_id',''),
    ('public.project_output_file_revisions','version_id',''),
    ('public.project_output_review_requests','actor_id',''),
    ('public.project_output_review_requests','new_status',''),
    ('public.project_output_review_requests','output_document_id',''),
    ('public.project_output_review_requests','request_id',''),
    ('public.project_output_review_requests','version_id',''),
    ('public.project_phases','id',''),
    ('public.project_phases','phase_key',''),
    ('public.project_phases','project_id',''),
    ('public.project_phases','sales_decided_at',''),
    ('public.project_phases','sales_decision',''),
    ('public.project_phases','scenario_id',''),
    ('public.project_phases','status',''),
    ('public.project_pic_requests','payload','jsonb'),
    ('public.project_pic_requests','project_id',''),
    ('public.project_pic_requests','request_id',''),
    ('public.project_pic_requests','result','jsonb'),
    ('public.project_plan_approvals','phase_id',''),
    ('public.project_plan_approvals','project_id',''),
    ('public.project_document_sharing','project_id',''),
    ('public.project_document_sharing','access_mode',''),
    ('public.project_document_sharing','revision',''),
    ('public.project_document_sharing_requests','project_id',''),
    ('public.project_document_sharing_requests','request_id',''),
    ('public.project_document_sharing_requests','payload','jsonb'),
    ('public.project_document_sharing_requests','result','jsonb'),
    ('public.projects','active_phase_id',''),
    ('public.projects','current_scenario_id',''),
    ('public.projects','id',''),
    ('public.projects','phase_migration_state',''),
    ('public.projects','pic_id',''),
    ('public.projects','status',''),
    ('public.users','id',''),
    ('public.workflow_stages','default_role',''),
    ('public.workflow_stages','id',''),
    ('public.workflow_stages','scenario_id',''),
    ('public.workflow_stages','stage_key','')
),
columns_found as (
  select r.*,c.oid as table_oid,a.attname,
    (r.required_type='' or a.atttypid=pg_catalog.to_regtype(r.required_type)) as type_matches,
    case when c.oid is null then false else c.relkind in ('r','p') and pg_catalog.has_table_privilege(current_user,c.oid,'SELECT')
      and (not c.relrowsecurity or exists(select 1 from pg_catalog.pg_roles me where me.rolname=current_user
        and (me.rolsuper or me.rolbypassrls or (me.oid=c.relowner and not c.relforcerowsecurity)))) end as complete_visibility
  from required_columns r left join pg_catalog.pg_class c on c.oid=pg_catalog.to_regclass(r.table_name)
  left join pg_catalog.pg_attribute a on a.attrelid=c.oid and a.attname=r.column_name and not a.attisdropped and a.attnum>0
),
specs(check_name,dependencies,read_query,kind,expected) as (values
    ('catalog.phase_output_counts','{"output_document_stage_catalog":["group_key","is_required"]}'::jsonb,$read$select count(*) as n from (values ('PRA_TENDER',10,1),('ON_SUBMISSION_TENDER',7,4)) expected(g,total,required) where (select count(*) from public.output_document_stage_catalog c where c.group_key=expected.g)<>expected.total or (select count(*) from public.output_document_stage_catalog c where c.group_key=expected.g and c.is_required)<>expected.required$read$,'mismatch','0 groups outside canonical 10/7 outputs and 1/4 required'),
    ('snapshots.approved_file_count','{"project_output_documents":["status","current_version_id"],"project_output_document_version_files":["version_id"]}'::jsonb,$read$select count(*) as n from public.project_output_documents o where o.status='APPROVED' and (select count(*) from public.project_output_document_version_files r where r.version_id=o.current_version_id) not between 1 and 10$read$,'mismatch','0 approved outputs without a valid snapshot reference count'),
    ('relations.ready_active_phase','{"projects":["id","phase_migration_state","active_phase_id","current_scenario_id"],"project_phases":["id","project_id","scenario_id"]}'::jsonb,$read$select count(*) as n from public.projects p left join public.project_phases ph on ph.id=p.active_phase_id and ph.project_id=p.id where p.phase_migration_state='READY' and (ph.id is null or ph.scenario_id is distinct from p.current_scenario_id)$read$,'mismatch','0 mismatches'),
    ('relations.ready_milestone_phase','{"projects":["id","phase_migration_state"],"project_milestones":["project_id","phase_id","workflow_stage_id"],"project_phases":["id","project_id","scenario_id"],"workflow_stages":["id","scenario_id"]}'::jsonb,$read$select count(*) as n from public.project_milestones m join public.projects p on p.id=m.project_id left join public.project_phases ph on ph.id=m.phase_id and ph.project_id=m.project_id left join public.workflow_stages ws on ws.id=m.workflow_stage_id where p.phase_migration_state='READY' and (ph.id is null or ws.id is null or ws.scenario_id is distinct from ph.scenario_id)$read$,'mismatch','0 mismatches'),
    ('relations.ready_output_mapping','{"projects":["id","phase_migration_state"],"project_output_documents":["id","project_id","phase_id","milestone_id","document_key"],"project_phases":["id","project_id","scenario_id","phase_key"],"project_milestones":["id","project_id","phase_id","workflow_stage_id"],"workflow_stages":["id","scenario_id","stage_key","default_role"],"output_document_stage_catalog":["document_key","group_key","stage_key"]}'::jsonb,$read$select count(*) as n from public.project_output_documents o join public.projects p on p.id=o.project_id left join public.project_phases ph on ph.id=o.phase_id and ph.project_id=o.project_id left join public.project_milestones m on m.id=o.milestone_id left join public.workflow_stages ws on ws.id=m.workflow_stage_id left join public.output_document_stage_catalog c on c.document_key=o.document_key where p.phase_migration_state='READY' and (ph.id is null or m.id is null or m.project_id is distinct from o.project_id or m.phase_id is distinct from ph.id or c.group_key is distinct from ph.phase_key or ws.scenario_id is distinct from ph.scenario_id or ws.stage_key is distinct from c.stage_key or ws.default_role is distinct from 'SA')$read$,'mismatch','0 mismatches'),
    ('relations.completed_phase_outputs','{"project_phases":["id","status"],"project_output_documents":["phase_id","is_required","is_selected","status"]}'::jsonb,$read$select count(*) as n from public.project_phases ph where ph.status='COMPLETED' and exists(select 1 from public.project_output_documents o where o.phase_id=ph.id and (o.is_required or o.is_selected) and o.status is distinct from 'APPROVED')$read$,'mismatch','0 mismatches'),
    ('relations.ready_plan_phase','{"projects":["id","phase_migration_state"],"project_plan_approvals":["project_id","phase_id"],"project_phases":["id","project_id"]}'::jsonb,$read$select count(*) as n from public.project_plan_approvals a join public.projects p on p.id=a.project_id left join public.project_phases ph on ph.id=a.phase_id and ph.project_id=a.project_id where p.phase_migration_state='READY' and ph.id is null$read$,'mismatch','0 mismatches'),
    ('relations.active_pic','{"projects":["id","status","active_phase_id","pic_id"],"project_milestones":["project_id","phase_id","status","workflow_stage_id","pic_id"],"workflow_stages":["id","default_role"]}'::jsonb,$read$select count(*) as n from public.project_milestones m join public.projects p on p.id=m.project_id join public.workflow_stages ws on ws.id=m.workflow_stage_id where p.status='ACTIVE' and m.phase_id is not distinct from p.active_phase_id and m.status not in ('COMPLETED','APPROVED') and ws.default_role='SA' and m.pic_id is distinct from p.pic_id$read$,'mismatch','0 mismatches'),
    ('decisions.closed_pra_tender','{"projects":["id","status","active_phase_id"],"project_phases":["id","project_id","phase_key","sales_decision"]}'::jsonb,$read$select count(*) as n from public.projects p join public.project_phases ph on ph.project_id=p.id where ph.sales_decision='CLOSE_PRA_TENDER' and (p.status is distinct from 'COMPLETED' or p.active_phase_id is distinct from ph.id or exists(select 1 from public.project_phases t where t.project_id=p.id and t.phase_key='ON_SUBMISSION_TENDER'))$read$,'mismatch','0 mismatches'),
    ('decisions.continued_tender','{"project_phases":["project_id","phase_key","sales_decision"]}'::jsonb,$read$select count(*) as n from public.project_phases ph where ph.sales_decision='CONTINUE_TENDER' and not exists(select 1 from public.project_phases t where t.project_id=ph.project_id and t.phase_key='ON_SUBMISSION_TENDER')$read$,'mismatch','0 mismatches'),
    ('decisions.recorded_shape','{"project_phases":["phase_key","status","sales_decision","sales_decided_at"]}'::jsonb,$read$select count(*) as n from public.project_phases ph where ph.sales_decision is not null and (ph.phase_key is distinct from 'PRA_TENDER' or ph.status is distinct from 'COMPLETED' or ph.sales_decided_at is null)$read$,'mismatch','0 mismatches'),
    ('legacy.classification_inventory','{"projects":["phase_migration_state"]}'::jsonb,$read$select count(*) as n from public.projects where phase_migration_state='LEGACY_REVIEW'$read$,'review','Legacy retained; manual classification, not a data mismatch'),
    ('snapshots.current_identity','{"project_output_documents":["id","project_id","current_version_id","status"],"project_output_document_versions":["id","project_id","output_document_id","status","snapshot_kind"]}'::jsonb,$read$select count(*) as n from public.project_output_documents o left join public.project_output_document_versions v on v.id=o.current_version_id where (o.current_version_id is not null and (v.id is null or v.output_document_id is distinct from o.id or v.project_id is distinct from o.project_id)) or (o.status in ('SUBMITTED','IN_REVIEW','APPROVED','REVISION_REQUIRED') and (v.id is null or v.status is distinct from case when o.status='SUBMITTED' then 'IN_REVIEW' else o.status end or v.snapshot_kind not in ('SUBMITTED','LEGACY_SUBMITTED')))$read$,'mismatch','0 mismatches'),
    ('snapshots.file_references','{"project_output_document_version_files":["version_id","file_id","output_document_id","project_id"],"project_output_document_versions":["id","output_document_id","project_id"],"project_output_document_files":["id","output_document_id","project_id"]}'::jsonb,$read$select count(*) as n from public.project_output_document_version_files r left join public.project_output_document_versions v on v.id=r.version_id left join public.project_output_document_files f on f.id=r.file_id where v.id is null or f.id is null or v.output_document_id is distinct from r.output_document_id or v.project_id is distinct from r.project_id or f.output_document_id is distinct from r.output_document_id or f.project_id is distinct from r.project_id$read$,'mismatch','0 mismatches'),
    ('snapshots.submitted_file_limits','{"project_output_document_versions":["id","snapshot_kind"],"project_output_document_version_files":["version_id","file_id"],"project_output_document_files":["id","file_size"]}'::jsonb,$read$select count(*) as n from public.project_output_document_versions v where v.snapshot_kind='SUBMITTED' and ((select count(*) from public.project_output_document_version_files r where r.version_id=v.id) not between 1 and 10 or (select coalesce(sum(f.file_size),0) from public.project_output_document_version_files r join public.project_output_document_files f on f.id=r.file_id where r.version_id=v.id)>209715200)$read$,'mismatch','0 mismatches'),
    ('drafts.file_references','{"project_output_document_draft_files":["file_id","output_document_id","project_id"],"project_output_document_files":["id","output_document_id","project_id"]}'::jsonb,$read$select count(*) as n from public.project_output_document_draft_files r left join public.project_output_document_files f on f.id=r.file_id where f.id is null or f.output_document_id is distinct from r.output_document_id or f.project_id is distinct from r.project_id$read$,'mismatch','0 mismatches'),
    ('review.file_marker_membership','{"project_output_file_revisions":["version_id","file_id","feedback"],"project_output_document_version_files":["version_id","file_id"],"project_output_document_versions":["id","status","reviewed_by","reviewed_at"]}'::jsonb,$read$select count(*) as n from public.project_output_file_revisions r left join public.project_output_document_version_files f on f.version_id=r.version_id and f.file_id=r.file_id left join public.project_output_document_versions v on v.id=r.version_id where f.file_id is null or v.status is distinct from 'REVISION_REQUIRED' or v.reviewed_by is null or v.reviewed_at is null or length(btrim(r.feedback)) not between 1 and 2000 or r.feedback !~ '[^[:space:]]'$read$,'mismatch','0 mismatches'),
    ('receipts.review_identity','{"project_output_review_requests":["output_document_id","version_id","actor_id","new_status"],"project_output_document_versions":["id","output_document_id","status","reviewed_by"]}'::jsonb,$read$select count(*) as n from public.project_output_review_requests r left join public.project_output_document_versions v on v.id=r.version_id where v.id is null or v.output_document_id is distinct from r.output_document_id or v.status is distinct from r.new_status or v.reviewed_by is distinct from r.actor_id$read$,'mismatch','0 mismatches'),
    ('receipts.pic_shape','{"project_pic_requests":["payload","result"]}'::jsonb,$read$select count(*) as n from public.project_pic_requests where not(result ?& array['pic_revision','current_pic_id','replayed']) or payload->>'expected_revision' is null$read$,'mismatch','0 mismatches'),
    ('receipts.draft_file_identity','{"project_output_document_draft_requests":["output_document_id","result_file_id"],"project_output_document_files":["id","output_document_id"]}'::jsonb,$read$select count(*) as n from public.project_output_document_draft_requests r left join public.project_output_document_files f on f.id=r.result_file_id where r.result_file_id is not null and (f.id is null or f.output_document_id is distinct from r.output_document_id)$read$,'mismatch','0 mismatches'),
    ('access.source_identity','{"document_repository_access":["document_id","output_document_id","project_id"],"documents":["id","project_id"],"project_output_documents":["id","project_id"]}'::jsonb,$read$select count(*) as n from public.document_repository_access a left join public.documents d on d.id=a.document_id left join public.project_output_documents o on o.id=a.output_document_id where a.project_id is distinct from coalesce(d.project_id,o.project_id)$read$,'mismatch','0 mismatches'),
    ('access.receipt_shape','{"document_repository_access_requests":["payload","result","actor_id"],"users":["id"]}'::jsonb,$read$select count(*) as n from public.document_repository_access_requests r left join public.users u on u.id=r.actor_id where u.id is null or jsonb_typeof(r.payload) is distinct from 'object' or not(r.result ?& array['revision','changed','replayed'])$read$,'mismatch','0 mismatches'),
    ('audit.business_shape','{"activity_logs":["business_audit","user_id"]}'::jsonb,$read$select count(*) as n from public.activity_logs where business_audit is not null and (user_id is null or jsonb_typeof(business_audit) is distinct from 'object' or not(business_audit ?& array['object_type','object_id','changed_fields','before','after','request_id']) or business_audit->'before'=business_audit->'after')$read$,'mismatch','0 mismatches'),
    ('audit.estimate_shape','{"activity_logs":["action","user_id","project_id","estimated_value_audit"]}'::jsonb,$read$select count(*) as n from public.activity_logs where action='PROJECT_ESTIMATED_VALUE_CHANGED' and (user_id is null or estimated_value_audit is null or estimated_value_audit->>'object_type' is distinct from 'PROJECT' or estimated_value_audit->>'object_id' is distinct from project_id::text or not(estimated_value_audit ?& array['before','after','request_id','expected_updated_at','saved_updated_at']) or estimated_value_audit->>'before' is not distinct from estimated_value_audit->>'after')$read$,'mismatch','0 mismatches'),
    ('audit.pic_shape','{"activity_logs":["pic_assignment_audit","user_id","project_id"]}'::jsonb,$read$select count(*) as n from public.activity_logs where pic_assignment_audit is not null and (user_id is null or pic_assignment_audit->>'object_id' is distinct from project_id::text or pic_assignment_audit->>'object_type' is distinct from 'PROJECT' or not(pic_assignment_audit ?& array['before','after','phase_id','revision']))$read$,'mismatch','0 mismatches'),
    ('audit.access_shape','{"activity_logs":["action","user_id","document_access_audit"]}'::jsonb,$read$select count(*) as n from public.activity_logs where action='DOCUMENT_ACCESS_CHANGED' and (user_id is null or document_access_audit is null or not(document_access_audit ?& array['source_type','object_id','before','after','revision','request_id']))$read$,'mismatch','0 mismatches'),
    ('audit.business_sensitive_keys','{"activity_logs":["business_audit"]}'::jsonb,$read$select count(*) as n from public.activity_logs where business_audit is not null and exists(select 1 from jsonb_object_keys(case when jsonb_typeof(business_audit->'before')='object' then business_audit->'before' else '{}'::jsonb end || case when jsonb_typeof(business_audit->'after')='object' then business_audit->'after' else '{}'::jsonb end) k where k in ('storage_path','storage_paths','token','password','signed_url','raw_body','email'))$read$,'mismatch','0 mismatches'),
    ('create.committed_manifest','{"project_creation_requests":["request_id","status"],"project_creation_files":["request_id","state"]}'::jsonb,$read$select count(*) as n from public.project_creation_requests r where r.status='COMMITTED' and (not exists(select 1 from public.project_creation_files f where f.request_id=r.request_id) or exists(select 1 from public.project_creation_files f where f.request_id=r.request_id and f.state<>'STORED'))$read$,'mismatch','0 mismatches'),
    ('create.partial_metadata','{"project_creation_requests":["project_id","status"],"projects":["id"]}'::jsonb,$read$select count(*) as n from public.project_creation_requests r join public.projects p on p.id=r.project_id where r.status<>'COMMITTED'$read$,'mismatch','0 mismatches'),
    ('create.live_receipt_audit','{"project_creation_requests":["project_id","status"],"projects":["id"],"activity_logs":["project_id","action"],"project_milestones":["project_id"]}'::jsonb,$read$select count(*) as n from public.project_creation_requests r join public.projects p on p.id=r.project_id where r.status='COMMITTED' and ((select count(*) from public.activity_logs a where a.project_id=p.id and a.action='PROJECT_CREATED')<>1 or not exists(select 1 from public.project_milestones m where m.project_id=p.id))$read$,'mismatch','0 mismatches'),
    ('create.intake_manifest','{"project_creation_files":["id","request_id","storage_path"],"project_creation_requests":["request_id","project_id","status"],"projects":["id"],"project_intake_attachments":["id","project_id","storage_path"]}'::jsonb,$read$select count(*) as n from public.project_creation_files f join public.project_creation_requests r on r.request_id=f.request_id join public.projects p on p.id=r.project_id left join public.project_intake_attachments a on a.id=f.id where r.status='COMMITTED' and (a.id is null or a.project_id is distinct from p.id or a.storage_path is distinct from f.storage_path)$read$,'mismatch','0 mismatches'),
    ('create.deletion_tombstones','{"project_creation_requests":["project_id","status"],"projects":["id"]}'::jsonb,$read$select count(*) as n from public.project_creation_requests r left join public.projects p on p.id=r.project_id where r.status='COMMITTED' and p.id is null$read$,'inventory','Retained deleted-project tombstones are valid; never recreate'),
    ('create.expired_or_released_jobs','{"project_creation_requests":["status","lease_until","updated_at"]}'::jsonb,$read$select count(*) as n from public.project_creation_requests where status='PROCESSING' and updated_at<now()-interval '10 minutes' and (lease_until is null or lease_until<=now())$read$,'review','Review expired/released jobs after the model ten-minute lease; do not re-upload uncertain files'),
    ('create.active_jobs','{"project_creation_requests":["status","lease_until"]}'::jsonb,$read$select count(*) as n from public.project_creation_requests where status='PROCESSING' and lease_until>now()$read$,'runtime','Valid active leases are not mismatches; concurrency requires runtime proof'),
    ('ops.outbox_pending_failed','{"output_notification_outbox":["delivered_at","attempt_count"]}'::jsonb,$read$select count(*) as n from public.output_notification_outbox where delivered_at is null and attempt_count>0$read$,'review','Pending previously-failed only; exclude delivered historical errors'),
    ('ops.outbox_pending','{"output_notification_outbox":["delivered_at"]}'::jsonb,$read$select count(*) as n from public.output_notification_outbox where delivered_at is null$read$,'runtime','Pending is delivered_at IS NULL; empty queue does not prove worker operation'),
    ('ops.cleanup_failed','{"project_deletion_cleanups":["status"]}'::jsonb,$read$select count(*) as n from public.project_deletion_cleanups where status='FAILED'$read$,'review','Review safe monitoring details; retry only existing eligible FAILED policy'),
    ('ops.cleanup_pending','{"project_deletion_cleanups":["status"]}'::jsonb,$read$select count(*) as n from public.project_deletion_cleanups where status='PENDING'$read$,'review','Pending may be active or upload uncertainty; no cleanup expiry is defined, never force retry'),
    ('duplicates.phases','{"project_phases":["project_id","phase_key"]}'::jsonb,$read$select count(*) as n from (select 1 from public.project_phases group by project_id,phase_key having count(*)>1) duplicated$read$,'mismatch','0 mismatches'),
    ('duplicates.pic_requests','{"project_pic_requests":["project_id","request_id"]}'::jsonb,$read$select count(*) as n from (select 1 from public.project_pic_requests group by project_id,request_id having count(*)>1) duplicated$read$,'mismatch','0 mismatches'),
    ('duplicates.review_requests','{"project_output_review_requests":["output_document_id","request_id"]}'::jsonb,$read$select count(*) as n from (select 1 from public.project_output_review_requests group by output_document_id,request_id having count(*)>1) duplicated$read$,'mismatch','0 mismatches'),
    ('duplicates.access_grants','{"document_repository_grants":["access_id","user_id"]}'::jsonb,$read$select count(*) as n from (select 1 from public.document_repository_grants group by access_id,user_id having count(*)>1) duplicated$read$,'mismatch','0 mismatches'),
    ('duplicates.access_requests','{"document_repository_access_requests":["access_id","request_id"]}'::jsonb,$read$select count(*) as n from (select 1 from public.document_repository_access_requests group by access_id,request_id having count(*)>1) duplicated$read$,'mismatch','0 mismatches'),
    ('duplicates.business_requests','{"project_business_requests":["project_id","request_id"]}'::jsonb,$read$select count(*) as n from (select 1 from public.project_business_requests group by project_id,request_id having count(*)>1) duplicated$read$,'mismatch','0 mismatches'),
    ('duplicates.creation_requests','{"project_creation_requests":["request_id"]}'::jsonb,$read$select count(*) as n from (select 1 from public.project_creation_requests group by request_id having count(*)>1) duplicated$read$,'mismatch','0 mismatches'),
    ('duplicates.snapshot_positions','{"project_output_document_version_files":["version_id","position"]}'::jsonb,$read$select count(*) as n from (select 1 from public.project_output_document_version_files group by version_id,position having count(*)>1) duplicated$read$,'mismatch','0 mismatches'),
    ('duplicates.draft_positions','{"project_output_document_draft_files":["output_document_id","position"]}'::jsonb,$read$select count(*) as n from (select 1 from public.project_output_document_draft_files group by output_document_id,position having count(*)>1) duplicated$read$,'mismatch','0 mismatches')
),
ready as (
  select s.*,
    not exists(select 1 from jsonb_each(s.dependencies) d cross join lateral jsonb_array_elements_text(d.value) col
      left join columns_found f on f.table_name='public.'||d.key and f.column_name=col
      where f.attname is null) as schema_present,
    not exists(select 1 from jsonb_each(s.dependencies) d cross join lateral jsonb_array_elements_text(d.value) col
      left join columns_found f on f.table_name='public.'||d.key and f.column_name=col
      where f.type_matches is not true or f.complete_visibility is not true) as safe_to_read
  from specs s
),
measured as materialized (
  select r.*,case when schema_present and safe_to_read then
    ((pg_catalog.xpath('/table/row/n/text()',pg_catalog.query_to_xml(read_query,false,false,'')))[1]::text)::bigint
    else null end as n from ready r
),
function_specs(signature,public_rpc) as (values
    ('public.continue_project_tender_phase(uuid,uuid,text[])',true),
    ('public.close_project_at_pra_tender(uuid,uuid)',true),
    ('public.update_project_estimated_value(uuid,uuid,text,timestamptz,uuid)',true),
    ('public.assign_project_pic_atomic(uuid,uuid,uuid,text,bigint,uuid)',true),
    ('public.review_project_plan_pic_atomic(uuid,uuid,uuid,text,text,uuid,bigint,uuid)',true),
    ('public.review_project_output_document_snapshot(uuid,uuid,uuid,text,uuid,text,jsonb)',true),
    ('public.list_document_repository_access(uuid,text)',true),
    ('public.set_document_repository_access(uuid,text,uuid,text,uuid[],bigint,uuid)',false),
    ('public.get_project_document_sharing(uuid,uuid)',true),
    ('public.set_project_document_sharing(uuid,uuid,text,bigint,uuid)',true),
    ('public.mutate_project_business(uuid,uuid,text,jsonb,timestamptz,uuid)',true),
    ('public.mutate_project_output_document_draft(uuid,bigint,uuid,text,uuid,uuid,uuid,text,text,bigint,text,timestamptz,text)',true),
    ('public.submit_project_output_document_draft(uuid,bigint,uuid,uuid,text)',true),
    ('public.record_output_upload_outcome(uuid,uuid,uuid,text,boolean)',true),
    ('public.delete_project_with_cleanup(uuid,text,uuid)',true),
    ('public.complete_business_milestone(uuid,uuid)',true),
    ('public.project_creation_operation(uuid,uuid,text,text,jsonb,jsonb,uuid,integer)',true),
    ('public.deliver_pending_output_notifications(integer)',true),
    ('public.review_project_phase_plan_phase24_core(uuid,uuid,uuid,text,text,uuid)',false),
    ('public.submit_output_draft_phase22_core(uuid,bigint,uuid,uuid,text)',false),
    ('public.mutate_output_draft_phase30_core(uuid,bigint,uuid,text,uuid,uuid,uuid,text,text,bigint,text,timestamptz,text)',false),
    ('public.submit_output_draft_phase30_core(uuid,bigint,uuid,uuid,text)',false),
    ('public.sync_phase_output_scope_phase30_core(uuid,uuid,text[])',false),
    ('public.sync_draft_output_scope_phase30_core(uuid,uuid,text[])',false),
    ('public.complete_phase_final_sales_milestone_with_outcome_phase30_core(uuid,uuid,text,numeric,text,text[])',false),
    ('public.complete_final_sales_milestone_with_outcome_phase30_core(uuid,uuid,text,numeric,text,text[])',false),
    ('public.complete_phase_sa_milestone_phase30_core(uuid,uuid,boolean)',false),
    ('public.complete_sa_output_milestone_phase30_core(uuid,uuid,boolean)',false),
    ('public.delete_project_with_cleanup_phase30_core(uuid,text,uuid)',false)
),
function_found as (
  select f.*,p.oid,p.prosecdef,p.proconfig from function_specs f
  left join pg_catalog.pg_proc p on p.oid=pg_catalog.to_regprocedure(f.signature)
),
unique_specs(table_name,key_columns) as (values
  ('public.project_document_sharing',array['project_id']),
  ('public.project_document_sharing_requests',array['project_id','request_id']),
  ('public.project_phases',array['project_id','phase_key']),
  ('public.project_creation_requests',array['request_id']),
  ('public.project_creation_requests',array['project_id']),
  ('public.project_creation_files',array['request_id','ordinal']),
  ('public.project_pic_requests',array['project_id','request_id']),
  ('public.project_output_review_requests',array['output_document_id','request_id']),
  ('public.project_output_review_requests',array['version_id']),
  ('public.project_business_requests',array['project_id','request_id']),
  ('public.document_repository_grants',array['access_id','user_id']),
  ('public.document_repository_access_requests',array['access_id','request_id']),
  ('public.project_output_document_version_files',array['version_id','file_id']),
  ('public.project_output_document_version_files',array['version_id','position'])
),
trigger_specs(table_name,trigger_name) as (values
    ('public.projects','initialize_project_phase'),
    ('public.projects','guard_pic_revision'),
    ('public.projects','project_creation_business_audit'),
    ('public.project_milestones','attach_milestone_phase'),
    ('public.project_output_documents','attach_output_phase'),
    ('public.project_plan_approvals','attach_plan_phase'),
    ('public.project_output_document_files','output_files_immutable'),
    ('public.project_output_document_version_files','output_snapshot_refs_immutable'),
    ('public.project_output_document_versions','output_snapshot_metadata_immutable'),
    ('public.document_repository_access','document_repository_identity')
),
private_tables(table_name,no_server_direct_write) as (values
    ('public.project_document_sharing',true),
    ('public.project_document_sharing_requests',true),
    ('public.document_repository_access',true),
    ('public.document_repository_grants',true),
    ('public.document_repository_access_requests',true),
    ('public.project_business_requests',true),
    ('public.project_creation_requests',true),
    ('public.project_creation_files',true),
    ('public.project_output_file_revisions',true),
    ('public.project_output_review_requests',true),
    ('public.project_pic_requests',false),
    ('public.project_output_document_draft_requests',false),
    ('public.project_output_document_files',false),
    ('public.project_output_document_draft_files',false),
    ('public.project_output_document_version_files',false)
),
results(check_name,status,observed,expected) as (
  select 'schema.'||table_name,
    case when bool_and(attname is not null) then case when bool_and(type_matches) then 'PASS' else 'NEEDS_REVIEW' end else 'MISSING' end,
    'required columns present='||count(attname)::text||'/'||count(*)::text,
    'required model columns/types exist; presence is not migration history' from columns_found group by table_name
  union all
  select m.check_name,case when not schema_present then 'MISSING' when not safe_to_read then 'NEEDS_REVIEW'
    when n is null then 'NEEDS_RUNTIME_CHECK' when kind='runtime' then 'NEEDS_RUNTIME_CHECK'
    when kind='inventory' then 'PASS' when n=0 then 'PASS' when kind='review' then 'NEEDS_REVIEW' else 'FAIL' end,
    case when not schema_present then 'required table/column missing' when not safe_to_read then 'type drift or incomplete SELECT/RLS visibility'
      else 'count='||coalesce(n::text,'unavailable') end, m.expected from measured m
  union all
  select 'rpc.'||f.signature,case when f.oid is null or r.anon_id is null or r.client_id is null or r.server_id is null then 'MISSING'
    when pg_catalog.has_function_privilege(r.anon_id,f.oid,'EXECUTE') or pg_catalog.has_function_privilege(r.client_id,f.oid,'EXECUTE')
      or pg_catalog.has_function_privilege(r.server_id,f.oid,'EXECUTE') is distinct from f.public_rpc then 'FAIL'
    when f.public_rpc and (not f.prosecdef or not('search_path=pg_catalog'=any(coalesce(f.proconfig,array[]::text[])))) then 'FAIL' else 'PASS' end,
    case when f.oid is null then 'signature absent' else 'definition detected; execute/security catalog checked' end,
    case when public_rpc then 'service EXECUTE only; SECURITY DEFINER pinned pg_catalog' else 'private core: no client/service EXECUTE; SQL wrapper may still invoke internally' end
    from function_found f cross join roles r
  union all
  select 'unique.'||s.table_name||'.'||array_to_string(s.key_columns,','),
    case when pg_catalog.to_regclass(s.table_name) is null then 'MISSING'
      when exists(select 1 from pg_catalog.pg_index i where i.indrelid=pg_catalog.to_regclass(s.table_name)
        and i.indisunique and i.indisvalid and i.indpred is null
        and array(select a.attname::text from unnest(i.indkey) with ordinality keys(attnum,position)
          join pg_catalog.pg_attribute a on a.attrelid=i.indrelid and a.attnum=keys.attnum
          where keys.position<=i.indnkeyatts order by keys.position)=s.key_columns) then 'PASS' else 'MISSING' end,
    'unique index inventory; zero duplicate rows alone is insufficient','valid unconditional unique keys enforce identity'
    from unique_specs s
  union all
  select 'trigger.'||s.table_name||'.'||s.trigger_name,case when t.oid is null then 'MISSING' when t.tgenabled not in ('O','A') then 'FAIL' else 'PASS' end,
    coalesce('enabled='||t.tgenabled::text,'absent'),'trigger exists/enabled; body correctness requires runtime checks'
    from trigger_specs s left join pg_catalog.pg_trigger t on t.tgrelid=pg_catalog.to_regclass(s.table_name) and t.tgname=s.trigger_name and not t.tgisinternal
  union all
  select 'access.'||s.table_name,case when c.oid is null or r.anon_id is null or r.client_id is null or r.server_id is null then 'MISSING'
    when not c.relrowsecurity or pg_catalog.has_table_privilege(r.anon_id,c.oid,'SELECT,INSERT,UPDATE,DELETE')
      or pg_catalog.has_table_privilege(r.client_id,c.oid,'SELECT,INSERT,UPDATE,DELETE')
      or (s.no_server_direct_write and pg_catalog.has_table_privilege(r.server_id,c.oid,'INSERT,UPDATE,DELETE')) then 'FAIL' else 'PASS' end,
    case when c.oid is null then 'absent' else 'RLS='||c.relrowsecurity::text||'; private table grant contract checked' end,
    case when no_server_direct_write then 'RLS; no client access; no direct service writes' else 'RLS; no client access; existing service grant/policy is legitimate, not automatically a leak' end
    from private_tables s cross join roles r left join pg_catalog.pg_class c on c.oid=pg_catalog.to_regclass(s.table_name)
  union all
  select 'access.private_activity_policy',case when c.oid is null or r.anon_id is null or r.client_id is null then 'MISSING'
    when not c.relrowsecurity and (pg_catalog.has_table_privilege(r.anon_id,c.oid,'SELECT,INSERT,UPDATE,DELETE')
      or pg_catalog.has_table_privilege(r.client_id,c.oid,'SELECT,INSERT,UPDATE,DELETE')) then 'FAIL'
    when (select count(*) from pg_catalog.pg_policy p where p.polrelid=c.oid and not p.polpermissive
      and p.polname in ('document_access_private_audit','document_access_server_audit_insert','document_access_server_audit_update','document_access_server_audit_delete'))<>4 then 'MISSING'
    else 'NEEDS_RUNTIME_CHECK' end,
    'restricted policy inventory only; grants alone do not prove access',
    'verify predicate/role behavior as authenticated fixtures; private audit must stay hidden'
    from roles r left join pg_catalog.pg_class c on c.oid=pg_catalog.to_regclass('public.activity_logs')
  union all
  select 'create.tombstone_foreign_key',case when pg_catalog.to_regclass('public.project_creation_requests') is null then 'MISSING'
    when exists(select 1 from pg_catalog.pg_constraint k where k.conrelid=pg_catalog.to_regclass('public.project_creation_requests')
      and k.contype='f' and k.confrelid=pg_catalog.to_regclass('public.projects')) then 'FAIL' else 'PASS' end,
    'project FK inventory only','receipt has no project FK: deletion must preserve the committed tombstone'
  union all
  select 'prerequisite.retired_submission_tables',case when pg_catalog.to_regclass('public.milestone_submission_packages') is not null
    or pg_catalog.to_regclass('public.milestone_submission_attachments') is not null
    or pg_catalog.to_regclass('public.milestone_approvals') is not null then 'NEEDS_REVIEW' else 'PASS' end,
    'retirement catalog only; no deletion performed','Phase22 expects Phase18b retirement; inspect deployment if old tables remain'
  union all
  select 'runtime.'||area,'NEEDS_RUNTIME_CHECK','not executed by this read-only catalog/count query',expected
    from (values
      ('auth_replay','account/session isolation, refresh single-flight, stable UUID/body/CAS; no automatic 5xx write replay'),
      ('phase_pic','legacy policy, plan+PIC atomicity, historical milestone preservation, Continue/Close race'),
      ('output_snapshot','immutable bytes/refs, per-file markers, stale review refusal, idempotent progression'),
      ('repository_access','list/search/detail/download/ZIP revocation policy; old signed URLs expire after their existing TTL'),
      ('storage_recovery','two-instance create retry/fencing and exact-path cleanup; no orphan inference from timeout'),
      ('audit_cache','atomic rollback, no-op/replay without duplicate audit, account cache clear and lifecycle invalidation')
    ) runtime(area,expected)
)
select check_name,status,observed,expected from results order by check_name;
