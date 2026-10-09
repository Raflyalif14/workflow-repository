# Project plan approval and PIC diagnosis

Date: 2026-10-09. Repository baseline: `main / 1e6f772`; staging was empty.
Existing Project Detail CTA and readable activity-history changes were preserved.

## Latest conclusion: frontend/DTO regression

The actual project detail/list response mapper omitted `pic_revision` despite
the query already selecting its exact text alias. Both frontend plan review
dialogs therefore stopped at Review decision before confirmation or fetch,
displaying the generic uncertain-operation message. Chrome with the actual
pre-fix mapper reproduced that error with zero mutation requests.

The mapper now exposes the exact server revision; local missing-data and request
preparation errors are distinguished from uncertain mutation responses. Both
actual browser workspaces pass confirmation/cancel and request/retry checks.
Detailed evidence and validation: [plan/PIC browser verification](plan-pic-browser-verification/README.md).
No live approval was retried, so live approval UAT remains unverified.

## Initial diagnosis and operation-state observation

The actual path is `PlanReviewDialog` → `useReviewProjectPlan` →
`POST /projects/:id/plan/approve` → plan controller/service →
`review_project_plan_pic_atomic`. The dialog retains the selected PIC, note,
captured revision, approval ID and request UUID after an unconfirmed operation.

`runPicMutation` previously mapped an RPC transport failure, empty response, or
unrecognized database/PostgREST error to HTTP 503 / `PIC_UNAVAILABLE` without
logging the underlying code. The frontend also uses this generic message for
unmapped errors. The visible message alone therefore does not identify the
failed request's HTTP status or prove a transaction failure.

Authorized GET-only reads of existing live metadata returned HTTP 200. The
latest pending project matching the earlier screenshot was still DRAFT,
not postponed, with a PENDING current-phase approval, no current PIC, and no
PLAN_REVIEW receipt at inspection time. Its phase identity was READY and its
PIC revision was 1. This is evidence that this approval had not committed at
that read, not permission to retry a live mutation. No live project IDs,
recipient data, notes, credentials or Storage paths are stored in this report.

The live REST schema exposes the public RPC with the expected argument names.
Schema visibility does not prove that its installed body, triggers or EXECUTE
permissions match the repository. The failed request's HTTP status, SQLSTATE,
constraint and backend log were unavailable. No live RPC was invoked.

**The live root cause is not yet established.** The repository RPC succeeded
against real isolated PostgreSQL; no corrective SQL migration is justified by
the current evidence. Deployment drift and transport errors remain possibilities,
not proven causes.

### Installed function hash comparison (2026-10-09 follow-up)

The operator reported live SECURITY DEFINER / pinned search_path / permissions
matching expectations for the three functions and an enabled `guard_pic_revision`
trigger (`O`). These are operator-provided catalog results, not another live
query run by this task.

A fresh owned PostgreSQL 16 cluster installed the existing harness schema up to
Phase 33. Only function metadata was read; business tests were not repeated and
Phase 34 was not installed. The hashes below are from actual installed `prosrc`.

| Function | Harness prosrc (LF) | Harness body converted to CRLF = reported live hash |
| --- | --- | --- |
| review_project_plan_pic_atomic | eb22d2401c2998617b02ce40908d1f68 | 2398e516d7e906e05cb4dfff673db1f3 |
| review_project_phase_plan_phase24_core | 256e97fd3502315303ec9c0e7df5fb1f | 46c2a67754996f5cca8611a1e99b7ef3 |
| queue_pic_operation_notification | 8e0badffc6a9cd40fb82b8160fe81cfe | 19ee17484a5ec05d147e7d54975a6e7b |

All three reported live hashes also exactly match their repository source bodies
with CRLF line endings. Python `Path.read_text` used by the harness normalizes
those line endings to LF. Converting only the installed harness body's LF back
to CRLF reproduced each reported live hash exactly. The differing raw hashes
are therefore accounted for by line endings; no business-body discrepancy was
found for these functions. This does not prove parity of other schema objects,
PostgREST resolution/cache or the failed request's transport and parameters.

The owned cluster was stopped and removed. No SQL correction or migration was
created. The original HTTP/SQLSTATE/constraint evidence is still needed to
establish the live failure's cause.

## Scoped changes

- `backend/src/services/pic-mutation.service.ts`: log only allowlisted operation,
  validated request UUID, failure category and SQLSTATE/PostgREST code for an
  unconfirmed operation. Never log raw message/details/hint, actor/PIC, notes,
  tokens or request body. Existing HTTP mapping and RPC payload are unchanged.
- `backend/src/services/pic-mutation.test.ts`: verify safe diagnostics, existing
  status/code mapping and unchanged replay identity.
- `backend/supabase/project-plan-pic-diagnostics.sql`: read-only SELECT queries
  for approval/PIC/receipt state, installed function hashes/permissions, the PIC
  trigger and relevant constraint definitions. This is not a migration.
- `backend/tests/postgres/local.py`: isolated Windows PostgreSQL 16 adapter using
  existing fixture/bootstrap infrastructure. Verifies database name, owned data
  directory, major version and loopback-only listener before SQL.
- `backend/tests/postgres/run_plan_pic.py`: actual plan/PIC RPC and transactional
  tests, using synthetic data and two PostgreSQL sessions for contention.
- This report.

## Validation

| Check | Result and scope |
| --- | --- |
| Actual RPC permission, inactive PIC, stale approval/revision | PASS: SQLSTATE 42501 / 22023 / 40001; no database changes |
| Injected final plan audit failure | PASS: SQLSTATE 23514; approval, project/PIC, phase, milestones, assignments, audit, notification intents and receipt all rollback |
| Approve with PIC; same-request lost-response replay | PASS: ACTIVE + approved plan; replay does not change persisted state; conflicting payload rejected |
| Four in-app/Telegram preference combinations | PASS: inserts match independent channel preferences; no external delivery |
| Reject plan | PASS: stays DRAFT without PIC assignment |
| Two concurrent identical requests | PASS: observed database lock waits; one assignment, receipt and plan audit; second response is replay |
| Read-only diagnostic SQL | PASS: executed only against isolated fixture database to validate syntax |
| Backend pic-mutation, phase-plan-review, pic-assignment-atomic tests | PASS; mock HTTP/database checks complement the real PostgreSQL tests |
| Frontend pic-assignment-request test | PASS: cancel/confirm, click latch, retained selection/locale/request, stale conflict reload and invalidation |
| Backend TypeScript | PASS: `npx.cmd tsc --noEmit` |
| Encoding / whitespace | PASS: strict UTF-8 on 19 changed/new text files, Python AST, new-file whitespace and `git diff --check` |

The initial channel fixture failed with SQLSTATE 23505 because two synthetic
recipients reused one unique Telegram chat ID. Only the fixture was corrected
to use distinct synthetic IDs; application assertions and business SQL were
not relaxed. The corrected run passed all six PostgreSQL groups.

Docker's engine pipe was unavailable. Installed PostgreSQL 16.3 was used with
a fresh owned cluster, random loopback port and synthetic database. Existing
containers and user PostgreSQL services were not operated. Phase 34 was not
installed or retested. Owned test clusters were stopped and removed.

Run the focused PostgreSQL test again when related code changes:

```powershell
Set-Location -LiteralPath 'D:\Workflow Repository System'
python backend/tests/postgres/run_plan_pic.py
```

This requires the existing PostgreSQL 16 Windows binaries. It does not connect
to Supabase, GoTrue, Storage or a user database. Fixture schema/bootstrap is not
proof of installed live schema parity or end-to-end Head SA browser success.

## Manual next step; no mutation replay requested

1. Keep the preserved dialog selection/request identity. Do not issue another
   live approval merely to collect an error.
2. An authorized database administrator can run the SELECT-only diagnostic file,
   replacing its NULL project/request parameters with IDs from existing evidence.
   Pending plan + absent PIC/receipt is uncommitted at the read; an existing
   receipt must be reconciled with current state before any retry decision.
3. Compare public RPC / private-core permissions and function definitions with
   Phase 27 and dependencies. Public RPC needs service EXECUTE; authenticated
   clients and service callers must not directly execute private cores. A body
   hash is an inventory value, not a standalone equivalence check.
4. Use an already-recorded failed-request log if available. The updated backend
   safely records future unconfirmed operations as DATABASE_OR_API, TRANSPORT or
   EMPTY_RESPONSE, with a request correlation UUID and code when supplied by the
   provider. Starting the latest backend is an operator action, not a claimed fix.
5. Only after the specific failed operation/code or installed-definition drift
   is proven, prepare a focused additive migration or application correction.
   Do not edit installed migrations, repeat Phase 34, delete receipts, or remove
   Storage objects to bypass uncertainty.

No stage, commit, push, live SQL, live mutation or Storage operation was performed.
Final Git state remains `main / 1e6f772`, staging empty, with the previous UI
changes and this diagnostic/test work intentionally left in the worktree.
