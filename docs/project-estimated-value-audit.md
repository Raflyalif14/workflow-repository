# Estimated project value: audited editing

## Scope and API

Sales owner edits through Project Detail, then confirms the captured old value →
new value. Cancel does not send a request. Only DRAFT/ACTIVE, not postponed,
are eligible. Middleware verifies session/account/role; the RPC rechecks active
Sales ownership and current state under project lock. Read policy is unchanged.
Final contract value and WON/LOST workflow are unchanged.

`PATCH /api/projects/:projectId/estimated-value` accepts only
`estimated_revenue` (decimal string), `expected_updated_at` (server timestamp),
`request_id` (UUID). Generic project PATCH rejects estimated_revenue to prevent
untracked writes. Other generic editing stays available under its existing policy.

Values use the existing numeric(18,2) range: 0–9999999999999999.99, at most two
decimal places. Project reads retain numeric estimated_revenue and add
estimated_revenue_exact via a text cast. The dialog/history use exact text so
large values are not rounded through JavaScript Number. Empty legacy values
are shown as unavailable and audited as JSON null when changed.

## Transaction, concurrency and retries

Phase 26 adds JSON metadata to existing activity_logs, not another audit table.
Action is `PROJECT_ESTIMATED_VALUE_CHANGED`; object type is `PROJECT`, ID is
the locked project ID. Actor is server-supplied and checked in users; timestamp
comes from the database. Before/after come from the row and validated decimal.
No raw request, credentials, user content, or Storage path is recorded.

The RPC locks project, rechecks account/state, checks the request receipt, checks
updated_at, skips identical values, updates the value, then inserts activity.
Audit failure propagates and rolls back the value update. Same request UUID plus
same actor/value/CAS replays the saved receipt. Reusing the UUID with different
parameters is rejected. The activity JSON doubles as the successful change
receipt, with a unique project/request index. No-op requests have no receipt or
audit; they can be repeated while the same CAS still applies. CAS also rejects
changes to other project fields since the dialog opened (conservative conflict).
An explicit reload updates the baseline while retaining the user's new input.

Retries retain UUID/value/CAS while the dialog remains open. After an uncertain
response, retry this unchanged intent before closing/reopening the dialog.
If subsequent work has made the project ineligible, even a replay is denied;
no further mutation occurs and the saved audit remains available in history.

History uses existing paginated activity endpoint and project access policy.
It exposes only before/after, actor, time and stable action; receipt internals
are not returned. No ordinary UI offers editing/deletion of activity records.
Existing authorized project deletion still removes its related activity records.
Successful mutation invalidates detail (including without-activity variant),
project lists, paginated activity and dashboard overview. Failure does not
invalidate as a successful save. No notifications are added by this feature.

## Manual rollout (agent does not run SQL)

1. Confirm existing Phase 24–25/auth/session rollout independently. Review the
   current worktree and deploy these earlier dependencies in their documented order.
2. Run phase26-preflight.sql read-only. Verify numeric(18,2), timestamp presence,
   action column capacity, no action namespace collisions or prior RPC. Inspect
   activity action constraints/INSERT triggers and project timestamp triggers;
   a trigger must not preserve an old updated_at on an actual change. Review
   existing activity RLS: ordinary users must not gain audit UPDATE/DELETE access.
3. Apply phase26-estimated-value-audit.sql manually in its transaction. Do not
   change applied Phase 24/25. All existing rows are retained, with null metadata.
4. Deploy backend, then frontend. The additive schema supports the older app,
   but the new timeline SELECT requires Phase 26 before the new backend runs.
5. Run phase26-verify.sql. Expect no malformed/duplicate/no-op audit rows and
   service_role-only RPC execution. In a controlled test environment verify
   actual SQL rollback, concurrent edits, lost-response replay and history access.
   Local tests use mock database/Storage; they do not prove live migration success.

## Audit inventory for a later stage (not implemented here)

| Path | Existing evidence | Remaining gap to evaluate |
| --- | --- | --- |
| Schedule | project-plan-approval.service records PROJECT_TIMELINE_UPDATED; deadline history/approvals exist | Initial timeline activity is best-effort text, not a uniform atomic before/after audit of every date |
| Scope | sync_phase_output_scope/sync_draft_output_scope transact scope/milestone changes; generic UPDATE activity follows separately | Explicit prior/new selected-key snapshots and an audit in the same transaction are not provided for every scope edit |
| PIC | project_assignments stores actor, previous/new PIC, type/reason/time; assignment service has compensation | Confirm transactional completeness of all reassignment paths; do not duplicate assignment history |
| Decisions | Phase 25 locks decision and inserts stable activity; plan/output approvals hold reviewer/time/feedback | Coverage and before/after snapshots differ per decision; review existing records before adding another audit mechanism |
| Document access | Download endpoints enforce read policy and sign exact file URLs | Signed URL issuance/download access has no comprehensive activity audit; never record signed URLs or Storage paths |

This change completes estimated-value auditing only. It does not claim a complete
business audit, browser UAT or database migration verification.

## Files touched in this task

- Backend: routes/project.routes.ts; controllers/project-estimated-value.controller.ts;
  services/project-estimated-value.service.ts and project-estimated-value.test.ts;
  services/project-management.service.ts; validators/project-management.validator.ts;
  services/project-activity.service.ts and project-activity.service.test.ts.
- SQL: phase26-estimated-value-audit.sql; phase26-preflight.sql; phase26-verify.sql.
- Frontend: package.json; src/app/projects/[id]/page.tsx;
  src/hooks/use-projects.ts; src/types/project.ts; src/i18n/en.ts and id.ts;
  src/lib/activity-timeline.ts; src/lib/project-estimated-value.ts and its
  project-estimated-value.test.tsx; src/components/projects/estimated-project-value.tsx.
- Documentation: this file. Earlier dirty hunks in mixed files are retained;
  auth/session files, Phase 24–25 SQL and Dashboard implementation are unchanged.

## Validation recorded

Seven targeted backend test files passed: estimated-value, activity, detail
activity option, project management, final Sales outcome, dashboard project
values and project creation. Three frontend test files passed: estimated-value,
activity timeline and i18n. The frontend test is registered in its explicit runner.
Backend/frontend tsc --noEmit, strict UTF-8 of all 97 dirty text files, and
git diff --check passed. New untracked task files also passed whitespace checks.

Local app/backend health responded HTTP 200. The existing browser initially
showed Head SA Dashboard, then returned to login before Project Detail inspection.
Sales dialog browser/UAT and actual PostgreSQL rollback/concurrency remain
unverified. No live values, SQL or Storage were modified for validation.
