# Sequential project phases and Head SA confirmation

Baseline checked: `main / 1347244f21b4007fa6e6e239172b579790408969`, clean
worktree and empty index. No repository AGENTS.md was found. No SQL, migration,
Storage cleanup, stage, commit or push was performed.

## User flow

New Pra-Tender projects select from 10 outputs (one mandatory). Only SA stages
with selected outputs are materialized; there is no final Sales milestone in
this phase. Sales configures the schedule and submits the plan. Head SA confirms
approval and selects an eligible PIC; rejection retains DRAFT for revision.
SA edits multi-file drafts, submits one immutable snapshot per output, and Head
SA confirms review of the whole snapshot. Every selected output is mandatory
for completion, including selected optional outputs.

The last SA completion completes Pra-Tender and leaves the project ACTIVE. It
neither creates the tender phase nor records a final outcome. The owning Sales
user gets a Continue action in Project Detail and Dashboard. Its dialog selects
tender scope; after creation, the existing DRAFT timeline editor sets the new
schedule and submits a separate plan for Head SA approval. Tender stays inactive
until that approval. Sales can revise the new DRAFT scope before submission.
The previous phase's schedule, PIC, scope, outputs and plan decisions remain
stored. Completed phases can be opened in Project Detail, including milestone
deep links. Approved files remain available through Documents and authorized
download endpoints.

Projects created directly as On Submission Tender select from seven outputs
(four mandatory) and start with their own DRAFT plan. Tender Process is the
final Sales milestone in this phase; WON/LOST remains a Sales-owner decision.

## Data model and transaction boundaries

- `project_phases`: stable project/phase identity, scenario, scope, PIC, status
  and completion timestamp; unique `(project_id, phase_key)`.
- Project `scenario_id` keeps the initial scenario. `current_scenario_id` and
  `active_phase_id` identify active work. `phase_migration_state` distinguishes
  new READY projects from existing LEGACY_REVIEW projects.
- Milestones, outputs and plan approvals carry `phase_id`. Composite foreign
  keys check project ownership; identity triggers prevent implicit movement of
  historical records to a different phase. Existing workflow-stage IDs remain
  distinct per scenario even when `stage_key` is shared.
- A new-project trigger creates its initial phase. Completion and scope gates
  use the active phase; legacy RPCs are preserved for unclassified projects.
- `continue_project_tender_phase` locks the project before checking completion,
  creating the phase, syncing selected outputs/milestones and recording one
  activity entry. Replay returns the existing phase without replacing its scope
  or schedule. No extra notification intent is created by this operation.
- `review_project_phase_plan` reviews the exact pending approval in the active
  phase and atomically assigns PIC, starts its first milestone and activates
  the project. Other Head SA accounts cannot be selected as PIC; an active SA
  or the reviewing Head SA's own active account follows existing policy.
- New phase plan requests require `expected_approval_id`; a replaced/reviewed
  request is rejected. Existing legacy callers retain their prior optional-ID
  contract. The frontend sends the ID on both review surfaces.
- Existing output version CAS, receipts, upload limits, immutable snapshots,
  Phase 23 outcome tracking and exact-path cleanup rules remain intact. Phase
  24 changes only the shared output mapping/actor checks to recognize phases.

## Explicit catalog mapping

| Phase | stage_key | document_key |
| --- | --- | --- |
| Pra-Tender | PROPOSAL_SOLUTION | proposal_deck_solusi (mandatory) |
| Pra-Tender | DELIVERABLES | poc_demo, rencana_distribusi |
| Pra-Tender | ASSESSMENT_REPORT | assessment |
| Pra-Tender | REQUIREMENT_GATHERING | kak_rfp, analisa_kebutuhan, operational_requirement |
| Pra-Tender | TECHNICAL_PROPOSAL_BOQ | rab, spesifikasi_teknis |
| Pra-Tender | PAIN_POINT_ANALYSIS | kajian_teknis |
| On Submission Tender | TECHNICAL_PROPOSAL_BOQ | proposal_teknis, timeline_proyek, spesifikasi_teknis_toc (mandatory) |
| On Submission Tender | DELIVERABLES | identitas_barang_produk (mandatory), poc_demo_report |
| On Submission Tender | PROPOSAL_SOLUTION | metodologi_implementasi, arsitektur_sistem |

## Confirmation behavior

Plan approval/rejection and output approval/revision use one existing dialog
at a time, with an explicit final confirmation. Output review captures snapshot
ID, version number and file count. The captured ID is sent in the CAS payload;
query refresh cannot silently substitute another snapshot. Rejection/revision
requires a non-whitespace reason. Cancel does not mutate. Requests disable
decision controls; failures preserve reason input and show localized guidance.
The plan dialog is mounted at page level so a DRAFT/workspace refresh does not
destroy its state. Language changes update labels without remounting the form.

## Existing projects: intentional manual classification boundary

Phase 24 does **not** auto-split, delete or rebuild existing projects. All existing
rows start as LEGACY_REVIEW and retain their original RPC behavior and catalog
(including the old 17-output Pra-Tender contract). The new Continue endpoint
rejects those projects. Migration and preflight never read Storage paths.

- DRAFT with 17 outputs: inspect selected scope plus file registry, draft
  receipts, versions, deadline history and plans before deciding which records
  can represent separate phases. CREATED/TO_DO alone does not prove no history.
- ACTIVE: shared Pra-Tender milestone IDs can already contain outputs from both
  groups. Do not move or renumber them implicitly, or reuse its approved plan as
  the new phase's approval.
- Work on both groups or final projects: preserve all existing history and
  outcomes. A future reviewed migration must specify the exact mapping and
  treatment of any shared milestones before enabling READY/transitions.
- Direct legacy tender projects keep their original single-phase flow. They
  need no Pra-Tender transition; conversion can be reviewed separately.

`phase24-preflight.sql` returns project IDs, states, catalog groups, work counts
and mapping mismatches for that review. It does not invent a backfill from names
or status. Phase identity guards intentionally reject ad-hoc reclassification;
any reviewed backfill requires a separate controlled migration. No database was
queried here, so affected record counts are unknown.

## Integration audit

Project Detail derives active progress from stored active-phase milestones while
retaining past phases for history. List next-stage summaries, Dashboard
progress/workload/output queues and current approval selection use active work.
Approval history remains available; a previous phase plan is not current.
Sales gets one phase-continuation task with the existing task priority ordering.
Output mutations also invalidate project lists so that task can refresh.

Search continues to use canonical project/milestone IDs and list next-stage
summaries. Notifications retain their existing project/milestone links; past
milestone links open their history container. New phase plan submission/review
uses existing notifications after successful persistence. Output repository
lookup uses the full stable 17-key catalog, allowing approved results from both
phases without broadening non-final visibility. Deletion preview/cleanup still
queries all milestones, plans, outputs, versions and file-registry rows by
project ID; phases cascade with the deleted project, without dropping any old
file-reference collection or cleanup guard.

## Validation and limits

Completed: 25 backend and 11 frontend targeted test files passed; backend and
frontend `tsc --noEmit` and `git diff --check` passed. The two baseline failures
listed below remain. Final Git status: main / 1347244, 34 modified files and 12
new files, no deleted files, empty index. The complete inventory is below.

Targeted tests cover catalog counts/mandatory scope/empty stages, direct tender,
completion without automatic transition/outcome, ownership/status guards,
exact approval and snapshot identities, phase-separated schedule validation,
old files and authorized downloads, Sales privacy, EN/ID labels, and preserved
confirmation input on failure. A local HTTP test exercises actual authentication,
active-account and role middleware with mocked providers for the Continue route.
The existing backend runner discovers new tests; `phase-review.test.ts` is also
registered in the explicit frontend runner.

SQL guard tests check lock/replay/unique ordering, phase filters, snapshot/draft
history protections and PIC policy. They do **not** execute SQL or prove live
PostgreSQL execution/concurrency. Database migration, concurrent deployment and
browser UAT still require manual verification. No application listener was found
on ports 3000, 3001, 5000 or 5001; no browser flow was claimed.

Two existing test failures were reproduced using HEAD source compiled in memory,
without checkout/reset or edits to those tests:

- `dashboard-ux.test.ts`: its SA fixture expects an overdue count from a
  REJECTED milestone, while the helper counts IN_PROGRESS milestones. The phase
  patch changes the Sales task branch only; this test remains untouched.
- `sales-milestone-document.service.test.ts`: its mock lacks `range()`, which
  the existing Documents listing uses; upload/access cases pass before that
  repository-read case fails. Its test and service remain untouched.

Two other pre-existing incomplete mocks in creation/completion tests were
completed for the required integration checks (stage mapping and scenario).
The obsolete assertion that new Pra-Tender includes tender outputs was updated
to the required 10/7 catalog. No authorization/completion assertions were relaxed.

## Manual rollout

1. Review the patch and preflight results. Ensure applied prerequisites through
   Phase 23; do not rerun already-applied migrations.
2. Capture existing project/output/version/approval counts and a database backup.
   Keep LEGACY_REVIEW records intact pending explicit business classification.
3. Enter maintenance and stop API writers/workers. Old application writers must
   not create projects while Phase 24's new initial-phase trigger is active.
4. Apply `phase24-sequential-project-phases.sql` manually as one transaction.
5. Refresh the PostgREST schema cache if the new columns/FK relationships are
   not yet visible, then deploy matching backend/frontend together. Run `phase24-verify.sql` manually;
   confirm legacy counts/history are unchanged before resuming traffic/workers.
6. In a controlled environment validate Sales -> Head SA -> SA -> completed
   Pra-Tender -> Sales-created tender DRAFT -> separate Head SA approval -> Sales
   WON/LOST. Include duplicate/concurrent Continue requests, stale confirmations,
   future start dates, postponed projects and both-phase downloads.

Do not roll back only the application to an old writer after Phase 24. Remain in
maintenance if verification fails; do not drop the new tables to roll back data.

## Changed files

### Backend application and targeted tests

- `backend/src/constants/scenarios.ts`
- `backend/src/controllers/project-management.controller.ts`
- `backend/src/routes/project.routes.ts`
- `backend/src/services/approval-overview.service.ts`
- `backend/src/services/assignment-phase5.service.ts`
- `backend/src/services/dashboard.service.ts`
- `backend/src/services/milestone.service.ts`
- `backend/src/services/output-document-policy.test.ts`
- `backend/src/services/output-document.service.ts`
- `backend/src/services/project-completion-retry.service.ts`
- `backend/src/services/project-completion-retry.test.ts`
- `backend/src/services/project-creation-documents.test.ts`
- `backend/src/services/project-management.service.ts`
- `backend/src/services/project-plan-approval.service.ts`
- `backend/src/services/workflow-progression.service.ts`
- `backend/src/validators/project-plan.validator.ts`
- `backend/src/services/phase-output-read.test.ts`
- `backend/src/services/phase-plan-review.test.ts`
- `backend/src/services/phase-route.test.ts`
- `backend/src/services/project-phase.service.ts`
- `backend/src/services/project-phase.test.ts`

### New SQL artifacts

- `backend/supabase/phase24-preflight.sql`
- `backend/supabase/phase24-sequential-project-phases.sql`
- `backend/supabase/phase24-verify.sql`

### Frontend and targeted tests

- `frontend/package.json`
- `frontend/src/app/page.tsx`
- `frontend/src/app/projects/[id]/page.tsx`
- `frontend/src/components/approvals/approval-action-dialog.tsx`
- `frontend/src/components/projects/output-documents-section.tsx`
- `frontend/src/components/projects/output-scope-section.tsx`
- `frontend/src/constants/scenarios.ts`
- `frontend/src/hooks/use-approvals.ts`
- `frontend/src/hooks/use-output-documents.ts`
- `frontend/src/hooks/use-projects.ts`
- `frontend/src/i18n/en.ts`
- `frontend/src/i18n/id.ts`
- `frontend/src/lib/activity-timeline.test.ts`
- `frontend/src/lib/activity-timeline.ts`
- `frontend/src/lib/dashboard-ux.ts`
- `frontend/src/lib/workflow-ux-helpers.ts`
- `frontend/src/types/approval.ts`
- `frontend/src/types/project.ts`
- `frontend/src/components/projects/project-phases-panel.tsx`
- `frontend/src/lib/phase-review.test.ts`
- `frontend/src/lib/phase-review.ts`

### Rollout documentation

- `docs/sequential-project-phases-rollout.md`
