-- Read only. Review these results before applying phase35. Never paste credentials into output.
select to_regprocedure('public.mutate_project_business(uuid,uuid,text,jsonb,timestamp with time zone,uuid)') as business_rpc,
  to_regprocedure('public.complete_phase_final_sales_milestone_with_outcome(uuid,uuid,text,numeric,text,text[])') as phase_outcome_rpc,
  to_regprocedure('public.complete_final_sales_milestone_with_outcome(uuid,uuid,text,numeric,text,text[])') as legacy_outcome_rpc;
select document_key,is_required from public.output_document_stage_catalog where group_key='ON_SUBMISSION_TENDER';
-- Existing future stages are reported for review, not silently reset by migration.
select id,project_id,start_date,status from public.project_milestones where status='IN_PROGRESS' and start_date>(now() at time zone 'Asia/Jakarta')::date;
select count(*) as historic_results_without_new_evidence from public.projects where status in ('WON','LOST');
