-- READ ONLY. IDs/status/counts only: no document contents, recipients or Storage paths.
select count(*) as legacy_access_rows from public.document_repository_access;
select count(*) as legacy_grants from public.document_repository_grants;
select count(distinct a.project_id) as projects_requiring_manual_classification
from public.document_repository_access a where a.access_mode='SHARED_INTERNAL'
  or exists(select 1 from public.document_repository_grants g where g.access_id=a.id);
select a.project_id,count(*) as configured_documents,
  count(*) filter(where a.access_mode='SHARED_INTERNAL') as shared_documents,
  sum((select count(*) from public.document_repository_grants g where g.access_id=a.id)) as individual_grants
from public.document_repository_access a group by a.project_id
having bool_or(a.access_mode='SHARED_INTERNAL') or sum((select count(*) from public.document_repository_grants g where g.access_id=a.id))>0
order by a.project_id;
select to_regprocedure('public.list_document_repository_access(uuid,text)') as read_rpc,
  to_regclass('public.document_repository_access_requests') as phase29_receipts;
