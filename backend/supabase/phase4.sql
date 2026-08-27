create table if not exists public.project_milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  workflow_stage_id uuid not null references public.workflow_stages(id) on delete restrict,
  name text not null,
  description text,
  step_order integer not null check (step_order > 0),
  status text not null default 'PENDING' check (status in ('PENDING', 'TRIGGERED', 'IN_PROGRESS', 'SUBMITTED', 'APPROVAL', 'APPROVED', 'COMPLETED', 'REJECTED', 'POSTPONED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, workflow_stage_id)
);

create index if not exists project_milestones_project_idx on public.project_milestones(project_id);
create index if not exists project_milestones_stage_idx on public.project_milestones(workflow_stage_id);
create index if not exists project_milestones_status_idx on public.project_milestones(status);

create or replace function public.set_phase4_updated_at()
returns trigger language plpgsql security invoker set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists project_milestones_set_updated_at on public.project_milestones;
create trigger project_milestones_set_updated_at before update on public.project_milestones
for each row execute function public.set_phase4_updated_at();

alter table public.project_milestones enable row level security;
drop policy if exists project_milestones_service_role_only on public.project_milestones;
create policy project_milestones_service_role_only on public.project_milestones
for all to service_role using (true) with check (true);