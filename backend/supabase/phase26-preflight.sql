-- READ ONLY. No user content, credentials or Storage paths.
select column_name,data_type,numeric_precision,numeric_scale from information_schema.columns
where table_schema='public' and table_name='projects' and column_name in ('estimated_revenue','final_contract_value','updated_at');
select column_name,data_type,is_nullable,character_maximum_length from information_schema.columns where table_schema='public'
  and table_name='activity_logs' order by ordinal_position;
-- Expect zero before first application; do not overwrite another implementation.
select count(*) as action_namespace_collisions from public.activity_logs where action='PROJECT_ESTIMATED_VALUE_CHANGED';
select status,is_postponed,count(*) from public.projects group by status,is_postponed;
select count(*) as editable_missing_version from public.projects where status in ('DRAFT','ACTIVE') and updated_at is null;
select to_regprocedure('public.update_project_estimated_value(uuid,uuid,text,timestamptz,uuid)') as existing_rpc;
-- Inspect activity UPDATE/DELETE policies and project timestamp triggers. An
-- existing trigger may supply updated_at; RPC captures the returned DB value.
select tablename,policyname,roles,cmd from pg_policies where schemaname='public' and tablename='activity_logs';
select tgname,pg_get_triggerdef(oid) from pg_trigger where tgrelid='public.projects'::regclass and not tgisinternal;
-- Inspect restrictions on action/description and BEFORE INSERT triggers before
-- deployment; this migration deliberately keeps all existing restrictions.
select conname,pg_get_constraintdef(oid) from pg_constraint where conrelid='public.activity_logs'::regclass;
select tgname,pg_get_triggerdef(oid) from pg_trigger where tgrelid='public.activity_logs'::regclass and not tgisinternal;
