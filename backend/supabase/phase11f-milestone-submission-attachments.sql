-- Phase 11F: pending attachments for milestone submission review.
--
-- These tables intentionally remain separate from public.documents. Files become
-- official documents only after the corresponding milestone submission is approved.

create table if not exists public.milestone_submission_packages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  milestone_id uuid not null references public.project_milestones(id),
  milestone_approval_id uuid null references public.milestone_approvals(id),
  submitted_by uuid not null references public.users(id),
  status text not null default 'STAGING',
  attachment_count integer not null default 0 check (attachment_count >= 0),
  cleanup_status text not null default 'NOT_REQUIRED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint milestone_submission_packages_status_check check (status in (
    'STAGING',
    'PENDING_REVIEW',
    'PROMOTING',
    'APPROVED',
    'REJECTING',
    'REJECTED',
    'FAILED'
  )),
  constraint milestone_submission_packages_cleanup_status_check check (cleanup_status in (
    'NOT_REQUIRED',
    'PENDING',
    'COMPLETED',
    'FAILED'
  ))
);

create unique index if not exists uq_milestone_submission_packages_approval
  on public.milestone_submission_packages (milestone_approval_id)
  where milestone_approval_id is not null;

create unique index if not exists uq_milestone_submission_packages_one_active_per_milestone
  on public.milestone_submission_packages (milestone_id)
  where status in ('STAGING', 'PENDING_REVIEW', 'PROMOTING', 'REJECTING');

create index if not exists milestone_submission_packages_project_idx
  on public.milestone_submission_packages (project_id);
create index if not exists milestone_submission_packages_milestone_idx
  on public.milestone_submission_packages (milestone_id);
create index if not exists milestone_submission_packages_submitted_by_idx
  on public.milestone_submission_packages (submitted_by);
create index if not exists milestone_submission_packages_status_idx
  on public.milestone_submission_packages (status);

create table if not exists public.milestone_submission_attachments (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.milestone_submission_packages(id) on delete cascade,
  file_name text not null,
  storage_path text not null unique,
  file_size bigint not null check (file_size >= 0),
  mime_type text not null,
  uploaded_by uuid not null references public.users(id),
  status text not null default 'PENDING',
  promoted_document_id uuid null references public.documents(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint milestone_submission_attachments_file_name_check
    check (char_length(btrim(file_name)) > 0),
  constraint milestone_submission_attachments_storage_path_check
    check (char_length(btrim(storage_path)) > 0),
  constraint milestone_submission_attachments_mime_type_check
    check (char_length(btrim(mime_type)) > 0),
  constraint milestone_submission_attachments_status_check check (status in (
    'PENDING',
    'PROMOTING',
    'PROMOTED',
    'CLEANUP_PENDING',
    'CLEANUP_FAILED'
  )),
  constraint milestone_submission_attachments_promoted_document_check
    check (status <> 'PROMOTED' or promoted_document_id is not null)
);

create unique index if not exists uq_milestone_submission_attachments_promoted_document
  on public.milestone_submission_attachments (promoted_document_id)
  where promoted_document_id is not null;

create index if not exists milestone_submission_attachments_package_idx
  on public.milestone_submission_attachments (package_id);
create index if not exists milestone_submission_attachments_uploaded_by_idx
  on public.milestone_submission_attachments (uploaded_by);
create index if not exists milestone_submission_attachments_status_idx
  on public.milestone_submission_attachments (status);

-- Match existing workflow metadata: application access is through the service role.
alter table public.milestone_submission_packages enable row level security;
alter table public.milestone_submission_attachments enable row level security;

drop policy if exists milestone_submission_packages_service_role_only
  on public.milestone_submission_packages;
create policy milestone_submission_packages_service_role_only
  on public.milestone_submission_packages
  for all to service_role using (true) with check (true);

drop policy if exists milestone_submission_attachments_service_role_only
  on public.milestone_submission_attachments;
create policy milestone_submission_attachments_service_role_only
  on public.milestone_submission_attachments
  for all to service_role using (true) with check (true);
