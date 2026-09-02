-- Phase 11B: prevent concurrent milestone submissions from creating more than
-- one active review request for the same milestone.
--
-- Before applying, inspect and resolve duplicate existing PENDING rows manually:
-- select milestone_id, count(*)
-- from public.milestone_approvals
-- where status = 'PENDING'
-- group by milestone_id
-- having count(*) > 1;
--
-- This migration intentionally does not delete or rewrite existing approval data.

create unique index if not exists uq_milestone_approvals_one_pending_per_milestone
on public.milestone_approvals (milestone_id)
where status = 'PENDING';
