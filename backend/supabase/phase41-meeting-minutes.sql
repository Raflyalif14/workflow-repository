begin;
alter table public.project_meetings add column minutes jsonb;
alter table public.project_meetings add column minutes_updated_at timestamptz;
alter table public.project_meetings add column minutes_updated_by uuid references public.users(id);
alter table public.project_meetings add constraint meeting_minutes_object check(minutes is null or jsonb_typeof(minutes)='object');
create function public.save_project_meeting_minutes(p_project_id uuid,p_meeting_id uuid,p_actor_id uuid,p_payload jsonb,p_request_id uuid,p_expected_revision integer) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare p public.projects%rowtype; m public.project_meetings%rowtype; u public.users%rowtype; receipt public.project_meeting_requests%rowtype; fingerprint jsonb; result jsonb;
begin
 select * into p from public.projects where id=p_project_id for update;
 if not found then raise exception 'Project unavailable' using errcode='42501'; end if;
 select * into u from public.users where id=p_actor_id and is_active and not coalesce(must_change_password,false) for share;
 if not found or not(u.role='HEAD_SA' or (u.role='SALES' and p.sales_id=u.id) or (u.role='SA' and p.pic_id=u.id)) then raise exception 'Forbidden' using errcode='42501'; end if;
 if p_request_id is null or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'Invalid request' using errcode='22023'; end if;
 fingerprint:=jsonb_build_object('action','SAVE_MINUTES','meeting_id',p_meeting_id,'revision',p_expected_revision,'payload',p_payload);
 select * into receipt from public.project_meeting_requests where project_id=p.id and request_id=p_request_id;
 if found then
  if receipt.actor_id<>u.id or receipt.fingerprint<>fingerprint then raise exception 'Request conflicts' using errcode='40001'; end if;
  return jsonb_build_object('meeting',receipt.result,'replayed',true);
 end if;
 select * into m from public.project_meetings where id=p_meeting_id and project_id=p.id for update;
 if not found then raise exception 'Meeting unavailable' using errcode='42501'; end if;
 if m.revision is distinct from p_expected_revision then raise exception 'Meeting changed' using errcode='40001'; end if;
 if m.status<>'APPROVED' or coalesce(m.ends_at,m.starts_at)>now() or m.proposed_schedule is not null then raise exception 'Meeting not ready for minutes' using errcode='55000'; end if;
 if (p_payload->'completed') is distinct from 'true'::jsonb or jsonb_typeof(p_payload->'notes') is distinct from 'string'
  or length(btrim(coalesce(p_payload->>'notes',''))) not between 1 and 10000
  or jsonb_typeof(p_payload->'decisions') is distinct from 'string' or length(p_payload->>'decisions')>10000
  or jsonb_typeof(p_payload->'followUp') is distinct from 'string' or length(p_payload->>'followUp')>10000 then raise exception 'Invalid minutes' using errcode='22023'; end if;
 update public.project_meetings set minutes=jsonb_build_object('notes',btrim(p_payload->>'notes'),'decisions',btrim(p_payload->>'decisions'),'followUp',btrim(p_payload->>'followUp')),
 minutes_updated_at=now(),minutes_updated_by=u.id,revision=revision+1,updated_at=now() where id=m.id returning * into m;
 insert into public.activity_logs(project_id,user_id,action,description) values(p.id,u.id,'MEETING_MINUTES_SAVED',m.title);
 result:=to_jsonb(m);
 insert into public.project_meeting_requests(project_id,request_id,actor_id,fingerprint,result) values(p.id,p_request_id,u.id,fingerprint,result);
 return jsonb_build_object('meeting',result,'replayed',false);
end $$;
revoke all on function public.save_project_meeting_minutes(uuid,uuid,uuid,jsonb,uuid,integer) from public,anon,authenticated;
grant execute on function public.save_project_meeting_minutes(uuid,uuid,uuid,jsonb,uuid,integer) to service_role;
notify pgrst,'reload schema';
commit;
