-- Read-only verification after phase36.
select column_name,data_type from information_schema.columns
where table_schema='public' and table_name='project_output_documents'
  and column_name in ('start_date','duration_working_days','due_date');
select to_regprocedure('public.mutate_project_output_timeline(uuid,uuid,text,jsonb,timestamp with time zone,uuid)') as timeline_rpc;
select has_function_privilege('authenticated','public.mutate_project_output_timeline(uuid,uuid,text,jsonb,timestamptz,uuid)','EXECUTE') as client_must_be_false,
  has_function_privilege('service_role','public.mutate_project_output_timeline(uuid,uuid,text,jsonb,timestamptz,uuid)','EXECUTE') as server_must_be_true;
select count(*) as invalid_output_schedules from public.project_output_documents
where (start_date is not null or due_date is not null or duration_working_days is not null)
  and (start_date is null or due_date is null or duration_working_days is null
    or duration_working_days<=0 or due_date<start_date);
