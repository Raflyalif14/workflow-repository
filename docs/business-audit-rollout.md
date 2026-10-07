# Business mutation audit / Phase 30

Baseline before this task: main / 1347244f21b4007fa6e6e239172b579790408969; index empty; 174 dirty paths preserved. Exact bytes/hashes saved outside repository in business-audit-baseline.json.

## Inventory before implementation

| Action | Active endpoint / RPC | Authorization | Audit / atomicity / replay before patch | Confirmation before patch | Gap |
|---|---|---|---|---|---|
| Create project + intake | POST /projects, initialize workflow | Active Sales | PROJECT_CREATED after independent metadata/Storage writes, compensation | Form directly saves | creation audit not atomic; confirmation missing |
| Project information | PATCH /projects/:id | Admin or Sales owner | UPDATE after write; no receipt | No active form consumer | before/after and transaction missing |
| Timeline | PUT /projects/:id/timeline | Sales owner, unlocked DRAFT | loop with compensating rollback; separate log | Save directly | atomicity, CAS, confirmation |
| Deadline proposal/review | milestone deadline endpoints | Sales owner / Head SA, ACTIVE | separate history/approval/effective writes and best-effort logs | Existing forms, no final summary | atomicity, replay, confirmation |
| Output scope | checklist / sync_phase_output_scope, sync_draft_output_scope | Sales owner unlocked DRAFT | scope RPC atomic; separate log | Save directly | atomic audit, confirmation |
| Plan submit | POST plan/submit | Sales owner DRAFT | insert + separate log | direct button | atomic audit, replay, confirmation |
| V2/phase plan review + PIC | review_project_plan_pic_atomic | Active Head SA, phase/CAS/PIC policy | Phase27 atomic receipt + stable logs | Existing two-step review | Preserve; no second audit |
| LEGACY v1 plan review (follow-up inspection) | plan approve/reject | Head SA, DRAFT, Set Deadline ready | compensating approval/milestone/project writes + separate log | Existing review confirmation | atomicity and replay missing; now moved to Phase30 RPC |
| PIC assign/reassign | assign_project_pic_atomic | Active Head SA, revision | Phase27 structured atomic audit/receipt | Existing confirmation | Preserve |
| Estimated value | update_project_estimated_value | Sales owner, DRAFT/ACTIVE not paused | Phase26 structured atomic audit/CAS/receipt | Existing old/new confirmation | Preserve |
| Postpone/resume | POST postpone/resume | Sales owner, status | write + separate log | postpone reason form; resume direct | transaction, before/after, replay; resume confirm |
| Continue/close Pra-Tender | continue_project_tender_phase / close_project_at_pra_tender | Sales owner, completed phase, not paused/final | Phase25 lock + decision replay + atomic activity | Existing phase decision dialog | Preserve |
| WON/LOST + final value | outcome endpoint / final Sales RPCs | Sales owner; WAITING_RESULT / final stage | final RPC atomic business writes; separate activity | Existing outcome form | atomic before/after; confirmation summary |
| Draft add/replace/remove | mutate_project_output_document_draft | Head SA / SA PIC; Phase22 CAS/receipt | metadata atomic; upload best-effort log, remove no log | picker/drop starts upload, remove direct | committed metadata audit + one user-operation confirm |
| Output submit | submit_project_output_document_draft | Head SA / SA PIC; Phase22/28 | immutable snapshot/receipt atomic; separate log | single/batch direct | atomic audit, confirm |
| Output review | review_project_output_document_snapshot | Head SA; Phase28 snapshot/receipt | atomic review/audit/markers | Existing two-step confirmation | Preserve |
| Document ACL | set_document_repository_access | Head SA/admin native Approved result | Phase29 private structured atomic audit/receipt | Existing confirmation | Preserve; private history excluded from project timeline |
| Delete + cleanup retry | delete_project_with_cleanup / cleanup receipt | Super Admin | receipt actor/time/dependencies survives project deletion; retry status CAS | Danger-zone confirmation | Preserve receipt and exact path tracking; no duplicate archive |
| Workflow progression | progression CAS / phase completion | Existing actor/phase gates | mixture RPC and legacy CAS, best-effort operational logs | No confirmation for automatic progression | operational/system transitions; inventory separately from manual data edits |

Navigation, expansion, search, refresh, downloads and language/auth preferences are not project-business mutations; no extra confirmation or project audit.

## Rollout

This migration has NOT been executed by the agent. Stop old API writers before deployment: old direct writes can bypass the new audit RPC. Apply prerequisites Phase24-29 in order if missing, inspect Phase30 preflight, apply Phase30 manually, deploy updated backend/frontend together, run Phase30 verification. Do not fabricate before/after for historical logs. Database transaction rollback/permissions require PostgreSQL validation; mocks/static checks alone do not prove live atomicity.

## Implemented coverage

- Project info, DRAFT scope, timeline, plan submit, deadline proposal/review, postpone/resume, WAITING_RESULT outcome: one `mutate_project_business` transaction, project lock, active server actor, safe projection, reviewed `updated_at` CAS, per-project request receipt. Replay verifies actor/action/payload and reviewed timestamp BEFORE checking current lifecycle; no-op skips audit. Legacy callers without headers get server-read CAS; a supplied receipt ID recovers its original timestamp for retry.
- LEGACY v1 plan review: same RPC locks pending plan and Set Deadline, compares server-validated schedule under lock, commits approval/activation/audit together. V2/phase plan review, PIC, estimated value, per-file review and document ACL retain Phase26-29 implementations without second audit.
- Draft add/replace/remove and submit: wrappers around unchanged Phase22/28 cores use their `applied`/`created` replay gates; audit records committed file metadata or immutable snapshot version/count. Storage uncertainty tracking Phase23 is untouched. Draft audit creates no review History.
- SA/manual non-SA/final Sales completion: RPC owns completion audit; final outcome owns contract/status audit. Changed=false replay creates no second entry. Automatic progression retains its operational logs and existing lifecycle.
- Creation: protected project-row insertion has a transactional creation trigger with active Sales verification. Intake/initialization compensation is retained.
- Deletion: durable cleanup receipt remains actor/time/exact-path/dependency evidence; Phase30 adds receipt-table dependency count inside the same transaction. No alternate archive or Storage cleanup is introduced.
- Missing confirmations added for create, scope/timeline/plan submit, postpone/resume, deadline proposal/review, completion/outcome and one multi-file draft operation. Existing PIC/value/phase/output-review/ACL/deletion dialogs are retained. Transport failure preserves inputs/files and receipt IDs; CAS conflict refreshes scoped queries and requires review. Audit activity uses native project read access and keeps Phase29 ACL events private.

## Remaining coverage boundaries

These active paths were inspected but are NOT claimed to have complete Phase30 transactional audit coverage:

| Path | Concrete remaining issue | Next isolated work |
|---|---|---|
| Project creation with intake (`ProjectManagementService.create`) | Project-row audit is atomic; the full DB/Storage initialization is still compensating. There is no cross-request creation receipt, so an ambiguous successful HTTP response can cause a separate project on a fresh retry. | Design a creation receipt/finalization contract with exact intake ownership and crash recovery; do not mistake a row trigger for whole-operation atomicity. |
| Official document version/review/comment (`document.service.ts`) | Version/document/review/comment writes and `logDocumentActivity` remain separate, with compensation. They are separate artifact workflows, not Phase22 output metadata. | Add artifact-specific transaction/receipt/CAS and matching confirmation after auditing Storage/version semantics; generic project RPC cannot safely replace those writes. |
| Supporting contribution/create/promote and Sales milestone document upload | Storage copies/uploads and document/contribution persistence use existing multi-step/compensation policies. No complete structured before/after receipt was added here. | Dedicated transaction/finalization design preserving promotion claims and exact historical file refs. |
| Automatic legacy progression / retry completion | Operational CAS transitions still use existing best-effort event logging. They are system progression, not a user data-edit confirmation. | Evaluate atomic operational event persistence independently; do not add confirmations to automatic transitions. |
| Scenario/stage/user/Telegram settings | Administrative configuration, identity and delivery preferences are outside project data mutation coverage; no credential/raw preference/request audit was added. | Separate allowlist/access review if business auditing is required for these modules. |

No historical actor/before/after has been fabricated. Full application audit coverage is not claimed. Old API instances/direct writers must be stopped during rollout because they can bypass the new project RPCs.

## Validation and limits

Targeted backend tests passed: business-mutation-audit; project-plan-approval.service (including LEGACY v1); phase-plan-review; output-document-policy; output-document-draft-files; deadline-approval; deadline-revised-flow; deadline-notification; project-activity.service; project-deletion-output-files; project-deletion-retry.service; output-file-revisions; document-repository-access; project-creation-documents. Mapping and completion-retry tests also passed earlier.

Frontend targeted tests: business-audit (actual confirmation handlers, cancel, failure/retry, concurrent click latch, stale rejection, locale and retained file selection, per-account receipt isolation, frozen reviewed timestamp); i18n; activity-timeline; output-document-draft; output-file-revisions; document-access; pic-assignment-request; approval-queue-ui. The new test is registered in the explicit frontend runner.

Existing `workflow-simplification.test.ts` assertion 24 still fails: it expects `completeAssignPicStageIfCurrent` in assignment-phase5.service.ts, which was already absent in the pre-task Phase27 baseline. The test matches HEAD; assignment/dashboard bytes were untouched by this task. The assertion was not edited to obtain a green result.

Backend/frontend `tsc --noEmit` passed. Strict UTF-8 and `git diff --check` passed (Git reports existing LF/CRLF normalization warnings). PostgreSQL was never executed: SQL source assertions/mocks do not prove live rollback, locking or deployment compatibility. No app was listening on localhost 3000/5000; browser/UAT was not performed. No live data or Storage was used.

## Manual rollout order

1. Review the matrix and the coverage boundaries above; verify applied Phase22-23 and Phase24-29 signatures/schema with their read-only checks and Phase30 preflight. Resolve NULL timestamps, missing signatures or unexpected client/direct writers before applying.
2. Stop old API writer instances and pause write traffic; preserve existing workers/retry policy. Do not leave an old backend serving writes against the new schema/RPC aliases.
3. Apply the complete Phase30 transaction manually once; no old migration is changed. Failure must roll back all renames/tables/triggers. Do not apply fragments.
4. Deploy matching backend/frontend together, restart normal workers, run Phase30 verify. Confirm private cores are non-executable by service/client roles, only public actor-checked RPCs have service execution.
5. In an isolated fixture database, verify audit-insert failure rollback, simultaneous stale writes, same-ID changed-payload rejection, lost-response replay, and original Phase22/23 snapshot/Storage protections. Then validate UI keyboard/focus, locale retention, activity access, and cleanup receipt behavior in controlled UAT. Do not infer production readiness from these source/mock tests alone.

## Files from this task

- `backend/src/controllers/deadline-approval.controller.ts`
- `backend/src/controllers/deadline.controller.ts`
- `backend/src/controllers/output-document.controller.ts`
- `backend/src/controllers/project-management.controller.ts`
- `backend/src/controllers/project-plan-approval.controller.ts`
- `backend/src/services/business-audit-projection.ts`
- `backend/src/services/business-audit.service.ts`
- `backend/src/services/business-mutation-audit.test.ts`
- `backend/src/services/deadline-approval.service.ts`
- `backend/src/services/deadline.service.ts`
- `backend/src/services/output-document-draft-files.test.ts`
- `backend/src/services/output-document-policy.test.ts`
- `backend/src/services/output-document.service.ts`
- `backend/src/services/project-activity.service.ts`
- `backend/src/services/project-management.service.ts`
- `backend/src/services/project-plan-approval.service.test.ts`
- `backend/src/services/project-plan-approval.service.ts`
- `backend/src/services/workflow-progression.service.ts`
- `backend/supabase/phase30-business-mutation-audit.sql`
- `backend/supabase/phase30-preflight.sql`
- `backend/supabase/phase30-verify.sql`
- `docs/business-audit-rollout.md`
- `frontend/package.json`
- `frontend/src/app/projects/[id]/page.tsx`
- `frontend/src/app/projects/new/page.tsx`
- `frontend/src/components/approvals/approval-action-dialog.tsx`
- `frontend/src/components/projects/business-confirmation.tsx`
- `frontend/src/components/projects/output-document-files.tsx`
- `frontend/src/components/projects/output-documents-section.tsx`
- `frontend/src/components/projects/output-scope-section.tsx`
- `frontend/src/components/projects/postpone-project-dialog.tsx`
- `frontend/src/components/projects/project-timeline-editor.tsx`
- `frontend/src/hooks/use-approvals.ts`
- `frontend/src/hooks/use-business-request.ts`
- `frontend/src/hooks/use-milestone-workflow.ts`
- `frontend/src/hooks/use-output-documents.ts`
- `frontend/src/hooks/use-projects.ts`
- `frontend/src/i18n/en.ts`
- `frontend/src/i18n/id.ts`
- `frontend/src/lib/activity-timeline.ts`
- `frontend/src/lib/business-audit.test.tsx`
- `frontend/src/lib/business-request.ts`
- `frontend/src/lib/pic-assignment-request.test.tsx`
- `frontend/src/types/project.ts`

Preservation check: 149 of the 174 initial dirty paths are byte-identical; 25 were intentionally extended by this task. No initial path was deleted. All Phase24-29 SQL files remained byte-identical. Index remains empty; no commit/push/reset/restore/SQL/Storage operation was performed.

Phase30 retains the Phase22 guard inside `mutate_output_draft_phase30_core`; public wrapper definitions no longer contain that guard text directly. Inspect the delegation and private core when verifying Phase23 protections. Never reapply Phase22/23 to restore a public-body string match.

Final Git check: `main / 1347244`; 101 modified tracked files + 92 untracked paths (193 total); staging empty. Task manifest above contains 44 files, including 11 newly created files. Final strict UTF-8 and diff check passed.
