-- Synthetic project and all meeting/audit/receipt rows are rolled back.
begin;
do $$
declare template public.projects%rowtype; test_id uuid:=gen_random_uuid(); head_id uuid; meeting_id uuid;
 no_pic_id uuid:=gen_random_uuid(); create_id uuid:=gen_random_uuid(); approve_id uuid:=gen_random_uuid(); request jsonb; result jsonb; count_before integer;
begin
 select p.* into template from public.projects p join public.users s on s.id=p.sales_id join public.users a on a.id=p.pic_id
 where s.role='SALES' and s.is_active and not coalesce(s.must_change_password,false) and a.role='SA' and a.is_active limit 1;
 select id into head_id from public.users where role='HEAD_SA' and is_active and not coalesce(must_change_password,false) limit 1;
 if template.id is null or head_id is null then raise exception 'Missing fixture templates'; end if;
 insert into public.projects select (jsonb_populate_record(null::public.projects,to_jsonb(template)||jsonb_build_object(
  'id',test_id,'name','PHASE40 ROLLBACK TEST','customer','Synthetic','status','ACTIVE','is_postponed',false,
  'active_phase_id',null,'phase_migration_state','LEGACY_REVIEW','final_contract_value',null,'loss_reason',null,
  'created_at',now(),'updated_at',now()))).*;
 request:=jsonb_build_object('title','Synthetic meeting','agenda','Discuss work','location','Fixture room',
  'startsAt',now()+interval '5 days','endsAt',now()+interval '5 days 1 hour');
 result:=public.mutate_project_meeting(test_id,template.sales_id,'CREATE',request,create_id);
 meeting_id:=(result->'meeting'->>'id')::uuid;
 if (select count(*) from public.notifications where project_id=test_id and type='MEETING_REQUESTED')<>(select count(*) from public.users where role='HEAD_SA' and is_active) then raise exception 'Wrong request recipients'; end if;
 if result->'meeting'->>'status'<>'PENDING' then raise exception 'New meeting must wait for approval'; end if;
 result:=public.mutate_project_meeting(test_id,template.sales_id,'CREATE',request,create_id);
 if (result->>'replayed')::boolean is not true or (select count(*) from public.project_meetings where project_id=test_id)<>1 then raise exception 'Duplicate create'; end if;
 if (select count(*) from public.notifications where project_id=test_id and type='MEETING_REQUESTED')<>(select count(*) from public.users where role='HEAD_SA' and is_active) then raise exception 'Duplicate retry notifications'; end if;
 begin
  perform public.mutate_project_meeting(test_id,head_id,'CREATE',request,gen_random_uuid());raise exception 'Head created Sales meeting';
 exception when insufficient_privilege then null; end;
 begin
  perform public.mutate_project_meeting(test_id,template.sales_id,'APPROVE','{}',gen_random_uuid(),meeting_id,1);raise exception 'Sales approved own meeting';
 exception when insufficient_privilege then null; end;
 begin
  perform public.mutate_project_meeting(test_id,head_id,'REJECT','{"note":""}',gen_random_uuid(),meeting_id,1);raise exception 'Blank rejection accepted';
 exception when invalid_parameter_value then null; end;
 result:=public.mutate_project_meeting(test_id,head_id,'APPROVE','{"note":"Ready"}',approve_id,meeting_id,1);
 if result->'meeting'->>'status'<>'APPROVED' or (result->'meeting'->>'revision')::integer<>2 then raise exception 'Approval failed'; end if;
 if (select count(*) from public.notifications where project_id=test_id and type='MEETING_APPROVED' and user_id in(template.sales_id,template.pic_id))<>2 then raise exception 'Wrong approval recipients'; end if;
 select count(*) into count_before from public.activity_logs where project_id=test_id;
 result:=public.mutate_project_meeting(test_id,head_id,'APPROVE','{"note":"Ready"}',approve_id,meeting_id,1);
 if (result->>'replayed')::boolean is not true or (select count(*) from public.activity_logs where project_id=test_id)<>count_before then raise exception 'Duplicate review audit'; end if;
 begin
  perform public.mutate_project_meeting(test_id,head_id,'REJECT','{"note":"Changed"}',gen_random_uuid(),meeting_id,1);raise exception 'Stale review accepted';
 exception when serialization_failure then null; end;
 begin
  perform public.mutate_project_meeting(test_id,head_id,'APPROVE','{"note":"Different"}',approve_id,meeting_id,1);raise exception 'Changed retry accepted';
 exception when serialization_failure then null; end;
 result:=public.mutate_project_meeting(test_id,template.sales_id,'CANCEL','{}',gen_random_uuid(),meeting_id,2);
 if result->'meeting'->>'status'<>'CANCELLED' then raise exception 'Cancel failed'; end if;
 result:=public.mutate_project_meeting(test_id,template.sales_id,'CREATE',request,gen_random_uuid());meeting_id:=(result->'meeting'->>'id')::uuid;
 result:=public.mutate_project_meeting(test_id,head_id,'REJECT','{"note":"Choose another time"}',gen_random_uuid(),meeting_id,1);
 if result->'meeting'->>'status'<>'REJECTED' or result->'meeting'->>'review_note'<>'Choose another time' then raise exception 'Rejection history missing'; end if;
 insert into public.projects select (jsonb_populate_record(null::public.projects,to_jsonb(template)||jsonb_build_object(
  'id',no_pic_id,'name','PHASE40 NO PIC TEST','customer','Synthetic','status','ACTIVE','is_postponed',false,'pic_id',null,
  'active_phase_id',null,'phase_migration_state','LEGACY_REVIEW','final_contract_value',null,'loss_reason',null,
  'created_at',now(),'updated_at',now()))).*;
 begin
  perform public.mutate_project_meeting(no_pic_id,template.sales_id,'CREATE',request,gen_random_uuid());raise exception 'Missing PIC accepted';
 exception when object_not_in_prerequisite_state then null; end;
 if exists(select 1 from public.project_meetings where project_id=test_id and requested_by<>template.sales_id) then raise exception 'Actor spoof'; end if;
 if has_function_privilege('authenticated','public.mutate_project_meeting(uuid,uuid,text,jsonb,uuid,uuid,integer)','EXECUTE') then raise exception 'Client can bypass API'; end if;

 request:=request-'endsAt';
 result:=public.mutate_project_meeting(test_id,template.sales_id,'CREATE',request,gen_random_uuid());
 meeting_id:=(result->'meeting'->>'id')::uuid;
 if (select ends_at from public.project_meetings where id=meeting_id) is not null then raise exception 'Unknown end was fabricated'; end if;
 result:=public.mutate_project_meeting(test_id,head_id,'APPROVE','{}',gen_random_uuid(),meeting_id,1);
 if result->'meeting'->>'status'<>'APPROVED' or result->'meeting'->>'ends_at' is not null then raise exception 'No-end approval failed'; end if;
 request:=request||jsonb_build_object('endsAt',null);
 result:=public.mutate_project_meeting(test_id,template.sales_id,'CREATE',request,gen_random_uuid());
 if result->'meeting'->>'ends_at' is not null then raise exception 'Null end failed'; end if;
 begin
  perform public.mutate_project_meeting(test_id,template.sales_id,'CREATE',request||jsonb_build_object('endsAt',request->>'startsAt'),gen_random_uuid());raise exception 'Equal end accepted';
 exception when invalid_parameter_value then null; end;
 begin
  perform public.mutate_project_meeting(test_id,template.sales_id,'CREATE',request-'startsAt',gen_random_uuid());raise exception 'Missing start accepted';
 exception when invalid_parameter_value then null; end;
 if not exists(select 1 from public.notifications where project_id=test_id and type='MEETING_REJECTED') or not exists(select 1 from public.notifications where project_id=test_id and type='MEETING_CANCELLED') then raise exception 'Missing decision notifications'; end if;
 if exists(select 1 from public.notifications where project_id=test_id and action_url<>('/projects/'||test_id::text||'#project-meetings')) then raise exception 'Wrong destination'; end if;

 result:=public.mutate_project_meeting(test_id,template.sales_id,'CREATE',request,gen_random_uuid());
 meeting_id:=(result->'meeting'->>'id')::uuid;
 perform public.mutate_project_meeting(test_id,head_id,'APPROVE','{}',gen_random_uuid(),meeting_id,1);
 request:=request||jsonb_build_object('startsAt',now()+interval '8 days');
 create_id:=gen_random_uuid();
 result:=public.mutate_project_meeting(test_id,template.sales_id,'RESCHEDULE',request,create_id,meeting_id,2);
 result:=public.mutate_project_meeting(test_id,template.sales_id,'RESCHEDULE',request,create_id,meeting_id,2);
 if (result->>'replayed')::boolean is not true or (result->'meeting'->>'revision')::integer<>3 then raise exception 'Reschedule retry duplicated'; end if;
 if (result->'meeting'->>'starts_at')::timestamptz<>now()+interval '5 days' then raise exception 'Pending request changed confirmed schedule'; end if;
 begin
  perform public.mutate_project_meeting(test_id,template.sales_id,'APPROVE_RESCHEDULE','{}',gen_random_uuid(),meeting_id,3);raise exception 'Sales approved reschedule';
 exception when insufficient_privilege then null; end;
 perform public.mutate_project_meeting(test_id,head_id,'REJECT_RESCHEDULE','{"note":"Keep old time"}',gen_random_uuid(),meeting_id,3);
 if (select starts_at from public.project_meetings where id=meeting_id)<>now()+interval '5 days' then raise exception 'Rejection changed original time'; end if;
 perform public.mutate_project_meeting(test_id,template.sales_id,'RESCHEDULE',request,gen_random_uuid(),meeting_id,4);
 result:=public.mutate_project_meeting(test_id,head_id,'APPROVE_RESCHEDULE','{}',gen_random_uuid(),meeting_id,5);
 if (result->'meeting'->>'starts_at')::timestamptz<>now()+interval '8 days' or result->'meeting'->>'proposed_schedule' is not null then raise exception 'Approval did not apply schedule'; end if;
 if not exists(select 1 from public.notifications where project_id=test_id and type='MEETING_RESCHEDULE') then raise exception 'Missing reschedule notifications'; end if;
 delete from public.projects where id=test_id;
 if exists(select 1 from public.project_meetings where project_id=test_id) or exists(select 1 from public.project_meeting_requests where project_id=test_id) then raise exception 'Meeting rows did not follow project deletion'; end if;
end $$;
rollback;
select 'PASS optional/missing end, mandatory start, invalid end, approval and meeting create/retry, Head-only approval, reason, stale review, cancellation, missing PIC, audit and grants; all fixtures rolled back';
