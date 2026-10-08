# Isolated PostgreSQL verification

Baseline: `main / 1e5892c`, clean index/worktree. PostgreSQL 16.15 from the existing
`postgres:16-alpine` image. The repository's rollout references PostgreSQL 16;
the live Supabase server version was not inspected or asserted to be identical.

## Isolation and reproduction

Run `python backend/tests/postgres/run.py` from the repository root. It needs
Python stdlib, Docker Engine and the existing `postgres:16-alpine` image. It does
not read connection URLs, `.env`, user credentials or production fixtures.

The runner creates a unique labelled `workflow_pg_test_*` container/database,
uses `--network none`, read-only root, tmpfs database/runtime directories, no
published ports and no host/other-container volumes. Before every SQL batch it
checks container ID/name/run label, image, networking, mounts, exact database
name and PostgreSQL major version. Only that container is removed in `finally`.
Existing containers, including the user's `magang` group, are not operated.

Platform `auth.users`, `auth.uid()` and `storage.buckets` are explicit test
stand-ins. Historical deadline/activity tables, numeric(18,2) and CREATED status
prerequisites are reconstructed in fixture SQL because their original complete
DDL is absent from this checkout. Current migrations/RPCs/triggers execute
unchanged; this is not a faithful recreation of all hosted Supabase services.
Storage paths are synthetic metadata; no Storage server or file bytes are used.

## Actual results

| Check | Result | Evidence / limit |
| --- | --- | --- |
| Sharing audit failure | PASS | Injected 23514; setting, revision, receipt and audit rolled back |
| Sharing authorization/no-op/replay | PASS | Real service/authenticated roles; invalid/inactive actors denied; unchanged setting skips audit |
| Sharing competing decisions | PASS | Two sessions; actual lock waits observed; one CAS winner, loser 40001; same receipt replay commits once |
| Draft edits and rollback | PASS | ADD/REMOVE/REPLACE create no History; injected audit failure rolls back registry/ref/revision/receipt |
| Submit | FAIL before fix, PASS after Phase33 in test | Actual 42702 in Phase30 wrapper; alias-qualified query fixes it |
| Snapshot submit rollback | PASS after fix | Injected audit failure leaves no snapshot/refs/status/intent/receipt |
| Snapshot immutability | PASS | SQL updates/deletion rejected by actual triggers with 22023 |
| File revision review | PASS | One marker; unmarked file retained; unchanged marker rejects submit; replacing ID allows submit; old snapshot remains intact |
| Review rollback/staleness/replay | PASS | Injected audit failure rolls back status/markers/receipt/intent; stale review 40001; receipt replay adds nothing |
| Concurrent draft/submit/review | PASS | PostgreSQL lock waits; stale draft CAS loses; concurrent same receipt makes one snapshot/review/audit |
| Repository policy | PASS | Shared valid Approved across phases, future Approved, native roles, inactive denial, draft privacy, legacy grants ignored and revoke |
| Phase23 tracking | PASS | Referenced historical registry path cannot become cleanup; uncertain receipt replay stays PENDING |
| Official results and account guards | PASS | Approved official sharing/revoke, native Sales ownership, inactive manager/anonymous RPC denial and admin non-final output denial |
| Phase31 creation receipts | PASS | Concurrent claim, expired-worker fencing, creation audit failure rollback, concurrent COMMIT/replay makes one project/phase/milestone/output/audit, retained deletion tombstone |

Twelve behavior groups passed across two separately labelled ephemeral databases.
The second database ran only the remaining creation-receipt group; earlier passed
behavior tests were not repeated. Initial numeric precision/CREATED prerequisite
failures belonged to the reconstructed fixture, not proven production failures.
An initial IN_REVIEW edit check used the pre-submit CAS revision; it was corrected
to use the actual database revision (submit increments it), preserving both stale
CAS and status restrictions rather than weakening assertions.

Concurrency uses an advisory barrier after session A's mutation, before COMMIT,
and verifies `pg_stat_activity` lock waits / `pg_blocking_pids` for both sessions.
No timing threshold is used to infer correctness. The gate and connections are
released on failure. Existing mock/frontend/HTTP tests are not re-run wholesale.

Creation START_FILE/STORED_FILE operations simulate already verified Storage
transfers; the PostgreSQL metadata transaction, receipt lock/fence and tombstone
are real. Fixture deletion calls only the metadata cleanup RPC, never Storage.
Both owned containers/tmpfs databases were removed; existing containers retained
their original identities. Backend TypeScript, new Phase33 static test, Python
syntax, strict UTF-8 and tracked/untracked diff checks completed successfully.

An additional Approved tender fixture is inserted by the test administrator to
exercise the repository reader; it does not prove tender-plan approval UI or
Storage upload. Access-token refresh replay remains covered by the previous
HTTP/client tests, not by PostgreSQL. Browser, GoTrue/PostgREST, signed URL/ZIP
bytes, and live rollout remain outside this isolated database verification.

## Confirmed fix and manual rollout

Phase30's submit wrapper counts snapshot files with
`where version_id=v_result.version_id`. The output parameter and column collide,
producing SQLSTATE 42702 at line 7 of the PL/pgSQL wrapper. The failed statement
rolls back core snapshot/status/intent writes; it never proves a Storage failure.

New `phase33-output-submit-column-reference.sql` qualifies that one column as
`vf.version_id`. Its body is otherwise identical, with the same signature,
receipt/audit handling, SECURITY DEFINER pinned search_path and service-only
permission. Phase24–32 remain unchanged. A static test enforces this exact delta.

Phase33 was applied **only in the isolated test database**. Deploy it manually
as one complete BEGIN/COMMIT migration after reviewing the target's Phase30
prerequisites. No frontend/backend API change is required. Check the installed
wrapper contains `vf.version_id=v_result.version_id`, remains service-only and
has no client EXECUTE. This document does not claim the live system is fixed.
