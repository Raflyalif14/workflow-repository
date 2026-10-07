-- READ ONLY after Phase 29. Does not mutate access or generate signed URLs.
select access_mode,count(*) from public.document_repository_access group by access_mode;
-- Immediately after applying to existing data, all three new tables must be empty.
select (select count(*) from public.document_repository_access) as access_rows,
  (select count(*) from public.document_repository_grants) as grants,
  (select count(*) from public.document_repository_access_requests) as receipts;
-- Mismatch queries must return zero rows.
select a.id from public.document_repository_access a
left join public.documents d on d.id=a.document_id
left join public.project_output_documents od on od.id=a.output_document_id
where a.project_id is distinct from coalesce(d.project_id,od.project_id);
select access_id,user_id,count(*) from public.document_repository_grants
group by access_id,user_id having count(*)>1;
select id from public.activity_logs where action='DOCUMENT_ACCESS_CHANGED' and
  (user_id is null or document_access_audit is null
    or not(document_access_audit ?& array['source_type','object_id','before','after','revision','request_id']));
select c.relname,c.relrowsecurity,has_table_privilege('authenticated',c.oid,'SELECT') as client_select,
  has_table_privilege('service_role',c.oid,'INSERT,UPDATE,DELETE') as server_direct_write_must_be_false
from pg_class c where c.oid in ('public.document_repository_access'::regclass,
  'public.document_repository_grants'::regclass,'public.document_repository_access_requests'::regclass);
select has_function_privilege('authenticated','public.list_document_repository_access(uuid,text)','EXECUTE') as client_read_must_be_false,
  has_function_privilege('authenticated','public.set_document_repository_access(uuid,text,uuid,text,uuid[],bigint,uuid)','EXECUTE') as client_write_must_be_false,
  has_function_privilege('service_role','public.set_document_repository_access(uuid,text,uuid,text,uuid[],bigint,uuid)','EXECUTE') as server_write_must_be_true;
select polname,polpermissive,polcmd from pg_policy where polrelid='public.activity_logs'::regclass
  and polname in ('document_access_private_audit','document_access_server_audit_insert',
    'document_access_server_audit_update','document_access_server_audit_delete');
-- Add a verified fixture actor ID manually if checking the RPC's read scope.
-- Never pass an arbitrary actor from a browser directly to these service-only RPCs.
