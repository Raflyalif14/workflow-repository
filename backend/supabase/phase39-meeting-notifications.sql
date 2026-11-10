begin;
create function public.notify_project_meeting() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare p public.projects%rowtype; recipient record; v_type text; v_title text;
begin
 if TG_OP='UPDATE' and new.status is not distinct from old.status then return new; end if;
 select * into p from public.projects where id=new.project_id;
 v_type:='MEETING_'||case when new.status='PENDING' then 'REQUESTED' else new.status end;
 for recipient in
  select u.id,u.preferred_language,coalesce(n.in_app_enabled,true) visible from public.users u
  left join public.notification_preferences n on n.user_id=u.id
  where u.is_active and (
   (new.status='PENDING' and u.role='HEAD_SA') or
   (new.status in ('APPROVED','REJECTED') and u.id in (p.sales_id,p.pic_id)) or
   (new.status='CANCELLED' and (u.id in (p.sales_id,p.pic_id) or u.role='HEAD_SA')))
 loop
  v_title:=case when recipient.preferred_language='id' then
   case new.status when 'PENDING' then 'Pengajuan meeting baru' when 'APPROVED' then 'Meeting disetujui' when 'REJECTED' then 'Meeting ditolak' else 'Meeting dibatalkan' end
  else case new.status when 'PENDING' then 'New meeting request' when 'APPROVED' then 'Meeting approved' when 'REJECTED' then 'Meeting rejected' else 'Meeting cancelled' end end;
  insert into public.notifications(user_id,type,title,message,project_id,action_url,in_app_visible)
  values(recipient.id,v_type,v_title,new.title||' — '||p.name||case when new.status='REJECTED' and new.review_note is not null then ': '||new.review_note else '' end,
   p.id,'/projects/'||p.id::text||'#project-meetings',recipient.visible);
 end loop;
 return new;
end $$;
revoke all on function public.notify_project_meeting() from public,anon,authenticated,service_role;
create trigger project_meeting_notifications after insert or update of status on public.project_meetings
 for each row execute function public.notify_project_meeting();
commit;
