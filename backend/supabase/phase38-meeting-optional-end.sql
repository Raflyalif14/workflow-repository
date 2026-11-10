-- Preserve existing meeting times; new requests may omit the end time.
begin;
alter table public.project_meetings alter column ends_at drop not null;
create or replace function public.mutate_project_meeting(p_project_id uuid,p_actor_id uuid,p_action text,p_payload jsonb,
 p_request_id uuid,p_meeting_id uuid default null,p_expected_revision integer default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare p public.projects%rowtype; u public.users%rowtype; m public.project_meetings%rowtype;
 receipt public.project_meeting_requests%rowtype; v_fingerprint jsonb; result jsonb;
begin
 select * into p from public.projects where id=p_project_id for update;
 if not found then raise exception 'Project unavailable' using errcode='42501'; end if;
 select * into u from public.users where id=p_actor_id and is_active and not coalesce(must_change_password,false) for share;
 if not found or not(u.role='HEAD_SA' or (u.role='SALES' and p.sales_id=u.id)) then raise exception 'Forbidden' using errcode='42501'; end if;
 if p_action not in ('CREATE','APPROVE','REJECT','CANCEL') or p_action is null or p_request_id is null
   or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'Invalid meeting request' using errcode='22023'; end if;
 v_fingerprint:=jsonb_build_object('action',p_action,'payload',p_payload,'meeting_id',p_meeting_id,'revision',p_expected_revision);
 select * into receipt from public.project_meeting_requests where project_id=p.id and request_id=p_request_id;
 if found then
   if receipt.actor_id<>u.id or receipt.fingerprint<>v_fingerprint then raise exception 'Request conflicts' using errcode='40001'; end if;
   return jsonb_build_object('meeting',receipt.result,'replayed',true);
 end if;
 if p_action='CREATE' then
   if u.role<>'SALES' then raise exception 'Only project Sales may request meetings' using errcode='42501'; end if;
   if p.is_postponed or p.status not in ('DRAFT','ACTIVE','WAITING_RESULT') then raise exception 'Project does not accept meetings' using errcode='55000'; end if;
   if not exists(select 1 from public.users where id=p.pic_id and role='SA' and is_active) then raise exception 'Project needs an active SA PIC' using errcode='55000'; end if;
   if nullif(p_payload->>'startsAt','') is null or (p_payload->>'startsAt')::timestamptz<=now() or (p_payload->>'endsAt')::timestamptz<=(p_payload->>'startsAt')::timestamptz
     or nullif(btrim(p_payload->>'title'),'') is null then raise exception 'Invalid meeting schedule' using errcode='22023'; end if;
   insert into public.project_meetings(project_id,title,agenda,location,starts_at,ends_at,requested_by)
   values(p.id,btrim(p_payload->>'title'),coalesce(p_payload->>'agenda',''),coalesce(p_payload->>'location',''),
     (p_payload->>'startsAt')::timestamptz,(p_payload->>'endsAt')::timestamptz,u.id) returning * into m;
 else
   select * into m from public.project_meetings where id=p_meeting_id and project_id=p.id for update;
   if not found then raise exception 'Meeting unavailable' using errcode='42501'; end if;
   if m.revision is distinct from p_expected_revision then raise exception 'Meeting changed' using errcode='40001'; end if;
   if p_action in ('APPROVE','REJECT') then
     if u.role<>'HEAD_SA' then raise exception 'Head SA approval required' using errcode='42501'; end if;
     if m.status<>'PENDING' then raise exception 'Meeting already reviewed' using errcode='55000'; end if;
     if p_action='APPROVE' and (m.starts_at<=now() or p.is_postponed or p.status not in ('DRAFT','ACTIVE','WAITING_RESULT')
       or not exists(select 1 from public.users where id=p.pic_id and role='SA' and is_active)) then
       raise exception 'Meeting or project is no longer ready' using errcode='55000'; end if;
     if p_action='REJECT' and nullif(btrim(p_payload->>'note'),'') is null then raise exception 'Rejection note required' using errcode='22023'; end if;
     update public.project_meetings set status=case when p_action='APPROVE' then 'APPROVED' else 'REJECTED' end,
       reviewed_by=u.id,review_note=nullif(btrim(p_payload->>'note'),''),reviewed_at=now(),revision=revision+1,updated_at=now() where id=m.id returning * into m;
   else
     if m.status not in ('PENDING','APPROVED') or (m.status='APPROVED' and m.starts_at<=now()) then raise exception 'Meeting cannot be cancelled' using errcode='55000'; end if;
     update public.project_meetings set status='CANCELLED',revision=revision+1,updated_at=now() where id=m.id returning * into m;
   end if;
 end if;
 insert into public.activity_logs(project_id,user_id,action,description)
 values(p.id,u.id,'MEETING_'||case when p_action='CREATE' then 'REQUESTED' when p_action='APPROVE' then 'APPROVED' when p_action='REJECT' then 'REJECTED' else 'CANCELLED' end,m.title);
 result:=to_jsonb(m);
 insert into public.project_meeting_requests(project_id,request_id,actor_id,fingerprint,result) values(p.id,p_request_id,u.id,v_fingerprint,result);
 return jsonb_build_object('meeting',result,'replayed',false);
end $$;
revoke all on function public.mutate_project_meeting(uuid,uuid,text,jsonb,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.mutate_project_meeting(uuid,uuid,text,jsonb,uuid,uuid,integer) to service_role;
notify pgrst,'reload schema';
commit;
