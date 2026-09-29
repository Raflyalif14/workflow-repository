-- Phase 18b: apply only after the new application is deployed and all old
-- backend instances have stopped. Save phase18-preflight.sql results first.
begin;

-- Abort before any legacy rows are deleted if an approval belongs to another
-- workflow role or its milestone, project, stage, or scenario is invalid.
do $$ begin
  if exists (
    select 1 from public.milestone_approvals ma
    left join public.project_milestones pm on pm.id = ma.milestone_id
    left join public.projects p on p.id = pm.project_id
    left join public.workflow_stages ws on ws.id = pm.workflow_stage_id
    left join public.scenarios s on s.id = p.scenario_id
    where pm.id is null or p.id is null or ws.id is null or s.id is null
      or ws.scenario_id is distinct from p.scenario_id
      or ws.default_role is distinct from 'SA'
  ) then raise exception 'Phase 18: milestone approval outside a valid SA stage'; end if;
end $$;

-- Catch output rows created by the old application after Phase 18a.
with document_stage(document_key, stage_key) as (values
  ('proposal_deck_solusi','PROPOSAL_SOLUTION'), ('poc_demo','DELIVERABLES'),
  ('assessment','ASSESSMENT_REPORT'), ('kak_rfp','REQUIREMENT_GATHERING'),
  ('rab','TECHNICAL_PROPOSAL_BOQ'), ('kajian_teknis','PAIN_POINT_ANALYSIS'),
  ('spesifikasi_teknis','TECHNICAL_PROPOSAL_BOQ'), ('analisa_kebutuhan','REQUIREMENT_GATHERING'),
  ('operational_requirement','REQUIREMENT_GATHERING'), ('rencana_distribusi','DELIVERABLES'),
  ('proposal_teknis','TECHNICAL_PROPOSAL_BOQ'), ('metodologi_implementasi','PROPOSAL_SOLUTION'),
  ('timeline_proyek','TECHNICAL_PROPOSAL_BOQ'), ('identitas_barang_produk','DELIVERABLES'),
  ('spesifikasi_teknis_toc','TECHNICAL_PROPOSAL_BOQ'), ('arsitektur_sistem','PROPOSAL_SOLUTION'),
  ('poc_demo_report','DELIVERABLES')
)
update public.project_output_documents od set milestone_id = pm.id
from document_stage ds, public.project_milestones pm, public.workflow_stages ws
where od.document_key = ds.document_key and pm.project_id = od.project_id
  and ws.id = pm.workflow_stage_id and ws.stage_key = ds.stage_key
  and (od.milestone_id is null or od.milestone_id = pm.id);

do $$ begin
  if exists (select 1 from public.project_output_documents where milestone_id is null) then
    raise exception 'Phase 18: output document without matching SA milestone';
  end if;
  if exists (
    with document_stage(document_key, stage_key, pra_only) as (values
      ('proposal_deck_solusi','PROPOSAL_SOLUTION',true), ('poc_demo','DELIVERABLES',true),
      ('assessment','ASSESSMENT_REPORT',true), ('kak_rfp','REQUIREMENT_GATHERING',true),
      ('rab','TECHNICAL_PROPOSAL_BOQ',true), ('kajian_teknis','PAIN_POINT_ANALYSIS',true),
      ('spesifikasi_teknis','TECHNICAL_PROPOSAL_BOQ',true), ('analisa_kebutuhan','REQUIREMENT_GATHERING',true),
      ('operational_requirement','REQUIREMENT_GATHERING',true), ('rencana_distribusi','DELIVERABLES',true),
      ('proposal_teknis','TECHNICAL_PROPOSAL_BOQ',false), ('metodologi_implementasi','PROPOSAL_SOLUTION',false),
      ('timeline_proyek','TECHNICAL_PROPOSAL_BOQ',false), ('identitas_barang_produk','DELIVERABLES',false),
      ('spesifikasi_teknis_toc','TECHNICAL_PROPOSAL_BOQ',false), ('arsitektur_sistem','PROPOSAL_SOLUTION',false),
      ('poc_demo_report','DELIVERABLES',false)
    )
    select 1 from public.project_output_documents od
    left join public.projects p on p.id = od.project_id
    left join public.scenarios s on s.id = p.scenario_id
    left join public.project_milestones pm on pm.id = od.milestone_id
    left join public.workflow_stages ws on ws.id = pm.workflow_stage_id
    left join document_stage ds on ds.document_key = od.document_key
    where p.id is null or s.id is null or s.name not in ('Pra-Tender', 'On Submission Tender')
      or pm.id is null or pm.project_id is distinct from od.project_id
      or ws.id is null or ws.scenario_id is distinct from p.scenario_id
      or ws.default_role is distinct from 'SA'
      or ds.document_key is null or ds.stage_key is distinct from ws.stage_key
      or (s.name = 'On Submission Tender' and ds.pra_only)
  ) then raise exception 'Phase 18: output document mapped to the wrong project or SA stage'; end if;
end $$;
alter table public.project_output_documents alter column milestone_id set not null;

-- Trial submissions do not carry forward as a second approval state. Output
-- versions and their review history remain intact.
update public.project_milestones pm set status = 'IN_PROGRESS', completed_at = null, updated_at = now()
from public.workflow_stages ws
where ws.id = pm.workflow_stage_id and ws.default_role = 'SA'
  and pm.status in ('SUBMITTED', 'REJECTED');

-- Route new and queued output notifications to the owning milestone.
create or replace function public.enqueue_output_document_notification()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_project public.projects%rowtype;
  v_actor_id uuid;
begin
  if old.status is not distinct from new.status
    or new.status not in ('IN_REVIEW', 'APPROVED', 'REVISION_REQUIRED')
    or new.current_version_id is null then
    return new;
  end if;

  select * into v_project from public.projects where id = new.project_id;
  if not found then
    raise exception 'Output notification project missing';
  end if;

  select case when new.status = 'IN_REVIEW' then version.uploaded_by else version.reviewed_by end
    into v_actor_id
  from public.project_output_document_versions version
  where version.id = new.current_version_id;

  insert into public.output_notification_outbox (
    project_id, output_document_id, version_id, recipient_user_id,
    event_status, notification_type, title, message, action_url
  )
  select
    new.project_id, new.id, new.current_version_id, recipient.id,
    new.status,
    case new.status
      when 'IN_REVIEW' then 'OUTPUT_DOCUMENTS_SUBMITTED'
      when 'APPROVED' then 'OUTPUT_DOCUMENTS_APPROVED'
      else 'OUTPUT_DOCUMENTS_REVISION_REQUIRED'
    end,
    case new.status
      when 'IN_REVIEW' then 'Output Document Submitted'
      when 'APPROVED' then 'Output Document Approved'
      else 'Output Document Revision Required'
    end,
    case new.status
      when 'IN_REVIEW' then 'Output "' || new.title || '" for project "' || v_project.name || '" is ready for review.'
      when 'APPROVED' then 'Output "' || new.title || '" for project "' || v_project.name || '" was approved.'
      else 'Output "' || new.title || '" for project "' || v_project.name || '" requires revision.'
    end,
    '/projects/' || new.project_id::text || '#milestone-outputs-' || new.milestone_id::text
  from public.users recipient
  where recipient.is_active is true
    and recipient.id is distinct from v_actor_id
    and (
      (new.status = 'IN_REVIEW' and recipient.role = 'HEAD_SA')
      or (new.status in ('APPROVED', 'REVISION_REQUIRED')
          and recipient.id = v_project.pic_id and recipient.role in ('SA', 'HEAD_SA'))
      or (new.status = 'APPROVED' and recipient.id = v_project.sales_id and recipient.role = 'SALES')
    )
  on conflict (output_document_id, version_id, event_status, recipient_user_id) do nothing;

  return new;
end;
$$;

update public.output_notification_outbox o
set action_url = '/projects/' || o.project_id::text || '#milestone-outputs-' || od.milestone_id::text
from public.project_output_documents od where od.id = o.output_document_id;

-- Historical delivered notifications have no output ID. Keep them usable by
-- linking to the project, while all new notifications target the exact stage.
update public.notifications set action_url = '/projects/' || project_id::text
where type in ('OUTPUT_DOCUMENTS_SUBMITTED','OUTPUT_DOCUMENTS_APPROVED','OUTPUT_DOCUMENTS_REVISION_REQUIRED')
  and project_id is not null and action_url like '%#output-documents';

-- Project deletion now captures only current exact file paths.
create or replace function public.delete_project_with_cleanup(
  p_project_id uuid,
  p_confirmation text,
  p_initiated_by uuid
)
returns table(cleanup_id uuid, storage_paths jsonb, storage_object_count integer)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_project public.projects%rowtype;
  v_paths jsonb;
  v_counts jsonb;
  v_cleanup_id uuid;
begin
  if not exists (
    select 1 from public.users
    where id = p_initiated_by and role = 'SUPER_ADMIN' and is_active = true
  ) then
    raise exception 'Project deletion initiator is not an active SUPER_ADMIN' using errcode = '42501';
  end if;

  select * into v_project from public.projects where id = p_project_id for update;
  if not found then
    raise exception 'Project not found' using errcode = 'P0002';
  end if;
  if p_confirmation is distinct from v_project.name then
    raise exception 'Project confirmation does not match' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(path order by path), '[]'::jsonb) into v_paths
  from (
    select dv.storage_path as path
    from public.document_versions dv
    join public.documents d on d.id = dv.document_id
    where d.project_id = p_project_id
    union
    select a.storage_path as path
    from public.milestone_contribution_attachments a
    join public.milestone_contributions c on c.id = a.contribution_id
    where c.project_id = p_project_id
    union
    select a.storage_path as path
    from public.project_intake_attachments a
    where a.project_id = p_project_id
    union
    select od.storage_path as path
    from public.project_output_documents od
    where od.project_id = p_project_id and od.storage_path is not null
    union
    select version.storage_path as path
    from public.project_output_document_versions version
    where version.project_id = p_project_id
  ) paths
  where path is not null;

  select jsonb_build_object(
    'milestones', (select count(*) from public.project_milestones where project_id = p_project_id),
    'deadline_approvals', (select count(*) from public.milestone_deadline_approvals where milestone_id in (select id from public.project_milestones where project_id = p_project_id)),
    'deadline_history', (select count(*) from public.milestone_deadline_history where milestone_id in (select id from public.project_milestones where project_id = p_project_id)),
    'project_plan_approvals', (select count(*) from public.project_plan_approvals where project_id = p_project_id),
    'assignments', (select count(*) from public.project_assignments where project_id = p_project_id),
    'activity_logs', (select count(*) from public.activity_logs where project_id = p_project_id),
    'notifications', (select count(*) from public.notifications where project_id = p_project_id or milestone_id in (select id from public.project_milestones where project_id = p_project_id)),
    'documents', (select count(*) from public.documents where project_id = p_project_id),
    'document_versions', (select count(*) from public.document_versions dv join public.documents d on d.id = dv.document_id where d.project_id = p_project_id),
    'document_version_approvals', (select count(*) from public.document_version_approvals a join public.document_versions dv on dv.id = a.document_version_id join public.documents d on d.id = dv.document_id where d.project_id = p_project_id),
    'document_comments', (select count(*) from public.document_comments c join public.documents d on d.id = c.document_id where d.project_id = p_project_id),
    'milestone_contributions', (select count(*) from public.milestone_contributions where project_id = p_project_id),
    'milestone_contribution_attachments', (select count(*) from public.milestone_contribution_attachments a join public.milestone_contributions c on c.id = a.contribution_id where c.project_id = p_project_id),
    'project_intake_attachments', (select count(*) from public.project_intake_attachments where project_id = p_project_id),
    'project_output_documents', (select count(*) from public.project_output_documents where project_id = p_project_id),
    'project_output_document_versions', (select count(*) from public.project_output_document_versions where project_id = p_project_id)
  ) into v_counts;

  insert into public.project_deletion_cleanups(project_id, project_name, initiated_by, storage_paths, storage_object_count, dependency_counts)
  values (p_project_id, v_project.name, p_initiated_by, v_paths, jsonb_array_length(v_paths), v_counts)
  returning id into v_cleanup_id;

  delete from public.notification_deliveries where notification_id in (select id from public.notifications where project_id = p_project_id or milestone_id in (select id from public.project_milestones where project_id = p_project_id));
  delete from public.notifications where project_id = p_project_id or milestone_id in (select id from public.project_milestones where project_id = p_project_id);
  delete from public.document_version_approvals where document_version_id in (select dv.id from public.document_versions dv join public.documents d on d.id = dv.document_id where d.project_id = p_project_id);
  delete from public.document_comments where document_id in (select id from public.documents where project_id = p_project_id);
  delete from public.milestone_contribution_attachments where contribution_id in (select id from public.milestone_contributions where project_id = p_project_id);
  delete from public.milestone_contributions where project_id = p_project_id;
  delete from public.project_intake_attachments where project_id = p_project_id;
  update public.project_output_documents set current_version_id = null where project_id = p_project_id;
  delete from public.project_output_document_versions where project_id = p_project_id;
  delete from public.project_output_documents where project_id = p_project_id;
  delete from public.milestone_deadline_approvals where milestone_id in (select id from public.project_milestones where project_id = p_project_id);
  delete from public.milestone_deadline_history where milestone_id in (select id from public.project_milestones where project_id = p_project_id);
  delete from public.project_plan_approvals where project_id = p_project_id;
  delete from public.project_assignments where project_id = p_project_id;
  delete from public.activity_logs where project_id = p_project_id;
  delete from public.document_versions where document_id in (select id from public.documents where project_id = p_project_id);
  delete from public.documents where project_id = p_project_id;
  delete from public.project_milestones where project_id = p_project_id;
  delete from public.projects where id = p_project_id and name = p_confirmation;
  if not found then
    raise exception 'Project deletion did not affect the expected project' using errcode = 'P0002';
  end if;

  return query select v_cleanup_id, v_paths, jsonb_array_length(v_paths);
end;
$$;


-- Remaining legacy writes are removed from application code before these drops.
delete from public.notification_deliveries where notification_id in (
  select id from public.notifications where type in ('MILESTONE_SUBMITTED','MILESTONE_APPROVED','MILESTONE_REJECTED')
);
delete from public.notifications where type in ('MILESTONE_SUBMITTED','MILESTONE_APPROVED','MILESTONE_REJECTED');
delete from public.activity_logs where action in
  ('MILESTONE_SUBMITTED','MILESTONE_APPROVED','MILESTONE_REJECTED','MILESTONE_REVISION_STARTED');
drop table if exists public.milestone_submission_attachments;
drop table if exists public.milestone_submission_packages;
drop table if exists public.milestone_approvals;

commit;
