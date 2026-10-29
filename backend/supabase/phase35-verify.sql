select document_key,is_required from public.output_document_stage_catalog where group_key='ON_SUBMISSION_TENDER' order by document_key;
select to_regprocedure('public.start_parallel_milestone(uuid,uuid)') as parallel_rpc,
  to_regprocedure('public.complete_final_sales_with_evidence(uuid,uuid,text,numeric,text,text[],uuid[])') as outcome_rpc;
select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='project_outcome_evidence';
select count(*) as evidence_rows from public.project_outcome_evidence;
select count(*) as invalid_evidence_links from public.project_outcome_evidence e join public.documents d on d.id=e.document_id join public.document_versions v on v.id=e.version_id where d.project_id<>e.project_id or v.document_id<>e.document_id;
select tgname from pg_trigger where not tgisinternal and tgname in ('require_result_evidence','keep_future_milestone_unstarted');
