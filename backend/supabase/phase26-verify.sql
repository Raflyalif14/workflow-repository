-- READ ONLY after Phase 26. Mismatch queries should return zero rows.
select to_regprocedure('public.update_project_estimated_value(uuid,uuid,text,timestamptz,uuid)') as estimate_rpc;
select id,project_id from public.activity_logs where action='PROJECT_ESTIMATED_VALUE_CHANGED' and
 (estimated_value_audit is null or user_id is null or estimated_value_audit->>'object_type' is distinct from 'PROJECT'
  or estimated_value_audit->>'object_id' is distinct from project_id::text
  or not (estimated_value_audit ?& array['before','after','request_id','expected_updated_at','saved_updated_at']));
select project_id,estimated_value_audit->>'request_id',count(*) from public.activity_logs
where action='PROJECT_ESTIMATED_VALUE_CHANGED' group by project_id,estimated_value_audit->>'request_id' having count(*)>1;
select id,project_id from public.activity_logs where action='PROJECT_ESTIMATED_VALUE_CHANGED'
  and estimated_value_audit->>'before' is not distinct from estimated_value_audit->>'after';
select has_function_privilege('authenticated','public.update_project_estimated_value(uuid,uuid,text,timestamptz,uuid)','EXECUTE') as authenticated_must_be_false,
 has_function_privilege('anon','public.update_project_estimated_value(uuid,uuid,text,timestamptz,uuid)','EXECUTE') as anon_must_be_false,
 has_function_privilege('service_role','public.update_project_estimated_value(uuid,uuid,text,timestamptz,uuid)','EXECUTE') as service_role_must_be_true;
