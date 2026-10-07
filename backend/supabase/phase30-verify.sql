-- READ ONLY after Phase30; no mutation or sensitive data.
select action,count(*) from public.activity_logs where business_audit is not null group by action;
select id,project_id from public.activity_logs where business_audit is not null and
  (user_id is null or not(business_audit ?& array['object_type','object_id','changed_fields','before','after','request_id'])
    or business_audit->'before' = business_audit->'after');
select project_id,request_id,count(*) from public.project_business_requests group by project_id,request_id having count(*)>1;
select has_function_privilege('authenticated','public.mutate_project_business(uuid,uuid,text,jsonb,timestamptz,uuid)','EXECUTE') as client_must_be_false,
  has_function_privilege('service_role','public.mutate_project_business(uuid,uuid,text,jsonb,timestamptz,uuid)','EXECUTE') as server_must_be_true,
  has_function_privilege('service_role','public.mutate_output_draft_phase30_core(uuid,bigint,uuid,text,uuid,uuid,uuid,text,text,bigint,text,timestamptz,text)','EXECUTE') as draft_core_must_be_false;
select id from public.activity_logs where business_audit is not null and exists(
  select 1 from jsonb_object_keys((business_audit->'before') || (business_audit->'after')) k
  where k in ('storage_path','storage_paths','token','password','signed_url','raw_body','email'));

select has_function_privilege('service_role','public.delete_project_with_cleanup_phase30_core(uuid,text,uuid)','EXECUTE') as deletion_core_must_be_false,
  has_function_privilege('service_role','public.complete_phase_sa_milestone_phase30_core(uuid,uuid,boolean)','EXECUTE') as phase_core_must_be_false,
  has_function_privilege('authenticated','public.complete_business_milestone(uuid,uuid)','EXECUTE') as client_completion_must_be_false,
  has_function_privilege('service_role','public.complete_business_milestone(uuid,uuid)','EXECUTE') as server_completion_must_be_true;
