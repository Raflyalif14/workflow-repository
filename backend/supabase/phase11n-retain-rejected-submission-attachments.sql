-- Phase 11N: retain rejected milestone submission evidence as private history.
-- Existing attachment rows and storage objects are intentionally unchanged.

begin;

alter table public.milestone_submission_attachments
  drop constraint if exists milestone_submission_attachments_status_check;

alter table public.milestone_submission_attachments
  add constraint milestone_submission_attachments_status_check check (status in (
    'PENDING',
    'PROMOTING',
    'PROMOTED',
    'CLEANUP_PENDING',
    'CLEANUP_FAILED',
    'REJECTED'
  ));

commit;

-- Read-only verification after manual application:
-- select conname, pg_get_constraintdef(oid)
-- from pg_constraint
-- where conrelid = 'public.milestone_submission_attachments'::regclass
--   and conname = 'milestone_submission_attachments_status_check';
