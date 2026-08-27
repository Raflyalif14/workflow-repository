create table if not exists public.scenarios (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workflow_stages (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.scenarios(id) on delete cascade,
  name text not null,
  description text,
  step_order integer not null check (step_order > 0),
  default_role text not null check (default_role in ('SUPER_ADMIN', 'SALES', 'HEAD_SA', 'SA')),
  default_duration_working_days integer not null default 0 check (default_duration_working_days >= 0),
  is_required boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scenario_id, step_order)
);

create index if not exists workflow_stages_scenario_order_idx on public.workflow_stages(scenario_id, step_order);
create index if not exists scenarios_active_idx on public.scenarios(is_active);

create or replace function public.set_phase2_updated_at()
returns trigger language plpgsql security invoker set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists scenarios_set_updated_at on public.scenarios;
create trigger scenarios_set_updated_at before update on public.scenarios for each row execute function public.set_phase2_updated_at();
drop trigger if exists workflow_stages_set_updated_at on public.workflow_stages;
create trigger workflow_stages_set_updated_at before update on public.workflow_stages for each row execute function public.set_phase2_updated_at();

alter table public.scenarios enable row level security;
alter table public.workflow_stages enable row level security;
drop policy if exists scenarios_service_role_only on public.scenarios;
create policy scenarios_service_role_only on public.scenarios for all to service_role using (true) with check (true);
drop policy if exists workflow_stages_service_role_only on public.workflow_stages;
create policy workflow_stages_service_role_only on public.workflow_stages for all to service_role using (true) with check (true);

insert into public.scenarios (name, description) values
  ('Existing TOR', 'Workflow untuk project Existing TOR'),
  ('Assessment', 'Workflow untuk project assessment')
on conflict (name) do update set description = excluded.description;

with scenario_data as (
  select id, name from public.scenarios where name in ('Existing TOR', 'Assessment')
), seed_stage as (
  select * from (values
    ('Existing TOR', 1, 'Create Project', 'Membuat project baru', 'SALES'),
    ('Existing TOR', 2, 'Set Deadline', 'Menentukan deadline project', 'SALES'),
    ('Existing TOR', 3, 'MoM', 'Menyusun minutes of meeting', 'SALES'),
    ('Existing TOR', 4, 'Handover Project to SA', 'Serah terima project ke SA', 'SALES'),
    ('Existing TOR', 5, 'Assign PIC', 'Menentukan PIC project', 'HEAD_SA'),
    ('Existing TOR', 6, 'Requirement Gathering', 'Mengumpulkan kebutuhan', 'SA'),
    ('Existing TOR', 7, 'Pain Point Analysis', 'Menganalisis pain point', 'SA'),
    ('Existing TOR', 8, 'Proposal Solution', 'Menyusun proposal solusi', 'SA'),
    ('Existing TOR', 9, 'Deliverables', 'Menentukan deliverables', 'SA'),
    ('Existing TOR', 10, 'Technical Proposal & BOQ', 'Menyusun technical proposal dan BOQ', 'SA'),
    ('Existing TOR', 11, 'Tender Process', 'Menjalankan proses tender', 'SALES'),
    ('Assessment', 1, 'Create Project', 'Membuat project baru', 'SALES'),
    ('Assessment', 2, 'Set Deadline', 'Menentukan deadline project', 'SALES'),
    ('Assessment', 3, 'MoM', 'Menyusun minutes of meeting', 'SALES'),
    ('Assessment', 4, 'Handover Project to SA', 'Serah terima project ke SA', 'SALES'),
    ('Assessment', 5, 'Assign PIC', 'Menentukan PIC project', 'HEAD_SA'),
    ('Assessment', 6, 'Customer Assessment', 'Assessment kebutuhan customer', 'SA'),
    ('Assessment', 7, 'Assessment Report', 'Menyusun laporan assessment', 'SA'),
    ('Assessment', 8, 'Requirement Gathering', 'Mengumpulkan kebutuhan', 'SA'),
    ('Assessment', 9, 'Pain Point Analysis', 'Menganalisis pain point', 'SA'),
    ('Assessment', 10, 'Proposal Solution', 'Menyusun proposal solusi', 'SA'),
    ('Assessment', 11, 'Deliverables', 'Menentukan deliverables', 'SA'),
    ('Assessment', 12, 'Technical Proposal & BOQ', 'Menyusun technical proposal dan BOQ', 'SA'),
    ('Assessment', 13, 'Tender Process', 'Menjalankan proses tender', 'SALES')
  ) as values(scenario_name, step_order, name, description, default_role)
)
insert into public.workflow_stages (scenario_id, name, description, step_order, default_role)
select s.id, seed.name, seed.description, seed.step_order, seed.default_role
from seed_stage seed join scenario_data s on s.name = seed.scenario_name
on conflict (scenario_id, step_order) do update set
  name = excluded.name, description = excluded.description, default_role = excluded.default_role, is_active = true;
