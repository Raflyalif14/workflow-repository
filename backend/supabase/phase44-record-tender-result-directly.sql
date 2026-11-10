-- Apply after phase43. Keep existing outcomes and stage history.
begin;

create or replace function public.complete_final_sales_with_evidence(p_milestone_id uuid,p_sales_id uuid,p_outcome text,p_final_contract_value numeric,p_loss_reason text,p_required_output_keys text[],p_evidence_document_ids uuid[])
returns table(changed boolean,project_id uuid,milestone_name text,completed_at timestamptz,project_status text)
language plpgsql security definer set search_path=pg_catalog as $$
declare v_p public.projects%rowtype;
begin
  select p.* into v_p from public.projects p join public.project_milestones m on m.project_id=p.id where m.id=p_milestone_id for update of p;
  if not found then raise exception 'Milestone not found';end if;
  -- The final result action starts the internal Tender Process and completes it atomically.
  if exists(select 1 from public.project_milestones m join public.workflow_stages s on s.id=m.workflow_stage_id
    where m.id=p_milestone_id and m.phase_id is not distinct from v_p.active_phase_id
      and m.status='CREATED' and s.default_role='SALES' and s.stage_key='TENDER_PROCESS'
      and not exists(select 1 from public.project_milestones later where later.project_id=v_p.id
        and later.phase_id is not distinct from v_p.active_phase_id and later.step_order>m.step_order)) then
    perform public.start_parallel_milestone(p_milestone_id,p_sales_id);
  end if;
  perform public.validate_outcome_evidence(v_p.id,p_sales_id,p_outcome,p_evidence_document_ids);
  if v_p.active_phase_id is null then
    return query select * from public.complete_final_sales_milestone_with_outcome(p_milestone_id,p_sales_id,p_outcome,p_final_contract_value,p_loss_reason,p_required_output_keys);
  else
    return query select * from public.complete_phase_final_sales_milestone_with_outcome(p_milestone_id,p_sales_id,p_outcome,p_final_contract_value,p_loss_reason,p_required_output_keys);
  end if;
end $$;
revoke all on function public.complete_final_sales_with_evidence(uuid,uuid,text,numeric,text,text[],uuid[]) from public,anon,authenticated;
grant execute on function public.complete_final_sales_with_evidence(uuid,uuid,text,numeric,text,text[],uuid[]) to service_role;

commit;
