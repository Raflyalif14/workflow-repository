-- READ ONLY. Never invokes a business mutation or signs downloads.
select access_mode,count(*) from public.project_document_sharing group by access_mode;
select count(*) as legacy_rows_retained from public.document_repository_access;
select count(*) as legacy_grants_retained from public.document_repository_grants;
-- Expect zero rows: every legacy extra-access project was explicitly classified.
select distinct a.project_id from public.document_repository_access a
where (a.access_mode='SHARED_INTERNAL' or exists(select 1 from public.document_repository_grants g where g.access_id=a.id))
  and not exists(select 1 from public.project_document_sharing s where s.project_id=a.project_id and s.legacy_classified_at is not null);
select project_id,request_id,count(*) from public.project_document_sharing_requests group by project_id,request_id having count(*)>1;
select id from public.activity_logs where document_access_audit->>'source_type'='PROJECT' and
  (user_id is null or action <> 'DOCUMENT_ACCESS_CHANGED' or document_access_audit->'before'=document_access_audit->'after'
    or not(document_access_audit ?& array['object_id','revision','request_id']));
select has_function_privilege('service_role','public.set_document_repository_access(uuid,text,uuid,text,uuid[],bigint,uuid)','EXECUTE') as retired_must_be_false,
  has_function_privilege('authenticated','public.set_project_document_sharing(uuid,uuid,text,bigint,uuid)','EXECUTE') as client_must_be_false,
  has_function_privilege('service_role','public.set_project_document_sharing(uuid,uuid,text,bigint,uuid)','EXECUTE') as server_must_be_true;
select c.relname,c.relrowsecurity,has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') as client_must_be_false,
  has_table_privilege('service_role',c.oid,'INSERT,UPDATE,DELETE') as direct_server_write_must_be_false
from pg_class c where c.oid in ('public.project_document_sharing'::regclass,'public.project_document_sharing_requests'::regclass);
-- Central policy has no legacy ACL/grant dependency after cutover.
select position('document_repository_grants' in pg_get_functiondef('public.list_document_repository_access(uuid,text)'::regprocedure))=0 as grants_ignored,
  position('project_document_sharing' in pg_get_functiondef('public.list_document_repository_access(uuid,text)'::regprocedure))>0 as project_source;
