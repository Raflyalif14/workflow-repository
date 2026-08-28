-- Phase 8B - Automatic Next Milestone + Project Completion
-- Adds completion timestamp support for project milestone workflow execution state.

alter table public.project_milestones
add column if not exists completed_at timestamptz;

create index if not exists project_milestones_completed_at_idx
on public.project_milestones(completed_at);
