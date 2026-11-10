begin read only;
select json_build_object(
 'meetings_table',to_regclass('public.project_meetings') is not null,
 'rpc',to_regprocedure('public.mutate_project_meeting(uuid,uuid,text,jsonb,uuid,uuid,integer)') is not null,
 'client_rpc',has_function_privilege('authenticated','public.mutate_project_meeting(uuid,uuid,text,jsonb,uuid,uuid,integer)','EXECUTE'),
 'server_rpc',has_function_privilege('service_role','public.mutate_project_meeting(uuid,uuid,text,jsonb,uuid,uuid,integer)','EXECUTE'),
 'client_table_read',has_table_privilege('authenticated','public.project_meetings','SELECT'),
 'server_direct_insert',has_table_privilege('service_role','public.project_meetings','INSERT'),
 'row_security',(select relrowsecurity from pg_class where oid='public.project_meetings'::regclass),
 'receipt_row_security',(select relrowsecurity from pg_class where oid='public.project_meeting_requests'::regclass),
 'meetings',(select count(*) from public.project_meetings),
 'receipts',(select count(*) from public.project_meeting_requests),
 'test_projects',(select count(*) from public.projects where name in ('PHASE37 ROLLBACK TEST','PHASE37 NO PIC TEST'))
);
commit;
