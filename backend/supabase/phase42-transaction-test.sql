begin;
do $$
declare template public.projects%rowtype; test_id uuid:=gen_random_uuid(); pra uuid; tender uuid; scenario uuid; sa uuid; head_id uuid; approval uuid:=gen_random_uuid(); rev bigint; result jsonb; assignment_count integer;
begin
 select p.* into template from public.projects p join public.users u on u.id=p.sales_id where u.role='SALES' and u.is_active limit 1;
 select id into sa from public.users where role='SA' and is_active limit 1;
 select id into head_id from public.users where role='HEAD_SA' and is_active limit 1;
 select id into scenario from public.scenarios where name='Pra-Tender' and is_active and workflow_model='OPERATIONAL_V2';
 if template.id is null or sa is null or head_id is null or scenario is null then raise exception 'Missing fixture'; end if;
 insert into public.projects select (jsonb_populate_record(null::public.projects,to_jsonb(template)||jsonb_build_object(
 'id',test_id,'name','PHASE42 ROLLBACK TEST','status','DRAFT','scenario_id',scenario,'current_scenario_id',scenario,'active_phase_id',null,'pic_id',sa,
 'selected_document_keys',(select coalesce(jsonb_agg(document_key),'[]'::jsonb) from public.output_document_stage_catalog where group_key='PRA_TENDER' and is_required),
 'is_postponed',false,'final_contract_value',null,'loss_reason',null,'phase_migration_state','LEGACY_REVIEW'))).*;
 select active_phase_id into pra from public.projects where id=test_id;
 perform public.sync_phase_output_scope(test_id,template.sales_id,array[]::text[]);
 update public.project_milestones set status='COMPLETED' where project_id=test_id;
 update public.project_output_documents set status='APPROVED' where project_id=test_id and (is_required or is_selected);
 update public.projects set status='ACTIVE' where id=test_id;
 update public.project_phases set status='COMPLETED',completed_at=now(),pic_id=sa where id=pra;
 select phase_id into tender from public.continue_project_tender_phase(test_id,template.sales_id,array[]::text[]);
 if (select pic_id from public.projects where id=test_id) is distinct from sa or (select pic_id from public.project_phases where id=tender) is distinct from sa then raise exception 'PIC was lost'; end if;
 if (select pic_id from public.project_phases where id=pra) is distinct from sa then raise exception 'Past PIC changed'; end if;
 if (select status from public.projects where id=test_id)<>'DRAFT' then raise exception 'Approval bypassed'; end if;
 perform public.continue_project_tender_phase(test_id,template.sales_id,array[]::text[]);
 if (select count(*) from public.project_phases where project_id=test_id)<>2 then raise exception 'Duplicate phase'; end if;
 update public.project_milestones set start_date=current_date,duration_working_days=1,due_date=current_date where phase_id=tender;
 insert into public.project_plan_approvals(id,project_id,phase_id,status,requested_by) values(approval,test_id,tender,'PENDING',template.sales_id);
 select pic_revision into rev from public.projects where id=test_id;
 select count(*) into assignment_count from public.project_assignments where project_id=test_id;
 begin
  perform public.review_project_plan_pic_atomic(test_id,approval,head_id,'APPROVED',null,head_id,rev,gen_random_uuid());raise exception 'Changed PIC in approval';
 exception when invalid_parameter_value then null; end;
 result:=public.review_project_plan_pic_atomic(test_id,approval,head_id,'APPROVED',null,sa,rev,gen_random_uuid());
 if result->>'project_status'<>'ACTIVE' or (select pic_id from public.projects where id=test_id) is distinct from sa then raise exception 'Approval failed'; end if;
 if (select count(*) from public.project_assignments where project_id=test_id)<>assignment_count then raise exception 'Duplicate assignment'; end if;
 if exists(select 1 from public.project_milestones m join public.workflow_stages w on w.id=m.workflow_stage_id where m.phase_id=tender and w.default_role='SA' and m.pic_id is distinct from sa) then raise exception 'Milestone PIC missing'; end if;
end $$;
rollback;
select 'PASS carry PIC, phase history, pending approval, retry, same-PIC approval and no duplicate assignments; rolled back';
