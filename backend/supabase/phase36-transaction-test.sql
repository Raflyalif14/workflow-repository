begin;
do $$
declare
  source_m public.project_milestones%rowtype; source_p public.projects%rowtype;
  source_d public.project_output_documents%rowtype;
  test_p public.projects%rowtype; test_m uuid:=gen_random_uuid(); test_id uuid:=gen_random_uuid();
  doc_ids uuid[]:='{}'; payload jsonb; result jsonb; bad_payload jsonb;
  request_id uuid:=gen_random_uuid(); expected timestamptz; scenario uuid; phase uuid;
  item_count integer:=0; audit_count integer; total_count integer;
begin
  select m.* into source_m from public.project_milestones m
    join public.projects p on p.id=m.project_id join public.users u on u.id=p.sales_id
    where u.role='SALES' and u.is_active
      and (select count(*) from public.project_output_documents d where d.milestone_id=m.id and (d.is_selected or d.is_required))>=2
    limit 1;
  if not found then raise exception 'No fixture template available'; end if;
  select * into source_p from public.projects where id=source_m.project_id;
  select scenario_id into scenario from public.workflow_stages where id=source_m.workflow_stage_id;
  -- Clone into new IDs inside an outer transaction that always rolls back.
  insert into public.projects select (jsonb_populate_record(null::public.projects,to_jsonb(source_p)||jsonb_build_object(
    'id',test_id,'name','PHASE36 ROLLBACK TEST','customer','Synthetic test','status','DRAFT',
    'scenario_id',scenario,'current_scenario_id',scenario,'active_phase_id',null,'phase_migration_state','LEGACY_REVIEW',
    'pic_id',null,'is_postponed',false,'final_contract_value',null,'loss_reason',null,
    'created_at',now(),'updated_at',now()))).*;
  select * into test_p from public.projects where id=test_id;
  phase:=test_p.active_phase_id;
  insert into public.project_milestones select (jsonb_populate_record(null::public.project_milestones,to_jsonb(source_m)||jsonb_build_object(
    'id',test_m,'project_id',test_id,'phase_id',phase,'status','CREATED','pic_id',null,
    'start_date',null,'duration_working_days',null,'due_date',null,'created_at',now(),'updated_at',now()))).*;
  for source_d in select * from public.project_output_documents where milestone_id=source_m.id and (is_selected or is_required) order by id limit 2 loop
    doc_ids:=array_append(doc_ids,gen_random_uuid()); item_count:=item_count+1;
    insert into public.project_output_documents select (jsonb_populate_record(null::public.project_output_documents,to_jsonb(source_d)||jsonb_build_object(
      'id',doc_ids[item_count],'project_id',test_id,'phase_id',phase,'milestone_id',test_m,'status','TO_DO',
      'current_version_id',null,'draft_revision',0,'start_date',null,'duration_working_days',null,'due_date',null,
      'created_at',now(),'updated_at',now()))).*;
  end loop;
  select updated_at into expected from public.projects where id=test_id;
  payload:=jsonb_build_object('milestones',jsonb_build_array(jsonb_build_object('id',test_m,'start_date','2026-11-02','duration_working_days',9,'due_date','2026-11-12')),
    'outputs',jsonb_build_array(
      jsonb_build_object('id',doc_ids[1],'milestone_id',test_m,'start_date','2026-11-02','duration_working_days',2,'due_date','2026-11-03'),
      jsonb_build_object('id',doc_ids[2],'milestone_id',test_m,'start_date','2026-11-10','duration_working_days',3,'due_date','2026-11-12')));
  result:=public.mutate_project_output_timeline(test_id,test_p.sales_id,'TIMELINE',payload,expected,request_id);
  if (result->>'replayed')::boolean then raise exception 'Unexpected replay'; end if;
  if not exists(select 1 from public.project_output_documents where id=doc_ids[1] and start_date='2026-11-02' and due_date='2026-11-03' and duration_working_days=2)
    or not exists(select 1 from public.project_output_documents where id=doc_ids[2] and start_date='2026-11-10' and due_date='2026-11-12' and duration_working_days=3)
    then raise exception 'Schedules were not stored independently'; end if;
  if exists(select 1 from public.project_output_documents where project_id=test_id and status<>'TO_DO') then raise exception 'Status changed'; end if;
  select count(*) into audit_count from public.activity_logs where project_id=test_id;
  result:=public.mutate_project_output_timeline(test_id,test_p.sales_id,'TIMELINE',payload,expected,request_id);
  if (result->>'replayed')::boolean is not true then raise exception 'Retry did not replay'; end if;
  select count(*) into total_count from public.activity_logs where project_id=test_id;
  if total_count<>audit_count then raise exception 'Retry duplicated audit'; end if;
  begin
    perform public.mutate_project_output_timeline(test_id,gen_random_uuid(),'TIMELINE',payload,expected,gen_random_uuid());
    raise exception 'Unauthorized caller accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.mutate_project_output_timeline(test_id,test_p.sales_id,'TIMELINE',payload,expected-interval '1 day',gen_random_uuid());
    raise exception 'Stale write accepted';
  exception when serialization_failure then null; end;
  select updated_at into expected from public.projects where id=test_id;
  -- First output and parent are changed before the second invalid date fails.
  -- The entire RPC, including its receipt and audit, must roll back.
  bad_payload:=jsonb_set(jsonb_set(payload,'{outputs,0,start_date}','"2026-11-01"'),'{outputs,1,due_date}','"2026-11-01"');
  begin
    perform public.mutate_project_output_timeline(test_id,test_p.sales_id,'TIMELINE',bad_payload,expected,gen_random_uuid());
    raise exception 'Invalid output accepted';
  exception when invalid_parameter_value then null; end;
  if not exists(select 1 from public.project_output_documents where id=doc_ids[1] and start_date='2026-11-02') then raise exception 'Partial output write survived failure'; end if;
  select count(*) into total_count from public.activity_logs where project_id=test_id;
  if total_count<>audit_count then raise exception 'Failed request left audit'; end if;
  if (select count(*) from public.project_business_requests where project_id=test_id)<>1 then raise exception 'Failed request left receipt'; end if;
end $$;
rollback;
select 'PASS: independent dates, unchanged status, idempotent retry, owner check, concurrency, atomic rollback; synthetic fixture rolled back' as result;
