-- READ ONLY after Phase 25. Mismatch queries must return zero rows.
select sales_decision,count(*) from public.project_phases group by sales_decision;
select p.id,ph.id,ph.sales_decision from public.projects p join public.project_phases ph on ph.project_id = p.id
where ph.sales_decision = 'CLOSE_PRA_TENDER'
  and (p.status <> 'COMPLETED' or p.active_phase_id is distinct from ph.id
    or exists(select 1 from public.project_phases t where t.project_id = p.id and t.phase_key = 'ON_SUBMISSION_TENDER'));
select ph.project_id,ph.id from public.project_phases ph
where ph.sales_decision = 'CONTINUE_TENDER' and not exists
  (select 1 from public.project_phases t where t.project_id = ph.project_id and t.phase_key = 'ON_SUBMISSION_TENDER');
select ph.project_id,ph.id from public.project_phases ph
where ph.sales_decision is not null and (ph.phase_key <> 'PRA_TENDER' or ph.status <> 'COMPLETED' or ph.sales_decided_at is null);
select project_id,count(*) from public.activity_logs where action = 'PRA_TENDER_DECIDED'
group by project_id having count(*) > 1;
select to_regprocedure('public.close_project_at_pra_tender(uuid,uuid)') as close_rpc;

-- Safe channel inventory; no notification text or receiver data selected.
select in_app_visible,count(*) from public.notifications
where type = 'PRA_TENDER_CLOSED' group by in_app_visible;
-- Retry Close must not duplicate records for a project/recipient (IDs omitted).
select project_id,count(*) as duplicate_recipient_groups from (
  select project_id,user_id from public.notifications where type = 'PRA_TENDER_CLOSED'
  group by project_id,user_id having count(*) > 1
) duplicated group by project_id;
select n.project_id,d.notification_id,count(*) from public.notifications n
join public.notification_deliveries d on d.notification_id = n.id
where n.type = 'PRA_TENDER_CLOSED' and d.channel = 'TELEGRAM'
group by n.project_id,d.notification_id having count(*) > 1;
