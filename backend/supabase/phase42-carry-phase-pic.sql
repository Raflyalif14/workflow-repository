begin;
do $patch$ declare definition text; begin
 definition:=pg_get_functiondef('public.continue_project_tender_phase(uuid,uuid,text[])'::regprocedure);
 definition:=replace(definition,chr(13),'');
 if position($old$insert into public.project_phases(project_id,scenario_id,phase_key)
    values(p_project_id,v_scenario,'ON_SUBMISSION_TENDER')$old$ in definition)=0 then raise exception 'Unexpected function definition: public.continue_project_tender_phase(uuid,uuid,text[])'; end if;
 definition:=replace(definition,$old$insert into public.project_phases(project_id,scenario_id,phase_key)
    values(p_project_id,v_scenario,'ON_SUBMISSION_TENDER')$old$,$new$insert into public.project_phases(project_id,scenario_id,phase_key,pic_id)
    values(p_project_id,v_scenario,'ON_SUBMISSION_TENDER',v_p.pic_id)$new$);
 if position($old$status = 'DRAFT',pic_id = null,$old$ in definition)=0 then raise exception 'Unexpected function definition: public.continue_project_tender_phase(uuid,uuid,text[])'; end if;
 definition:=replace(definition,$old$status = 'DRAFT',pic_id = null,$old$,$new$status = 'DRAFT',pic_id = v_p.pic_id,$new$);
 if position($old$'PIC_PHASE_RESET','PIC_PHASE_RESET'$old$ in definition)=0 then raise exception 'Unexpected function definition: public.continue_project_tender_phase(uuid,uuid,text[])'; end if;
 definition:=replace(definition,$old$'PIC_PHASE_RESET','PIC_PHASE_RESET'$old$,$new$'PIC_PHASE_CARRIED','PIC_PHASE_CARRIED'$new$);
 if position($old$'before',v_p.pic_id,'after',null$old$ in definition)=0 then raise exception 'Unexpected function definition: public.continue_project_tender_phase(uuid,uuid,text[])'; end if;
 definition:=replace(definition,$old$'before',v_p.pic_id,'after',null$old$,$new$'before',v_p.pic_id,'after',v_p.pic_id$new$);
 execute definition;
end $patch$;
do $patch$ declare definition text; begin
 definition:=pg_get_functiondef('public.review_project_plan_pic_atomic(uuid,uuid,uuid,text,text,uuid,bigint,uuid)'::regprocedure);
 definition:=replace(definition,chr(13),'');
 if position($old$or v_p.pic_id is not null then$old$ in definition)=0 then raise exception 'Unexpected function definition: public.review_project_plan_pic_atomic(uuid,uuid,uuid,text,text,uuid,bigint,uuid)'; end if;
 definition:=replace(definition,$old$or v_p.pic_id is not null then$old$,$new$or (v_p.pic_id is not null and v_p.pic_id is distinct from p_pic_id) then$new$);
 if position($old$if p_decision='APPROVED' then
      select id into v_history$old$ in definition)=0 then raise exception 'Unexpected function definition: public.review_project_plan_pic_atomic(uuid,uuid,uuid,text,text,uuid,bigint,uuid)'; end if;
 definition:=replace(definition,$old$if p_decision='APPROVED' then
      select id into v_history$old$,$new$if p_decision='APPROVED' and v_p.pic_id is null then
      select id into v_history$new$);
 if position($old$if p_decision='APPROVED' then
    if v_history is null$old$ in definition)=0 then raise exception 'Unexpected function definition: public.review_project_plan_pic_atomic(uuid,uuid,uuid,text,text,uuid,bigint,uuid)'; end if;
 definition:=replace(definition,$old$if p_decision='APPROVED' then
    if v_history is null$old$,$new$if p_decision='APPROVED' and v_p.pic_id is null then
    if v_history is null$new$);
 execute definition;
end $patch$;
do $patch$ declare definition text; begin
 definition:=pg_get_functiondef('public.review_project_phase_plan_phase24_core(uuid,uuid,uuid,text,text,uuid)'::regprocedure);
 definition:=replace(definition,chr(13),'');
 if position($old$if v_p.pic_id is not null or not exists$old$ in definition)=0 then raise exception 'Unexpected function definition: public.review_project_phase_plan_phase24_core(uuid,uuid,uuid,text,text,uuid)'; end if;
 definition:=replace(definition,$old$if v_p.pic_id is not null or not exists$old$,$new$if (v_p.pic_id is not null and v_p.pic_id is distinct from p_pic_id) or not exists$new$);
 if position($old$    insert into public.project_assignments(project_id,pic_id,assigned_by,previous_pic_id,assignment_type)
      values(p_project_id,p_pic_id,p_actor_id,null,'INITIAL_ASSIGNMENT');$old$ in definition)=0 then raise exception 'Unexpected function definition: public.review_project_phase_plan_phase24_core(uuid,uuid,uuid,text,text,uuid)'; end if;
 definition:=replace(definition,$old$    insert into public.project_assignments(project_id,pic_id,assigned_by,previous_pic_id,assignment_type)
      values(p_project_id,p_pic_id,p_actor_id,null,'INITIAL_ASSIGNMENT');$old$,$new$    if v_p.pic_id is null then
      insert into public.project_assignments(project_id,pic_id,assigned_by,previous_pic_id,assignment_type) values(p_project_id,p_pic_id,p_actor_id,null,'INITIAL_ASSIGNMENT');
    end if;$new$);
 execute definition;
end $patch$;
notify pgrst,'reload schema';
commit;
