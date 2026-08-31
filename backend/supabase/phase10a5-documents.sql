-- Phase 10A.5: Supabase-backed Documents metadata and private object storage.
-- This migration is additive. Apply it manually through the Supabase SQL editor
-- before enabling document uploads in an environment.

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  milestone_id uuid references public.project_milestones(id) on delete set null,
  title text not null check (char_length(trim(title)) >= 3),
  category text not null,
  status text not null default 'SUBMITTED',
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint documents_category_check check (category in (
    'PROPOSAL',
    'ARCHITECTURE_DESIGN',
    'SIZING_SHEET',
    'MOM',
    'ASSESSMENT_REPORT',
    'BOQ',
    'DELIVERABLE',
    'OTHER'
  )),
  constraint documents_status_check check (status in (
    'DRAFT',
    'SUBMITTED',
    'UNDER_REVIEW',
    'APPROVED',
    'REJECTED',
    'SUPERSEDED'
  ))
);

create table if not exists public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  file_name text not null,
  storage_path text not null unique,
  file_size bigint not null check (file_size >= 0),
  mime_type text not null,
  changelog text,
  status text not null default 'SUBMITTED',
  is_latest boolean not null default true,
  uploaded_by uuid not null references public.users(id),
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint document_versions_status_check check (status in (
    'DRAFT',
    'SUBMITTED',
    'UNDER_REVIEW',
    'APPROVED',
    'REJECTED',
    'SUPERSEDED'
  )),
  constraint document_versions_document_version_unique unique (document_id, version_number)
);

create unique index if not exists document_versions_one_latest_per_document
  on public.document_versions(document_id)
  where is_latest;

create table if not exists public.document_version_approvals (
  id uuid primary key default gen_random_uuid(),
  document_version_id uuid not null references public.document_versions(id) on delete cascade,
  status text not null default 'PENDING',
  action_role text not null default 'HEAD_SA',
  feedback text,
  reviewed_by uuid references public.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint document_version_approvals_status_check check (status in (
    'PENDING',
    'APPROVED',
    'REJECTED',
    'REVISED'
  ))
);

create table if not exists public.document_comments (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  milestone_id uuid references public.project_milestones(id) on delete set null,
  author_id uuid not null references public.users(id),
  content text not null check (char_length(trim(content)) > 0),
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists documents_project_updated_idx
  on public.documents(project_id, updated_at desc);
create index if not exists documents_milestone_idx
  on public.documents(milestone_id);
create index if not exists document_versions_document_created_idx
  on public.document_versions(document_id, created_at desc);
create index if not exists document_version_approvals_version_created_idx
  on public.document_version_approvals(document_version_id, created_at desc);
create index if not exists document_comments_document_created_idx
  on public.document_comments(document_id, created_at);

-- The backend uses the service role for storage operations and creates signed URLs
-- only after application-level authentication and project access checks.
insert into storage.buckets (id, name, public)
values ('workflow-documents', 'workflow-documents', false)
on conflict (id) do nothing;
