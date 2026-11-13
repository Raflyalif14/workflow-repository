-- Apply after Phase 46. No Google calls occur during migration.
begin;
create table public.google_calendar_connections (
 user_id uuid primary key references public.users(id) on delete cascade,
 id uuid not null unique default gen_random_uuid(),
 refresh_token text not null, calendar_id text,
 calendar_creation_attempted boolean not null default false,
 status text not null default 'CONNECTED' check(status in ('CONNECTED','RECONNECT','DISCONNECTING')),
 last_synced_at timestamptz, last_error text,
 next_attempt_at timestamptz not null default now(),
 lease_id uuid, lease_until timestamptz,
 created_at timestamptz not null default now()
);
create table public.google_calendar_oauth (
 user_id uuid primary key references public.users(id) on delete cascade,
 state_hash text unique not null, verifier text not null,
 expires_at timestamptz not null
);
create table public.google_calendar_events (
 connection_id uuid not null references public.google_calendar_connections(id) on delete cascade,
 meeting_id uuid not null, -- retained after meeting/project deletion, so its Google copy can be removed
 event_id text not null, payload_hash text, deleted boolean not null default false,
 primary key(connection_id,meeting_id)
);
alter table public.google_calendar_connections enable row level security;
alter table public.google_calendar_oauth enable row level security;
alter table public.google_calendar_events enable row level security;
create policy google_connections_service on public.google_calendar_connections for all to service_role using(true) with check(true);
create policy google_oauth_service on public.google_calendar_oauth for all to service_role using(true) with check(true);
create policy google_events_service on public.google_calendar_events for all to service_role using(true) with check(true);
revoke all on public.google_calendar_connections,public.google_calendar_oauth,public.google_calendar_events from public,anon,authenticated;
grant all on public.google_calendar_connections,public.google_calendar_oauth,public.google_calendar_events to service_role;

create function public.claim_google_calendar_connection() returns setof public.google_calendar_connections
language sql security definer set search_path=pg_catalog as $$
 update public.google_calendar_connections c set lease_id=gen_random_uuid(),lease_until=now()+interval '3 minutes'
 where user_id=(select user_id from public.google_calendar_connections
  where status in ('CONNECTED','DISCONNECTING') and next_attempt_at<=now() and (lease_until is null or lease_until<now())
  order by next_attempt_at for update skip locked limit 1) returning c.*;
$$;
create function public.consume_google_calendar_oauth(p_user uuid,p_state text) returns setof public.google_calendar_oauth
language sql security definer set search_path=pg_catalog as $$
 delete from public.google_calendar_oauth where user_id=p_user and state_hash=p_state and expires_at>now() returning *;
$$;
create function public.google_calendar_meetings(p_user uuid)
returns table(id uuid,title text,agenda text,location text,starts_at timestamptz,ends_at timestamptz,project_id uuid,project_name text)
language sql stable security definer set search_path=pg_catalog as $$
 select m.id,m.title,m.agenda,m.location,m.starts_at,m.ends_at,p.id,p.name
 from public.project_meetings m join public.projects p on p.id=m.project_id join public.users u on u.id=p_user
 where u.is_active and not coalesce(u.must_change_password,false) and m.status='APPROVED'
 and (u.role='HEAD_SA' or u.role='SALES' and p.sales_id=u.id or u.role='SA' and p.pic_id=u.id);
$$;
revoke all on function public.claim_google_calendar_connection(),public.consume_google_calendar_oauth(uuid,text),public.google_calendar_meetings(uuid) from public,anon,authenticated;
grant execute on function public.claim_google_calendar_connection(),public.consume_google_calendar_oauth(uuid,text),public.google_calendar_meetings(uuid) to service_role;
notify pgrst,'reload schema';
commit;
