-- Phase 10A Revision - one project-plan approval governs the initial DRAFT timeline.
-- Run this manually in the Supabase SQL Editor before enabling the new plan endpoints.

create table if not exists public.project_plan_approvals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  requested_by uuid not null references public.users(id),
  status text not null check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  request_note text null,
  reviewed_by uuid null references public.users(id),
  review_note text null,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_project_plan_approvals_one_pending_per_project
on public.project_plan_approvals (project_id)
where status = 'PENDING';

create index if not exists project_plan_approvals_project_submitted_idx
on public.project_plan_approvals (project_id, submitted_at desc);
