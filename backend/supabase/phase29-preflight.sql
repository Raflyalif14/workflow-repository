-- READ ONLY. No document contents, recipients, Storage paths or credentials selected.
select to_regclass('public.project_output_review_requests') as phase28_required,
  to_regclass('public.document_repository_access') as must_be_null_before_first_apply;
select c.relrowsecurity as activity_rls,
  has_table_privilege('anon','public.activity_logs','SELECT') as anonymous_select,
  has_table_privilege('authenticated','public.activity_logs','SELECT') as client_select,
  has_table_privilege('anon','public.activity_logs','INSERT,UPDATE,DELETE') as anonymous_write,
  has_table_privilege('authenticated','public.activity_logs','INSERT,UPDATE,DELETE') as client_write
from pg_class c where c.oid='public.activity_logs'::regclass;
-- STOP if activity RLS is false while either client role can read/write.
select polname,polpermissive,polcmd from pg_policy where polrelid='public.activity_logs'::regclass;
select rolname,rolbypassrls from pg_roles where rolname='service_role';
select count(*) as action_namespace_collisions from public.activity_logs where action='DOCUMENT_ACCESS_CHANGED';
select tgname,pg_get_triggerdef(oid) from pg_trigger where tgrelid='public.activity_logs'::regclass and not tgisinternal;
-- Review existing custom activity triggers for unexpected notification side effects.
select status,count(*) from public.documents group by status;
select status,count(*) from public.project_output_documents group by status;
-- Must be empty. A document cannot have more than one current version.
select document_id,count(*) from public.document_versions where is_latest
group by document_id having count(*)>1;
-- Existing broken results are excluded from sharing; repair deliberately, never by copying bytes.
select d.id from public.documents d where d.status='APPROVED' and not exists (
  select 1 from public.document_versions v where v.document_id=d.id and v.is_latest
    and v.status='APPROVED' and nullif(btrim(v.storage_path),'') is not null);
select d.id from public.project_output_documents d where d.status='APPROVED' and (
  not exists (select 1 from public.project_output_document_versions v where v.id=d.current_version_id
    and v.output_document_id=d.id and v.project_id=d.project_id and v.status='APPROVED'
    and v.snapshot_kind<>'LEGACY_UPLOAD_UNCONFIRMED')
  or not exists (select 1 from public.project_output_document_version_files vf where vf.version_id=d.current_version_id)
  or exists (select 1 from public.project_output_document_version_files vf
    left join public.project_output_document_files f on f.id=vf.file_id
    where vf.version_id=d.current_version_id and (vf.output_document_id is distinct from d.id
      or vf.project_id is distinct from d.project_id or f.output_document_id is distinct from d.id
      or f.project_id is distinct from d.project_id or nullif(btrim(f.storage_path),'') is null)));
-- These existing deletion/source constraints must retain CASCADE behavior.
select conrelid::regclass as table_name,conname,confrelid::regclass as referenced_table,confdeltype
from pg_constraint where contype='f' and conrelid in
  ('public.documents'::regclass,'public.project_output_documents'::regclass);
