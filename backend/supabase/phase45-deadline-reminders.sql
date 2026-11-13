-- H-1 reminders. Apply after Phase 44. No historical reminders are backfilled.
begin;
create table public.deadline_reminder_receipts (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 milestone_id uuid not null references public.project_milestones(id) on delete cascade,
 output_id uuid references public.project_output_documents(id) on delete cascade,
 user_id uuid not null references public.users(id) on delete cascade,
 task_key text not null,
 due_date date not null,
 created_at timestamptz not null default now(),
 unique(task_key,user_id,due_date)
);
create table public.deadline_reminder_emails (
 notification_id uuid primary key references public.notifications(id) on delete cascade,
 receipt_id uuid not null references public.deadline_reminder_receipts(id) on delete cascade,
 status text not null default 'PENDING' check(status in ('PENDING','SENDING','SENT','FAILED','SKIPPED')),
 attempt_count integer not null default 0,
 next_attempt_at timestamptz not null default now(),
 lease_token uuid,
 sent_at timestamptz,
 last_error text
);
create index deadline_reminder_emails_due on public.deadline_reminder_emails(next_attempt_at)
 where status in ('PENDING','SENDING');
alter table public.deadline_reminder_receipts enable row level security;
alter table public.deadline_reminder_emails enable row level security;
create policy deadline_reminder_receipts_service on public.deadline_reminder_receipts
 for all to service_role using(true) with check(true);
create policy deadline_reminder_emails_service on public.deadline_reminder_emails
 for all to service_role using(true) with check(true);
revoke all on public.deadline_reminder_receipts,public.deadline_reminder_emails from public,anon,authenticated;
grant select,insert,update,delete on public.deadline_reminder_receipts,public.deadline_reminder_emails to service_role;

-- Shared by generation and email claiming so reschedules, reassignments, and completion
-- invalidate unsent emails. Date-only deadlines use the business timezone.
create function public.due_tomorrow_sa_tasks()
returns table(project_id uuid,milestone_id uuid,output_id uuid,user_id uuid,task_key text,
 due_date date,task_name text,project_name text,language text,email text,in_app_visible boolean,telegram_eligible boolean)
language sql stable security definer set search_path=pg_catalog as $$
 select p.id,m.id,d.id,u.id,
   case when d.id is null then 'milestone:'||m.id::text else 'output:'||d.id::text end,
   coalesce(d.due_date,m.due_date),coalesce(d.title,m.name),p.name,u.preferred_language,u.email,
   coalesce(n.in_app_enabled,true),coalesce(n.telegram_enabled,false) and n.telegram_chat_id is not null
 from public.projects p
 join public.project_milestones m on m.project_id=p.id and m.phase_id is not distinct from p.active_phase_id
 join public.workflow_stages s on s.id=m.workflow_stage_id and s.default_role='SA'
 join public.users u on u.id=coalesce(m.pic_id,p.pic_id) and u.role='SA' and u.is_active
 left join public.notification_preferences n on n.user_id=u.id
 left join public.project_output_documents d on d.milestone_id=m.id and d.project_id=p.id
   and d.phase_id is not distinct from p.active_phase_id and (d.is_required or d.is_selected)
 where p.status='ACTIVE' and not coalesce(p.is_postponed,false)
   and m.status in ('CREATED','PENDING','TRIGGERED','IN_PROGRESS','REJECTED')
   and (d.id is null or d.status in ('TO_DO','DRAFT','REVISION_REQUIRED'))
   and coalesce(d.due_date,m.due_date)=(now() at time zone 'Asia/Jakarta')::date+1;
$$;

create function public.enqueue_deadline_reminders() returns integer
language plpgsql security definer set search_path=pg_catalog as $$
declare task record; receipt uuid; notification uuid; total integer:=0; title text; message text;
begin
 for task in select * from public.due_tomorrow_sa_tasks() loop
  receipt:=null;
  insert into public.deadline_reminder_receipts(project_id,milestone_id,output_id,user_id,task_key,due_date)
   values(task.project_id,task.milestone_id,task.output_id,task.user_id,task.task_key,task.due_date)
   on conflict(task_key,user_id,due_date) do nothing returning id into receipt;
  if receipt is null then continue; end if;
  title:=case when task.language='id' then 'Deadline besok' else 'Deadline tomorrow' end;
  message:=case when task.language='id'
    then format('Deadline %s pada project %s adalah besok (%s).',task.task_name,task.project_name,task.due_date)
    else format('%s in project %s is due tomorrow (%s).',task.task_name,task.project_name,task.due_date) end;
  insert into public.notifications(user_id,type,title,message,project_id,milestone_id,action_url,in_app_visible)
   values(task.user_id,'DEADLINE_REMINDER_H1',title,message,task.project_id,task.milestone_id,
     '/projects/'||task.project_id::text||'#project-milestone-'||task.milestone_id::text,task.in_app_visible)
   returning id into notification;
  if task.telegram_eligible then
   insert into public.notification_deliveries(notification_id,channel,status,failure_kind,next_retry_at,attempt_count)
    values(notification,'TELEGRAM','FAILED','RETRYABLE',now(),0);
  end if;
  insert into public.deadline_reminder_emails(notification_id,receipt_id) values(notification,receipt);
  total:=total+1;
 end loop;
 return total;
end $$;

create function public.claim_deadline_reminder_emails(p_limit integer default 20)
returns table(notification_id uuid,lease_token uuid,attempt_count integer,email text,title text,message text,action_url text)
language plpgsql security definer set search_path=pg_catalog as $$
begin
 -- Stop stale or exhausted deliveries, including processes that crashed on their final attempt.
 update public.deadline_reminder_emails e set status='SKIPPED',lease_token=null,last_error='Reminder no longer applicable.'
 where e.status in ('PENDING','SENDING') and e.next_attempt_at<=now() and not exists(
  select 1 from public.deadline_reminder_receipts r join public.due_tomorrow_sa_tasks() t
   on t.task_key=r.task_key and t.user_id=r.user_id and t.due_date=r.due_date
  where r.id=e.receipt_id);
 update public.deadline_reminder_emails e set status='FAILED',lease_token=null,last_error='Email attempt limit reached.'
 where e.status in ('PENDING','SENDING') and e.next_attempt_at<=now() and e.attempt_count>=3;
 return query
 with candidates as (
  select e.notification_id from public.deadline_reminder_emails e
  where e.status in ('PENDING','SENDING') and e.next_attempt_at<=now() and e.attempt_count<3
  order by e.next_attempt_at,e.notification_id limit greatest(1,least(coalesce(p_limit,20),100))
  for update skip locked
 ), claimed as (
  update public.deadline_reminder_emails e set status='SENDING',attempt_count=e.attempt_count+1,
   lease_token=gen_random_uuid(),next_attempt_at=now()+interval '5 minutes'
  from candidates c where e.notification_id=c.notification_id returning e.*
 ) select c.notification_id,c.lease_token,c.attempt_count,u.email,n.title,n.message,n.action_url
 from claimed c join public.notifications n on n.id=c.notification_id join public.users u on u.id=n.user_id;
end $$;

revoke all on function public.due_tomorrow_sa_tasks(),public.enqueue_deadline_reminders(),public.claim_deadline_reminder_emails(integer)
 from public,anon,authenticated;
grant execute on function public.due_tomorrow_sa_tasks(),public.enqueue_deadline_reminders(),public.claim_deadline_reminder_emails(integer) to service_role;
commit;
