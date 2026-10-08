-- Synthetic identities and metadata only; never imports live data or Storage.
create schema test_support;
create function test_support.u(n integer) returns uuid language sql immutable as
$$ select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function test_support.check_true(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Test assertion: %',label; end if; end $$;
create function test_support.expect_error(command text,expected text) returns void language plpgsql as $$
declare code text;
begin
  begin execute command; exception when others then get stacked diagnostics code=returned_sqlstate; end;
  if code is distinct from expected then raise exception 'Expected SQLSTATE %, observed %',expected,coalesce(code,'SUCCESS'); end if;
end $$;
create function test_support.fail_audit() returns trigger language plpgsql as $$
begin
  if new.action=current_setting('test.fail_action',true) then
    raise exception 'Injected fixture audit failure' using errcode='23514'; end if;
  return new;
end $$;
create trigger test_fail_audit before insert on public.activity_logs for each row execute function test_support.fail_audit();
grant usage on schema test_support to service_role,authenticated,anon;
grant execute on all functions in schema test_support to service_role,authenticated,anon;
insert into auth.users(id,email)
select test_support.u(n),'fixture-'||n||'@example.invalid' from generate_series(1,7) n;
insert into public.users(id,email,full_name,role,is_active,must_change_password)
select test_support.u(n),'fixture-'||n||'@example.invalid','Fixture',
  case n when 1 then 'SALES' when 2 then 'SA' when 3 then 'HEAD_SA' when 4 then 'SUPER_ADMIN'
    when 5 then 'SA' when 6 then 'SA' else 'SALES' end,n<>6,false from generate_series(1,7) n;
insert into public.projects(id,name,customer,scenario_id,sales_id,pic_id,status,selected_document_keys,estimated_revenue)
select test_support.u(101),'Fixture','Fixture',id,test_support.u(1),test_support.u(2),'ACTIVE',
  '["proposal_deck_solusi","assessment"]',100 from public.scenarios where name='Pra-Tender' and is_active;
update public.project_phases set status='ACTIVE',pic_id=test_support.u(2) where project_id=test_support.u(101);
insert into public.project_milestones(id,project_id,workflow_stage_id,name,step_order,status,pic_id,start_date,duration_working_days,due_date)
select test_support.u(case c.document_key when 'proposal_deck_solusi' then 201 else 202 end),test_support.u(101),ws.id,'Fixture',
  case c.document_key when 'proposal_deck_solusi' then 1 else 2 end,'IN_PROGRESS',test_support.u(2),current_date-1,2,current_date+1
from public.output_document_stage_catalog c join public.workflow_stages ws on ws.stage_key=c.stage_key
join public.scenarios s on s.id=ws.scenario_id and s.name='Pra-Tender' and s.is_active
where c.document_key in ('proposal_deck_solusi','assessment');
insert into public.project_output_documents(id,project_id,document_key,milestone_id,title,is_required,is_selected,status)
select test_support.u(case document_key when 'proposal_deck_solusi' then 301 else 302 end),test_support.u(101),document_key,
  test_support.u(case document_key when 'proposal_deck_solusi' then 201 else 202 end),'Fixture',is_required,true,'TO_DO'
from public.output_document_stage_catalog where document_key in ('proposal_deck_solusi','assessment');
