create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  customer text not null,
  scenario_id uuid not null references public.scenarios(id) on delete restrict,
  sales_id uuid not null references public.users(id) on delete restrict,
  status text not null default 'ACTIVE' check (status in ('DRAFT', 'ACTIVE', 'POSTPONED', 'COMPLETED', 'CANCELLED')),
  is_postponed boolean not null default false,
  postponed_at timestamptz,
  postponed_by uuid references public.users(id) on delete set null,
  postpone_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_scenario_idx on public.projects(scenario_id);
create index if not exists projects_sales_idx on public.projects(sales_id);
create index if not exists projects_status_idx on public.projects(status);
create index if not exists projects_created_at_idx on public.projects(created_at desc);

create or replace function public.set_phase3_updated_at()
returns trigger language plpgsql security invoker set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at before update on public.projects
for each row execute function public.set_phase3_updated_at();

alter table public.projects enable row level security;
drop policy if exists projects_service_role_only on public.projects;
create policy projects_service_role_only on public.projects
for all to service_role using (true) with check (true);
