-- Preserve existing meeting times; new requests may omit the end time.
begin;
alter table public.project_meetings add column proposed_schedule jsonb;
alter table public.project_meetings add constraint proposed_schedule_object check(proposed_schedule is null or (jsonb_typeof(proposed_schedule)='object' and status='APPROVED'));
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
 if p_action not in ('CREATE','APPROVE','REJECT','CANCEL','RESCHEDULE','APPROVE_RESCHEDULE','REJECT_RESCHEDULE') or p_action is null or p_request_id is null
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
   if p_action='RESCHEDULE' then
     if u.role<>'SALES' then raise exception 'Only Sales may reschedule' using errcode='42501'; end if;
     if m.status<>'APPROVED' or m.starts_at<=now() or m.proposed_schedule is not null or p.is_postponed or p.status not in ('DRAFT','ACTIVE','WAITING_RESULT')
       or not exists(select 1 from public.users where id=p.pic_id and role='SA' and is_active) then raise exception 'Meeting cannot be rescheduled' using errcode='55000'; end if;
     if nullif(p_payload->>'startsAt','') is null or (p_payload->>'startsAt')::timestamptz<=now()
       or (p_payload->>'endsAt')::timestamptz<=(p_payload->>'startsAt')::timestamptz
       or ((p_payload->>'startsAt')::timestamptz=m.starts_at and (p_payload->>'endsAt')::timestamptz is not distinct from m.ends_at)
       or length(btrim(coalesce(p_payload->>'title',''))) not between 2 and 150
       or length(coalesce(p_payload->>'agenda',''))>3000 or length(coalesce(p_payload->>'location',''))>1000
       then raise exception 'Invalid proposed schedule' using errcode='22023'; end if;
     update public.project_meetings set proposed_schedule=p_payload,revision=revision+1,updated_at=now() where id=m.id returning * into m;
   elsif p_action in ('APPROVE_RESCHEDULE','REJECT_RESCHEDULE') then
     if u.role<>'HEAD_SA' then raise exception 'Head SA approval required' using errcode='42501'; end if;
     if m.status<>'APPROVED' or m.proposed_schedule is null then raise exception 'No pending reschedule' using errcode='55000'; end if;
     if p_action='REJECT_RESCHEDULE' and nullif(btrim(p_payload->>'note'),'') is null then raise exception 'Reason required' using errcode='22023'; end if;
     if p_action='APPROVE_RESCHEDULE' then
       if (m.proposed_schedule->>'startsAt')::timestamptz<=now() or p.is_postponed or p.status not in ('DRAFT','ACTIVE','WAITING_RESULT')
         or not exists(select 1 from public.users where id=p.pic_id and role='SA' and is_active) then raise exception 'Schedule no longer ready' using errcode='55000'; end if;
     end if;
     update public.project_meetings set title=case when p_action='APPROVE_RESCHEDULE' then btrim(m.proposed_schedule->>'title') else title end,agenda=case when p_action='APPROVE_RESCHEDULE' then coalesce(m.proposed_schedule->>'agenda','') else agenda end,location=case when p_action='APPROVE_RESCHEDULE' then coalesce(m.proposed_schedule->>'location','') else location end,starts_at=case when p_action='APPROVE_RESCHEDULE' then (m.proposed_schedule->>'startsAt')::timestamptz else starts_at end,ends_at=case when p_action='APPROVE_RESCHEDULE' then (m.proposed_schedule->>'endsAt')::timestamptz else ends_at end,proposed_schedule=null,reviewed_by=u.id,review_note=nullif(btrim(p_payload->>'note'),''),reviewed_at=now(),revision=revision+1,updated_at=now() where id=m.id returning * into m;
   elsif p_action in ('APPROVE','REJECT') then
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
     update public.project_meetings set status='CANCELLED',proposed_schedule=null,revision=revision+1,updated_at=now() where id=m.id returning * into m;
   end if;
 end if;
 insert into public.activity_logs(project_id,user_id,action,description)
 values(p.id,u.id,'MEETING_'||case when p_action='CREATE' then 'REQUESTED' when p_action='APPROVE' then 'APPROVED' when p_action='REJECT' then 'REJECTED' when p_action='CANCEL' then 'CANCELLED' else p_action end,m.title);
 result:=to_jsonb(m);
 insert into public.project_meeting_requests(project_id,request_id,actor_id,fingerprint,result) values(p.id,p_request_id,u.id,v_fingerprint,result);
 return jsonb_build_object('meeting',result,'replayed',false);
end $$;
revoke all on function public.mutate_project_meeting(uuid,uuid,text,jsonb,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.mutate_project_meeting(uuid,uuid,text,jsonb,uuid,uuid,integer) to service_role;
create or replace function public.notify_project_meeting() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare p public.projects%rowtype; recipient record; v_type text; v_title text; v_reschedule boolean:=false; v_requested boolean;
begin
 if TG_OP='UPDATE' and new.status is not distinct from old.status then
  if new.proposed_schedule is not distinct from old.proposed_schedule then return new; end if;
  v_reschedule:=true;
 end if;
 v_requested:=new.status='PENDING' or (v_reschedule and new.proposed_schedule is not null);
 select * into p from public.projects where id=new.project_id;
 v_type:='MEETING_'||case when new.status='PENDING' then 'REQUESTED' else new.status end;
 for recipient in
  select u.id,u.preferred_language,coalesce(n.in_app_enabled,true) visible from public.users u
  left join public.notification_preferences n on n.user_id=u.id
  where u.is_active and (
   (v_requested and u.role='HEAD_SA') or
   (not v_requested and new.status in ('APPROVED','REJECTED') and u.id in (p.sales_id,p.pic_id)) or
   (new.status='CANCELLED' and (u.id in (p.sales_id,p.pic_id) or u.role='HEAD_SA')))
 loop
  v_title:=case when recipient.preferred_language='id' then
   case new.status when 'PENDING' then 'Pengajuan meeting baru' when 'APPROVED' then 'Meeting disetujui' when 'REJECTED' then 'Meeting ditolak' else 'Meeting dibatalkan' end
  else case new.status when 'PENDING' then 'New meeting request' when 'APPROVED' then 'Meeting approved' when 'REJECTED' then 'Meeting rejected' else 'Meeting cancelled' end end;
  if v_reschedule then
   v_type:='MEETING_RESCHEDULE';
   v_title:=case when recipient.preferred_language='id' then case when v_requested then 'Pengajuan reschedule meeting' when new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at then 'Reschedule meeting disetujui' else 'Reschedule meeting ditolak' end else case when v_requested then 'Meeting reschedule requested' when new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at then 'Meeting reschedule approved' else 'Meeting reschedule rejected' end end;
  end if;
  insert into public.notifications(user_id,type,title,message,project_id,action_url,in_app_visible)
  values(recipient.id,v_type,v_title,new.title||' — '||p.name||case when new.status='REJECTED' and new.review_note is not null then ': '||new.review_note else '' end,
   p.id,'/projects/'||p.id::text||'#project-meetings',recipient.visible);
 end loop;
 return new;
end $$;
revoke all on function public.notify_project_meeting() from public,anon,authenticated,service_role;
drop trigger project_meeting_notifications on public.project_meetings;
create trigger project_meeting_notifications after insert or update of status,proposed_schedule on public.project_meetings for each row execute function public.notify_project_meeting();
notify pgrst,'reload schema';
commit;
