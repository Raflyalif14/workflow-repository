-- Phase 11M: Explicit promotion of supporting input attachments into the
-- official document repository. Apply manually through the Supabase SQL editor.

begin;

alter table public.milestone_contribution_attachments
  add column if not exists promotion_status text not null default 'NOT_PROMOTED',
  add column if not exists promoted_document_id uuid references public.documents(id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'milestone_contribution_attachments_promotion_status_check'
      and conrelid = 'public.milestone_contribution_attachments'::regclass
  ) then
    alter table public.milestone_contribution_attachments
      add constraint milestone_contribution_attachments_promotion_status_check
      check (promotion_status in ('NOT_PROMOTED', 'PROMOTING', 'PROMOTED'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'milestone_contribution_attachments_promotion_document_check'
      and conrelid = 'public.milestone_contribution_attachments'::regclass
  ) then
    alter table public.milestone_contribution_attachments
      add constraint milestone_contribution_attachments_promotion_document_check
      check (
        (promotion_status = 'PROMOTED' and promoted_document_id is not null)
        or (promotion_status in ('NOT_PROMOTED', 'PROMOTING') and promoted_document_id is null)
      );
  end if;
end;
$$;

create index if not exists milestone_contribution_attachments_promoted_document_idx
  on public.milestone_contribution_attachments(promoted_document_id)
  where promoted_document_id is not null;

commit;

-- Read-only verification after manual application:
-- select id, contribution_id, promotion_status, promoted_document_id
-- from public.milestone_contribution_attachments
-- order by created_at desc;
