-- TEST ONLY: tables/columns referenced by later migrations but with no original
-- CREATE script in this checkout. Keep the reconstruction explicit.
alter table public.projects add column estimated_revenue numeric(18,2) default 0;
alter table public.project_milestones add column start_date date,
  add column duration_working_days integer,add column due_date date;
-- Runtime uses CREATED (Phase19/24/31); its original status expansion is absent.
alter table public.project_milestones drop constraint project_milestones_status_check;
alter table public.project_milestones add constraint project_milestones_status_check check
  (status in ('CREATED','PENDING','TRIGGERED','IN_PROGRESS','SUBMITTED','APPROVAL','APPROVED','COMPLETED','REJECTED','POSTPONED'));
create table public.activity_logs(id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  milestone_id uuid references public.project_milestones(id) on delete cascade,
  user_id uuid references public.users(id),action text not null,description text,
  created_at timestamptz not null default now());
create table public.milestone_approvals(id uuid primary key default gen_random_uuid(),
  milestone_id uuid references public.project_milestones(id) on delete cascade,
  status text default 'PENDING',requested_by uuid references public.users(id),
  reviewed_by uuid references public.users(id),review_note text,created_at timestamptz default now());
create table public.milestone_deadline_history(id uuid primary key default gen_random_uuid(),
  milestone_id uuid references public.project_milestones(id) on delete cascade,
  start_date date,duration_working_days integer,due_date date,
  changed_by uuid references public.users(id),change_reason text,created_at timestamptz default now());
create table public.milestone_deadline_approvals(id uuid primary key default gen_random_uuid(),
  milestone_id uuid references public.project_milestones(id) on delete cascade,
  deadline_history_id uuid references public.milestone_deadline_history(id),
  status text default 'PENDING',requested_by uuid references public.users(id),
  reviewed_by uuid references public.users(id),review_note text,
  requested_at timestamptz default now(),reviewed_at timestamptz);
