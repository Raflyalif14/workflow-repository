# Pra-Tender Sales decision (Phase 25)

Phase 24 is retained unchanged. Use the existing project `COMPLETED` status for
Sales closure at Pra-Tender; it does not mean WON/LOST or earned contract revenue.
The Pra-Tender phase stores `sales_decision`, `sales_decided_by` and `sales_decided_at`.
Activity records use `PRA_TENDER_DECIDED`. Closing leaves all phase data, PIC,
scope, schedules, approvals, output snapshots, files and download permissions intact.

## Transaction and replay

Both decision RPCs lock the same project before checking active Sales ownership,
postponement, the saved decision and completion. The first decision wins. The
opposite decision is rejected with SQLSTATE 40001 (HTTP 409). Same-choice retry
returns the persisted phase without duplicate activity or notification records.
Close replay is accepted only for the saved Close decision and COMPLETED project.
Unknown/undecided is NULL and does not perform a mutation. Creating the tender
plan records Yes atomically with scope creation; cancelling scope selection does not.

Closure snapshots the independent channel preferences for active Head SA users and
the PIC in one recipients CTE. `notifications.in_app_visible` stores in-app eligibility;
Telegram-only rows support the existing delivery FK without entering the application
feed. List, unread count, mark-read and mark-all-read APIs filter on this flag before
pagination/count/update. The flag is not included in public payloads. Existing rows and
other producers retain their behavior through the column's `true` default. Reenabling
in-app later does not expose an earlier Telegram-only row. Close retry never reevaluates
preferences or creates new records. The Telegram worker retains its own current
preference check and uses the existing FAILED/RETRYABLE queue with attempt count zero.

| In-app | Telegram (linked) | In-app feed | Telegram queue |
| --- | --- | --- | --- |
| Off | Off | None | None |
| Off | On | None (hidden transport record) | One |
| On | Off | One | None |
| On | On | One | One, referencing the same record |

Missing preferences default to in-app on, Telegram off. An unlinked/blank chat ID is
not eligible for Telegram. The decision, visibility snapshot, notification and queue
insertion remain in the same project-locked transaction; insertion failure rolls back
the decision as well. Existing delivery workers are unchanged.
Dashboard and project lists use their existing terminal-status filters and metrics.

## Existing projects

No backfill guesses actors or decision timestamps. Existing Phase 24 tender phases
retain their activity/history, can replay Continue, and cannot choose Close even
when the newly added decision fields are NULL. LEGACY_REVIEW projects keep their
existing workflow and require the existing manual classification process. Direct
On Submission Tender projects do not acquire a Pra-Tender decision panel.

## Manual rollout

1. Pause phase-transition writes. Ensure Phase 24 is applied, then inspect
   `backend/supabase/phase25-preflight.sql`. Resolve any completion mismatch.
2. Apply `phase25-pra-tender-sales-decision.sql` manually. It is additive and updates
   Continue in the same transaction as installing Close. Do not rerun Phase 24.
3. Deploy backend and frontend together; resume writes only after the notification
   API includes the in_app_visible filters. Apply the schema before starting the new
   API (otherwise its notification queries lack the new column). Do not invoke Close
   while an older API can list notifications; it does not filter hidden records. Do not
   roll back to that API with Telegram-only rows present. Before the new backend is
   live, the old Continue path is protected by the replaced database function.
4. Run `phase25-verify.sql` manually. Keep the read-only deletion investigation
   separate; this migration does not change project deletion or cleanup policy.
5. On an isolated database/test project, verify concurrent Yes/No: exactly one
   outcome, one decision activity, no tender on Close, no duplicate notification
   intent on Close retry, and rollback of all writes if notification insertion fails.
   Verify cancelled confirmation/undecided sends no request. Check approved files
   and prior review history remain readable and downloadable after closure.
   Check all four channel combinations in the table, Close retry without duplicates,
   and turning in-app back on without revealing an earlier Telegram-only record.

Automated validation uses HTTP mocks, React/query execution, and SQL static checks.
No database migration, live mutation or Storage cleanup is executed by the agent.
Database concurrency and browser UAT still require the manual isolated checks above.

## Files in this change

- `backend/src/controllers/project-management.controller.ts`
- `backend/src/routes/project.routes.ts`
- `backend/src/services/notification.service.ts`
- `backend/src/services/phase-output-read.test.ts`
- `backend/src/services/phase25-notification-channels.test.ts`
- `backend/src/services/pra-tender-decision.test.ts`
- `backend/src/services/project-phase.service.ts`
- `backend/supabase/phase25-pra-tender-sales-decision.sql`
- `backend/supabase/phase25-preflight.sql`
- `backend/supabase/phase25-verify.sql`
- `docs/pra-tender-sales-decision-rollout.md`
- `frontend/package.json`
- `frontend/src/app/projects/[id]/page.tsx`
- `frontend/src/components/notifications/notification-bell.tsx`
- `frontend/src/components/projects/project-phases-panel.tsx`
- `frontend/src/hooks/use-projects.ts`
- `frontend/src/i18n/en.ts`
- `frontend/src/i18n/id.ts`
- `frontend/src/lib/activity-timeline.ts`
- `frontend/src/lib/dashboard-ux.ts`
- `frontend/src/lib/phase-review.ts`
- `frontend/src/lib/pra-tender-decision.test.ts`
- `frontend/src/lib/workflow-ux-helpers.ts`
- `frontend/src/types/project.ts`

## Validation completed for this patch

13 targeted backend test files passed (decision HTTP/role checks, simulated RPC
concurrency/replay, phase transitions/review, preserved file/history/download access,
dashboard metrics, repository policy, draft CAS, Phase 22/23 safety, completion retry
and Telegram retry worker). Eight targeted frontend test files passed, including
actual mutation-hook success/error invalidation, pending/closed task eligibility,
EN/ID dictionaries, activity labels and existing workflow/document helpers.
Both TypeScript checks and git diff --check passed. All changed text files decode
strictly as UTF-8. Next development compiled Project Detail and Dashboard; local GETs
returned HTTP 200. No authenticated browser interaction, SQL execution or live database
concurrency test was performed. These remain manual rollout gates.

### Independent-channel follow-up

The channel fix changes the Phase 25 migration, preflight, verification queries,
this guide, the notification service, and its new channel test. Four focused test
files passed: `phase25-notification-channels`, `notification.service`,
`pra-tender-decision`, and `telegram-retry-worker`. Backend TypeScript and
`git diff --check` passed. The channel matrix and Close replay combine static SQL
checks with mocked persistence and the real notification API/Telegram worker;
they do not prove SQL execution or concurrency in a live database.

`telegram-delivery.test.ts` also ran and failed at case 10 because its mock rejects
the localization read from `users`. The same failure was reproduced using the
notification service from HEAD `1347244`; the channel fix only adds visibility
filters to feed/read methods and does not change `createNotification`. This
pre-existing fixture failure remains unchanged.
