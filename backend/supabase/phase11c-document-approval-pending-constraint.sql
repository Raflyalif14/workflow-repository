-- Phase 11C: one active HEAD_SA review request per document version.
--
-- Before applying, inspect and resolve duplicate existing PENDING rows manually:
-- select document_version_id, count(*) as pending_count
-- from public.document_version_approvals
-- where status = 'PENDING'
-- group by document_version_id
-- having count(*) > 1;
--
-- This migration intentionally does not delete or rewrite historical approval data.

create unique index if not exists uq_document_version_approvals_one_pending_per_version
on public.document_version_approvals (document_version_id)
where status = 'PENDING';
