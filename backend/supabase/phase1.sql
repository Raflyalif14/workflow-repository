create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  role text not null default 'SA' check (role in ('SUPER_ADMIN', 'SALES', 'HEAD_SA', 'SA')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_users_updated_at()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at before update on public.users
for each row execute function public.set_users_updated_at();

alter table public.users enable row level security;
drop policy if exists users_service_role_only on public.users;
create policy users_service_role_only on public.users
for all to service_role using (true) with check (true);

insert into public.users (id, email, full_name, role)
select id, coalesce(email, ''), coalesce(raw_user_meta_data->>'full_name', email, 'User'), 'SA'
from auth.users
on conflict (id) do nothing;
