-- READ ONLY after Phase31. No user content, hashes, recipients or Storage paths selected.
select status,count(*),min(created_at) as oldest from public.project_creation_requests group by status;
select state,count(*) from public.project_creation_files group by state;
-- COMMITTED rows whose project is absent are retained deletion tombstones, not failed creations.
select count(*) as deleted_committed_projects from public.project_creation_requests r left join public.projects p on p.id=r.project_id
  where r.status='COMMITTED' and p.id is null;
-- Mismatch queries must return zero rows.
select r.request_id from public.project_creation_requests r join public.projects p on p.id=r.project_id
  where r.status<>'COMMITTED';
select r.request_id from public.project_creation_requests r where r.status='COMMITTED' and exists
  (select 1 from public.project_creation_files f where f.request_id=r.request_id and f.state<>'STORED');
select r.request_id from public.project_creation_requests r join public.projects p on p.id=r.project_id
  where r.status='COMMITTED' and ((select count(*) from public.activity_logs a where a.project_id=p.id and a.action='PROJECT_CREATED')<>1
    or not exists(select 1 from public.project_milestones m where m.project_id=p.id));
select f.request_id,f.ordinal from public.project_creation_files f join public.project_creation_requests r on r.request_id=f.request_id
  join public.projects p on p.id=r.project_id left join public.project_intake_attachments a on a.id=f.id
  where r.status='COMMITTED' and (a.id is null or a.project_id is distinct from p.id or a.storage_path is distinct from f.storage_path);
select has_function_privilege('authenticated','public.project_creation_operation(uuid,uuid,text,text,jsonb,jsonb,uuid,integer)','EXECUTE') as client_must_be_false,
  has_function_privilege('service_role','public.project_creation_operation(uuid,uuid,text,text,jsonb,jsonb,uuid,integer)','EXECUTE') as server_must_be_true;
select c.relname,c.relrowsecurity,has_table_privilege('authenticated',c.oid,'SELECT') as client_must_be_false,
  has_table_privilege('service_role',c.oid,'INSERT,UPDATE,DELETE') as direct_writer_must_be_false
  from pg_class c where c.oid in ('public.project_creation_requests'::regclass,'public.project_creation_files'::regclass);
