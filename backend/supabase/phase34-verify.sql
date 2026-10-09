-- READ ONLY after Phase34. No payloads, paths, note/feedback/comment contents.
select operation,status,count(*) from public.artifact_mutation_requests group by operation,status;
select request_id from public.artifact_mutation_requests where (status='COMMITTED') is distinct from (result is not null);
select a.id from public.activity_logs a where a.business_audit->>'object_type' in ('OFFICIAL_DOCUMENT','DOCUMENT_COMMENT','SUPPORTING_CONTRIBUTION')
  and (a.user_id is null or not(a.business_audit ?& array['before','after','request_id','object_id','changed_fields']));
select business_audit->>'request_id',count(*) from public.activity_logs where business_audit->>'object_type' in ('OFFICIAL_DOCUMENT','DOCUMENT_COMMENT','SUPPORTING_CONTRIBUTION')
  group by business_audit->>'request_id' having count(*)>1;
select has_function_privilege('authenticated','public.mutate_official_artifact(uuid,uuid,text,jsonb,text,uuid)','EXECUTE') as client_must_be_false,
  has_function_privilege('service_role','public.mutate_official_artifact(uuid,uuid,text,jsonb,text,uuid)','EXECUTE') as server_must_be_true,
  has_function_privilege('service_role','public.delete_project_with_cleanup_phase34_core(uuid,text,uuid)','EXECUTE') as private_core_must_be_false;
select relrowsecurity,has_table_privilege('authenticated','public.artifact_mutation_requests','SELECT') as client_read_must_be_false,
  has_table_privilege('service_role','public.artifact_mutation_requests','INSERT,UPDATE,DELETE') as direct_write_must_be_false
  from pg_class where oid='public.artifact_mutation_requests'::regclass;
