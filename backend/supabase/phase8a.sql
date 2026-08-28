-- Phase 8A - Revised Deadline Change Approval Flow
-- Ensures one active deadline approval request per milestone.
--
-- If this index fails because duplicate PENDING rows already exist, inspect them first:
-- select milestone_id, count(*)
-- from public.milestone_deadline_approvals
-- where status = 'PENDING'
-- group by milestone_id
-- having count(*) > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_milestone_deadline_approvals_one_pending_per_milestone
ON public.milestone_deadline_approvals (milestone_id)
WHERE status = 'PENDING';
