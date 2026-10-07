# Per-file revision details within one output snapshot

## Behavior

Head SA selects one or more files from the current submitted snapshot and provides a reason for each. General feedback is optional. The final confirmation shows the project, output, phase, version and selected files/reasons. The decision remains one `REVISION_REQUIRED` for the entire output. Approval remains whole-output approval.

The draft retains all submitted file references. A marked original registry ID must be replaced by a newly uploaded ID or removed before submission. Unmarked files need no upload. Removing all files still fails the existing minimum-one-file submission rule. Reattaching a marked original ID makes it unresolved again. Renaming is insufficient. Submit creates one immutable snapshot; its new ID means older markers no longer gate its draft.

Feedback is stored against `(version_id,file_id)` with a foreign key to the immutable snapshot references. Review actor/time remain on the existing version. Legacy feedback is not converted into guessed file markers. Historical feedback/files remain visible through the authorized history/download endpoints.

## Atomicity and replay

Phase 28 adds `project_output_file_revisions` and `project_output_review_requests`. Existing migrations remain unchanged. Review uses the existing project/output lock order and actor guard, then validates CAS and exact membership. Decision, file feedback, existing activity log, status-trigger notification intent and receipt are in one RPC transaction. Errors are not swallowed. Existing independent channel preferences/worker delivery remain unchanged.

Each reviewed output includes `request_id`; revision additionally includes `file_revisions: [{file_id,feedback}]`. Snapshot identity remains `expected_version_id`. A receipt replay requires the same active authorized actor and canonical payload. Reordering identical markers is harmless. Different content under the same ID is rejected. Two different requests cannot decide the same snapshot. Frontend and auth replay retain the request ID/payload on retry. A cancelled dialog does not send a request.

Submission wraps the unchanged Phase 22 core with a locked marked-file gate. Existing submit receipts replay before that new gate, with the original actor/payload validation. The private core and old non-receipted review RPC lose `service_role` execution permission, so there is no bypass write path from an old backend.

No Storage bytes are added/deleted by this migration. File collections, limits, immutable history, CAS, draft receipts and Phase 23 uncertainty tracking remain unchanged. New rows cascade through existing output/version references during authorized project deletion. They contain no Storage paths; exact-path capture and cleanup retry remain on existing file registries.

## Manual rollout

1. Apply any missing prerequisites through Phase 27, in order, using their existing rollout guides. Do not reapply already-installed migrations.
2. Run `phase28-preflight.sql` manually. Check required objects exist and mismatch lists are empty. Resolve invalid snapshots manually; do not manufacture feedback or reconstruct history.
3. Prepare the matching backend/frontend release. Pause backend writes during the migration/release switch, including old instances. Apply `phase28-output-file-revisions.sql` manually once. Deploy/restart the matching backend, then matching frontend. Old review clients lack the required request ID and are intentionally rejected.
4. Run `phase28-verify.sql` manually. Check mismatch lists empty and permission booleans false/false/false/true.
5. On an isolated test project, submit two files, revise one, cancel confirmation first, retry a simulated lost response, replace that file, and resubmit retaining the other. Also test both marked, foreign ID, whitespace reason, stale snapshot, original reattachment, review history, approved-only Documents and authorized downloads.
6. Inspect safe outbox diagnostics and activity count: one intent set/activity per reviewed snapshot, no extra version from draft changes. Verify project-deletion preview/cleanup on an isolated fixture only; do not use live customer projects.

Static SQL checks and mock RPC tests do not prove constraints, triggers, lock ordering or rollback on live PostgreSQL. Migration execution, concurrency on PostgreSQL, actual browser layout and end-to-end UAT remain manual gates. Downgrading only application code leaves the retired review RPC unavailable; plan a forward fix rather than restoring the unsafe write path.

## Patch files and completed local checks

Backend: `src/services/output-document.service.ts`, `src/validators/output-document.validator.ts`, `src/services/output-file-revisions.test.ts`, and affected fixtures `output-document-draft-files.test.ts`, `output-document-notification.test.ts`, `output-document-policy.test.ts`, `phase-output-read.test.ts`.

Frontend: `src/components/projects/output-documents-section.tsx`, `output-document-files.tsx`, `src/hooks/use-output-documents.ts`, `src/types/project.ts`, `src/lib/output-document-ux.ts`, `output-file-revisions.ts`, `output-file-revisions.test.tsx`, `activity-timeline.ts`, `src/i18n/en.ts`, `id.ts`, and `package.json` (explicit test runner registration).

Migration artifacts: the three Phase 28 SQL files and this guide. Earlier Phase 24-27 migration files remain unchanged.

Completed: nine targeted backend test files (revision, policy, drafts/CAS/receipts, notification, access, repository, deletion, approvals queue and phase reads); seven frontend test files (revision handlers/helpers, output UX/draft, queue, repository, i18n and activity); both `tsc --noEmit`; strict UTF-8 for all dirty text files; `git diff --check`. Frontend targeted tests used the installed ts-node CommonJS/alias adapter because tsx is not installed locally; the npm runner entry remains consistent with the existing runner.

No SQL, migration, live Storage/database mutation, full build, staging, commit or push was performed. No local page/browser or PostgreSQL UAT was completed. Existing Dashboard UX baseline failure was outside this targeted run and was not modified.
