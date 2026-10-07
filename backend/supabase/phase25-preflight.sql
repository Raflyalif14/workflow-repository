-- READ ONLY. Run before Phase 25. No user content or Storage paths selected.
select to_regclass('public.project_phases') as phases,
  to_regprocedure('public.continue_project_tender_phase(uuid,uuid,text[])') as continue_rpc;
select pg_get_constraintdef(oid) as project_status_constraint from pg_constraint
where conrelid = 'public.projects'::regclass and conname = 'projects_status_check';
-- Phase 25 adds in_app_visible; channel preferences must already be independent.
select table_name,column_name,is_nullable,column_default from information_schema.columns
where table_schema = 'public' and
  (table_name = 'notification_preferences' and column_name in ('in_app_enabled','telegram_enabled','telegram_chat_id')
    or table_name = 'notifications' and column_name = 'in_app_visible')
order by table_name,column_name;

-- Inventory only. Existing tender phases are never reclassified or rebuilt.
select p.id,p.status,p.is_postponed,ph.id as pra_phase_id,ph.status as phase_status,
  exists(select 1 from public.project_phases t where t.project_id = p.id and t.phase_key = 'ON_SUBMISSION_TENDER') as tender_already_exists
from public.projects p join public.project_phases ph on ph.project_id = p.id and ph.phase_key = 'PRA_TENDER'
order by p.id;

-- Must return zero rows for projects offered the new decision.
select p.id,ph.id as phase_id
from public.projects p join public.project_phases ph on ph.id = p.active_phase_id and ph.project_id = p.id
where p.status = 'ACTIVE' and not coalesce(p.is_postponed,false) and ph.phase_key = 'PRA_TENDER' and ph.status = 'COMPLETED'
  and (not exists(select 1 from public.project_milestones where project_id = p.id and phase_id = ph.id)
    or exists(select 1 from public.project_milestones where project_id = p.id and phase_id = ph.id and status not in ('COMPLETED','APPROVED'))
    or exists(select 1 from public.output_document_stage_catalog c left join public.project_output_documents od
      on od.project_id = p.id and od.phase_id = ph.id and od.document_key = c.document_key
      where c.group_key = 'PRA_TENDER' and (c.is_required or ph.selected_document_keys ? c.document_key)
        and (od.id is null or od.status <> 'APPROVED' or not od.is_selected)));
