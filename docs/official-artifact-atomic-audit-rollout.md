# Phase 34: atomic official artifact audit

## Baseline and scope

Verified `main / a00e7f692e0019518e527d44c8d4bc8287cb47bd`, clean worktree and empty index before work. No AGENTS.md exists in the repository or its D: ancestor.

This closes the separated database/audit writes in `DocumentService.uploadNewVersion`, `reviewVersion`, `addComment`, and `MilestoneContributionService.create` / `promoteAttachment`. It does not change project phases, planning/PIC, output snapshot/review, auth, sharing policy or other artifact workflows. Initial Sales milestone document upload and the now-unused historical promotion helper are not replaced by this patch.

## Transaction and access

`mutate_official_artifact` is service-only, SECURITY DEFINER with `search_path=pg_catalog`. It checks the current active server actor, native project access, uploader/provenance ownership, manager review/promotion roles, project/milestone eligibility and captured document timestamp. Project/object locks serialize completion and receipt decisions. SQL reads the before state under these locks and constructs before/after audit from database rows. Actor/time come from the database; no client-provided before snapshot or actor is accepted from HTTP.

Version demotion, pending-review revision, new version/approval and document status are one transaction with the audit. Review changes version/document/approval together. Comment insert and audit are atomic. Contribution finalization inserts the parent and all attachments directly as READY with its audit; no partial STAGING parent is published. Promotion inserts approved document/version and links the source attachment with its audit. A failed audit aborts every business write and the COMMITTED receipt transition.

Audit uses the existing `activity_logs.business_audit` system. Safe activity projection exposes allowlisted metadata, not Storage paths, hashes, note/comment contents, or review feedback. EN/ID labels explain the stable action/object codes. Existing frontend layouts and response shapes remain unchanged.

## Receipt and Storage ownership

No endpoint or multipart/body field changes. Optional UUID `Idempotency-Key` is accepted on the existing mutation endpoints. The active version/comment/contribution hooks retain it across failed attempts and locale changes, clear it after success, and isolate it by session. A caller without the header remains compatible and starts a new operation; identical content alone is not treated as an idempotency key. Reloading/unmounting the hook does not persist its receipt locally. External review callers can send the same header; promotion also remains naturally idempotent by attachment.

Storage transfers are outside SQL transactions. RESERVE allocates unique operation-owned IDs/paths and a worker token before transfer. COMMIT needs that token and checks the original CAS, never silently refreshing it. The same receipt cannot start a second concurrent transfer. Only one pending promotion reservation exists per attachment.

On failure, CANCEL locks against a late COMMIT. A committed result is returned as success and its bytes are preserved. A definitely uncommitted reservation is FROZEN; only its exact server-returned, unreferenced paths can be removed. No prefix deletion or compensating metadata rollback is used. When cancellation/cleanup cannot be confirmed, bytes are preserved and a safe request ID is logged; the private receipt retains the exact manifest for manual investigation. Frozen retries allocate new paths and rotate the token, retaining retired manifests and fencing old workers. The existing UUID + sanitized filename/extension naming convention is retained.

There is intentionally no automatic lease takeover or orphan cleanup worker. Investigate stuck RESERVED jobs before any administrative recovery; do not reset them or delete bytes merely because a request timed out. Do not use live Storage for verification. The wrapped existing project-deletion RPC includes current and retired manifests in its deduplicated exact-path cleanup receipt, counts all artifact receipts, and freezes pending reservations. Existing cleanup status/retry policy is unchanged. Receipts have no project FK so deletion evidence is retained.

## Actual validation

| Check | Result / evidence |
| --- | --- |
| Official version | PASS: real PostgreSQL injected audit 23514 rolls back all related writes; actor denial, server before/after, same-receipt concurrent COMMIT creates one version/audit |
| Official review | PASS: real audit rollback, stale 40001, unauthorized actor, concurrent receipt replay |
| Comment | PASS: real insert/audit rollback, native access and receipt replay |
| Contribution create | PASS: real audit rollback leaves no parent/attachments; successful two-file manifest is complete; concurrent replay produces one parent/audit |
| Promotion | PASS: real audit rollback leaves source NOT_PROMOTED and no partial official rows; manager access, reservation exclusion, concurrent replay and natural repeat |
| Storage metadata recovery | PASS: two PostgreSQL sessions prove CANCEL fences late COMMIT; frozen retry rotates token/paths and keeps old manifest; committed receipts never authorize cleanup |
| Project deletion compatibility | PASS: reserved/current/retired paths captured exactly; late attach denied. Additional focused check counts receipt-only comments as well as file receipts, rejects inactive deletion and preserves the project on denial |
| Service tests | PASS: document-lifecycle, milestone-contribution, artifact-mutation, document-repository-access; mock providers only |
| Frontend tests | PASS: artifact-request, i18n and activity-timeline; new test is registered once in the explicit runner |
| TypeScript | Backend and frontend `tsc --noEmit` PASS |
| Text/diff | Strict UTF-8 and whitespace PASS for all 23 changed/new files; Python AST, test registration and `git diff --check` PASS |

The focused runner is `python backend/tests/postgres/run_artifacts.py` (eight groups). `--cleanup-only` runs the additional receipt-count/authorization check without repeating those groups. It reuses the existing verified PostgreSQL 16 harness: separate labelled container, network none, no ports/host volumes, tmpfs, identity/database checks before SQL. Older migrations are installed only to build this isolated test schema; previous test suites are not rerun. Concurrency observes PostgreSQL lock waits using the existing barrier, not timing thresholds. Only owned task containers were removed.

Tests were repeated during relevant Phase34 SQL/code changes, not to rerun unrelated auth/browser/output matrices. Old sequential-compensation mock expectations were replaced with atomic RPC delegation and real PostgreSQL rollback evidence. The previous best-effort promotion-audit expectation was replaced by the requested mandatory rollback assertion, retaining role, metadata, source-file and idempotency checks. Initial test adapter/type/alias-runner failures were corrected; assertions were not weakened to mask an application failure.

## Limits

This patch has real PostgreSQL transaction/locking proof on the existing reconstructed historical fixture schema. Storage/network failures are mocked in these focused service checks. Real Storage byte behavior, browser UI and live schema equivalence were not retested for Phase34. Earlier GoTrue/Storage results are not claimed as proof of this new path. Live SQL/Storage/data, existing user containers and application processes were not touched. No full suite/build, staging, commit or push.

## Manual coordinated rollout

1. Review this migration and `backend/supabase/phase34-preflight.sql`. Run preflight manually on the intended authorized target. Inspect old STAGING/CLEANUP_FAILED/PROMOTING jobs; never force-reset or delete them. Confirm Phase30-33 prerequisites and existing constraints.
2. Pause/drain all old version/review/comment/contribution/promotion writers. Do not mix old sequential writers with the new transaction path.
3. Apply `backend/supabase/phase34-official-artifact-atomic-audit.sql` as one complete BEGIN/COMMIT migration. Do not reapply or edit Phase24-33. The agent has not applied Phase34 to live.
4. Deploy the backend and receipt-enabled frontend together. Preserve the existing service-role environment and authorized routes; no dependency upgrade or configuration of live Storage is required by this patch.
5. Run `backend/supabase/phase34-verify.sql` manually. Verify private grants, receipt shapes and audit uniqueness. Resume writes after coordinated deployment. Perform controlled non-production API/Storage verification before claiming full service UAT.
6. Review unresolved reservations using safe job IDs. The raw receipt manifest is service-only; do not expose it in a monitoring API or paste it into reports.

## Files

- `backend/src/controllers/document.controller.ts`
- `backend/src/controllers/milestone-contribution.controller.ts`
- `backend/src/services/business-audit-projection.ts`
- `backend/src/services/document-lifecycle.test.ts`
- `backend/src/services/document.service.ts`
- `backend/src/services/milestone-contribution.service.ts`
- `backend/src/services/milestone-contribution.test.ts`
- `frontend/package.json`
- `frontend/src/hooks/use-documents.ts`
- `frontend/src/hooks/use-milestone-contributions.ts`
- `frontend/src/i18n/en.ts`
- `frontend/src/i18n/id.ts`
- `frontend/src/lib/activity-timeline.ts`
- `backend/src/services/artifact-mutation.service.ts`
- `backend/src/services/artifact-mutation.test.ts`
- `backend/src/utils/artifact-request.util.ts`
- `backend/supabase/phase34-official-artifact-atomic-audit.sql`
- `backend/supabase/phase34-preflight.sql`
- `backend/supabase/phase34-verify.sql`
- `backend/tests/postgres/run_artifacts.py`
- `frontend/src/lib/artifact-request.test.ts`
- `frontend/src/lib/artifact-request.ts`
- `docs/official-artifact-atomic-audit-rollout.md`

Migration SHA-256: `2b65229f07e8cee032d9491d7529c9e2677a6f52a62bc82e936113c71262e85c`.

Final Git checkpoint: `main / a00e7f6`, 13 modified + 10 new files, empty staging. No task-labelled PostgreSQL containers remain. Git warned about future LF?CRLF normalization for document.service.ts; this is not an encoding/diff-check failure.
