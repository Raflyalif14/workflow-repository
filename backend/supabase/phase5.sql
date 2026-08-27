alter table public.projects add column if not exists pic_id uuid;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'projects_pic_id_fkey') then
    alter table public.projects add constraint projects_pic_id_fkey foreign key (pic_id) references public.users(id) on delete set null;
  end if;
end $$;

alter table public.project_milestones add column if not exists pic_id uuid;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'project_milestones_pic_id_fkey') then
    alter table public.project_milestones add constraint project_milestones_pic_id_fkey foreign key (pic_id) references public.users(id) on delete set null;
  end if;
end $$;

create index if not exists projects_pic_idx on public.projects(pic_id);
create index if not exists project_milestones_pic_idx on public.project_milestones(pic_id);

create table if not exists public.project_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  pic_id uuid not null references public.users(id) on delete restrict,
  assigned_by uuid not null references public.users(id) on delete restrict,
  previous_pic_id uuid references public.users(id) on delete set null,
  assignment_type text not null check (assignment_type in ('INITIAL_ASSIGNMENT', 'REASSIGNMENT')),
  reason text,
  constraint project_assignments_reassignment_reason_check check (
    assignment_type <> 'REASSIGNMENT' or nullif(btrim(reason), '') is not null
  ),
  created_at timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'project_assignments_reassignment_reason_check') then
    alter table public.project_assignments add constraint project_assignments_reassignment_reason_check
    check (assignment_type <> 'REASSIGNMENT' or nullif(btrim(reason), '') is not null);
  end if;
end $$;

create index if not exists project_assignments_project_idx on public.project_assignments(project_id, created_at desc);
create index if not exists project_assignments_pic_idx on public.project_assignments(pic_id);
create index if not exists project_assignments_assigned_by_idx on public.project_assignments(assigned_by);
create index if not exists project_assignments_previous_pic_idx on public.project_assignments(previous_pic_id);

alter table public.project_assignments enable row level security;
drop policy if exists project_assignments_service_role_only on public.project_assignments;
create policy project_assignments_service_role_only on public.project_assignments
for all to service_role using (true) with check (true);
