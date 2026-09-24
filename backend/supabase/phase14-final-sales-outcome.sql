-- Complete the final Sales milestone and record the tender result atomically.
begin;

create or replace function public.complete_final_sales_milestone_with_outcome(
  p_milestone_id uuid,
  p_sales_id uuid,
  p_outcome text,
  p_final_contract_value numeric,
  p_loss_reason text,
  p_required_output_keys text[]
)
returns table(changed boolean, project_id uuid, milestone_name text, completed_at timestamptz, project_status text)
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_project public.projects%rowtype;
  v_milestone public.project_milestones%rowtype;
  v_role text;
  v_now timestamptz;
begin
  select p.* into v_project
  from public.projects p
  join public.project_milestones m on m.project_id = p.id
  where m.id = p_milestone_id
  for update of p;
  if not found then raise exception 'Milestone not found.'; end if;

  select m.* into v_milestone
  from public.project_milestones m
  where m.id = p_milestone_id and m.project_id = v_project.id
  for update of m;
  if not found then raise exception 'Milestone not found.'; end if;
  select s.default_role into v_role from public.workflow_stages s where s.id = v_milestone.workflow_stage_id;

  if v_project.sales_id is distinct from p_sales_id or v_role is distinct from 'SALES'
    or not exists (select 1 from public.users u where u.id = p_sales_id and u.role = 'SALES' and u.is_active is true) then
    raise exception 'Only the project owner can complete this milestone.';
  end if;
  if exists (select 1 from public.project_milestones m where m.project_id = v_project.id and m.step_order > v_milestone.step_order) then
    raise exception 'This is not the final milestone.';
  end if;
  if p_outcome is null or p_outcome not in ('WON', 'LOST')
    or (p_outcome = 'WON' and (p_final_contract_value is null or p_final_contract_value <= 0 or p_final_contract_value = 'NaN'::numeric or p_loss_reason is not null))
    or (p_outcome = 'LOST' and (p_final_contract_value is not null or nullif(pg_catalog.btrim(p_loss_reason), '') is null or pg_catalog.length(p_loss_reason) > 2000)) then
    raise exception 'A valid project result is required.';
  end if;

  if v_milestone.status = 'COMPLETED' and v_project.status in ('WON', 'LOST') then
    if v_project.status <> p_outcome
      or v_project.final_contract_value is distinct from p_final_contract_value
      or v_project.loss_reason is distinct from p_loss_reason then
      raise exception 'Project result has already been recorded.';
    end if;
    return query select false, v_project.id, v_milestone.name, v_milestone.completed_at, v_project.status;
    return;
  end if;

  if v_project.status <> 'ACTIVE' or v_project.is_postponed is true then
    raise exception 'Project is not active.';
  end if;
  if v_milestone.status <> 'IN_PROGRESS' then
    raise exception 'Only IN_PROGRESS milestones can be completed.';
  end if;
  if not exists (select 1 from public.project_milestones m where m.project_id = v_project.id)
    or exists (select 1 from public.project_milestones m where m.project_id = v_project.id and m.id <> v_milestone.id and m.status not in ('COMPLETED', 'APPROVED')) then
    raise exception 'Other milestones must be completed first.';
  end if;

  perform 1 from public.project_output_documents d where d.project_id = v_project.id for update;

  if p_required_output_keys is null or pg_catalog.array_length(p_required_output_keys, 1) is null
    or exists (select 1 from pg_catalog.unnest(p_required_output_keys) k where k is null or pg_catalog.btrim(k) = '')
    or exists (
      select 1 from pg_catalog.unnest(p_required_output_keys) k
      where not exists (select 1 from public.project_output_documents d where d.project_id = v_project.id and d.document_key = k and d.status = 'APPROVED')
    )
    or exists (
      select 1 from pg_catalog.jsonb_array_elements_text(v_project.selected_document_keys) k
      where not exists (select 1 from public.project_output_documents d where d.project_id = v_project.id and d.document_key = k and d.status = 'APPROVED')
    )
    or exists (
      select 1 from public.project_output_documents d
      where d.project_id = v_project.id and (d.is_required or d.is_selected) and d.status <> 'APPROVED'
    ) then
    raise exception 'Selected output documents must be approved first.';
  end if;

  v_now := pg_catalog.now();
  update public.project_milestones
  set status = 'COMPLETED', completed_at = v_now, updated_at = v_now
  where id = v_milestone.id and status = 'IN_PROGRESS';
  if not found then raise exception 'Milestone changed during completion.'; end if;

  update public.projects
  set status = p_outcome,
      final_contract_value = p_final_contract_value,
      loss_reason = p_loss_reason,
      outcome_decided_by = p_sales_id,
      outcome_decided_at = v_now,
      updated_at = v_now
  where id = v_project.id and status = 'ACTIVE' and is_postponed is not true;
  if not found then raise exception 'Project changed during completion.'; end if;

  return query select true, v_project.id, v_milestone.name, v_now, p_outcome;
end;
$$;

revoke all on function public.complete_final_sales_milestone_with_outcome(uuid,uuid,text,numeric,text,text[]) from public, anon, authenticated;
grant execute on function public.complete_final_sales_milestone_with_outcome(uuid,uuid,text,numeric,text,text[]) to service_role;

commit;
