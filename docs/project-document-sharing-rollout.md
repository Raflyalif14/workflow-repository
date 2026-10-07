# Phase 32 - project document sharing

## Behaviour and model

Head SA / Super Admin manage one setting on Project Detail: Share or Do not share.
Sales and SA cannot manage it. Managers retain the native project scope used by
Phase 29 (all projects for these two roles), and the server verifies the actor's
active account/password-change policy on every RPC. No client actor is accepted.

`project_document_sharing` is keyed by project ID; missing rows mean RESTRICTED.
Sharing covers every valid Approved official result and selected output across
all project phases, including subsequent approvals. It never grants Project
Detail, workflow writes, private discussion/feedback or non-final history.
The existing central repository RPC keeps its native owner/current-PIC/manager
conditions and Approved-snapshot/file validation, and reads additional access
only from the project setting. It no longer reads legacy ACL/grants.

The setter locks the parent project, checks the actor, reads a project/request
receipt before CAS, and saves mode/revision, private audit and receipt in one
transaction. No-op stores a receipt without changing revision or adding audit.
An audit failure aborts the whole operation. Same actor/payload/request replays
without a second audit; stale revisions or conflicting receipt payloads return
409 through the server. The frontend retains a request UUID across temporary
failures, preserves selection, and requires a new review after a conflict.
Successful replay refreshes the setting; its historical receipt is not treated
as proof of the current setting after another manager changes it.

Audit reuses `activity_logs.document_access_audit`, stable action
DOCUMENT_ACCESS_CHANGED, source_type PROJECT, object_id project ID, before/after
mode, revision and request ID. Actor is the verified server UID and time is
provided by PostgreSQL. Existing Phase 29 restrictive audit policies and the
private-activity exclusion continue to protect this record. No recipient list
or raw request body is stored. Existing audit/ACL/grant/receipt records are kept.
New sharing settings/receipts cascade on project deletion and introduce no
Storage references. Existing exact-path deletion and cleanup retry stay intact.

Repository categories remain All accessible and My/Assigned projects for Sales/SA;
managers have All accessible only. Badges reflect the project mode. Multi-file
outputs remain one entry. Repository/search/detail/sharing query keys have a
project-sharing-v1 namespace and verified account/session/role. New successful
settings invalidate repository, search and setting metadata. Logout/account
isolation and late-response protection remain in place. Per-source dialogs,
recipient search and frontend mutations were removed. Old access-management
HTTP routes return 410; ZIP's existing URL and permission check are preserved.

## Legacy data and preflight

Live database counts were unavailable; no numbers are fabricated. Manually run
`backend/supabase/phase32-preflight.sql` as an authorized administrator with
complete SELECT/RLS visibility. It returns total ACL/grant counts, the number
of affected projects and project IDs with aggregate sharing/grant counts only.
No recipient identifiers, filenames, contents or Storage paths are selected.

A project is affected if any old ACL is SHARED_INTERNAL or has any grant, even
if its result is currently non-final. Do not infer project sharing from that.
Review every affected project with the responsible manager, then record an
explicit RESTRICTED or SHARED_INTERNAL decision for the whole project. An old
individual grant cannot be retained individually in the new model:

- RESTRICTED keeps only native access and retires all additional old grants.
- SHARED_INTERNAL shares all valid Approved results, not just the old selected
  document. This requires an explicit whole-project decision.

The migration's `legacy_choices` manifest is empty by default. If any affected
project exists, the migration deliberately fails and rolls back until ALL such
projects are explicitly present, with no unrelated projects. Replace only that
empty SELECT with reviewed UUID/mode VALUES before applying this new migration.
The manifest contains no user IDs. Initial classification is recorded as a DB
administrator migration action (`legacy_classified_at/by`), not a fabricated
application-user audit. Keep the reviewed manifest as the deployment record.
Projects without old additional access and all future projects default to not
shared. Old ACL/grants remain stored for investigation but confer no access after
cutover. The migration locks the old ACL/grant tables during classification and
policy replacement, preventing legacy writes from racing past the preflight.

## Manual rollout (not performed by the agent)

1. Review the patch and pending migrations against the installed schema. Phase
   32 directly requires Phase 29; apply other pending prerequisite features in
   their documented order. Do not rerun Phase 24-31 indiscriminately.
2. Run preflight read-only; obtain explicit classification for every affected
   project and populate the manifest. Recheck counts/IDs immediately before
   applying. No result/file/history is deleted.
3. Drain/stop old application instances for coordinated cutover, including old
   per-document writers. Apply the COMPLETE
   `backend/supabase/phase32-project-document-sharing.sql` in its transaction.
   A failed guard means no cutover; do not deploy around it or drop old grants.
4. Refresh the PostgREST schema cache by the normal supported administration
   procedure if the new RPCs are not detected. Deploy backend and frontend
   together, restart the backend, and load the new client bundle.
5. Run `phase32-verify.sql` and the current read-only workflow healthcheck.
   Permission/mismatch checks must have their documented results. Old ACL/grant
   inventories are historical data and are not expected to be zero.
6. In an isolated database/UAT environment, exercise active manager Share/No
   share, future approvals, native/foreign readers, all repository/download
   surfaces, concurrent writes, replay/no-op and audit-failure rollback. Inspect
   the stored private audit and receipts. Do not mutate production sharing just
   to verify this patch. Use existing authorized accounts for read-only UI checks.

No live SQL or migration was executed. Do not revert only the central read RPC
to Phase 29 after cutover: doing so would reactivate hidden old grants. Keep
applications drained for a reviewed fix-forward if deployment fails.
New requests after revocation are denied when native access is absent. Previously
issued signed URLs remain valid until their EXISTING TTL (300 seconds); revocation
is not immediate URL invalidation.

## Validation boundaries

Focused backend tests cover real local HTTP middleware/controllers with mocked
auth/database, safe projections/errors, repository/search/detail/file/ZIP,
native ownership/current PIC and retired writers/grants. A pending output approved
later becomes visible without any per-output sharing write. Phase 32 lock/CAS,
receipt replay, no-op, audit rollback and classification ordering are static SQL
checks, not evidence of PostgreSQL execution or live concurrency.
Frontend tests cover confirmations/cancel, temporary failure/retry UUID,
conflict/review, locale/session isolation, query eligibility/invalidation, existing
Documents tabs/counters and deletion cache. Eight focused backend tests and six frontend tests passed. Both TypeScript
checks, strict UTF-8 and diff whitespace checks passed. Local development
Documents and Project Detail routes returned HTTP 200 without compilation error
markers; that is compilation evidence, not authenticated workflow UAT.
The local browser could not initialize;
no authenticated visual UAT or live database totals are claimed.

## Files changed

- backend/src/services/document-access.service.ts
- backend/src/controllers/document-access.controller.ts (retired management routes)
- backend/src/controllers/project-document-sharing.controller.ts (new)
- backend/src/routes/project.routes.ts
- backend/src/services/document-repository-access.test.ts
- backend/src/services/project-document-sharing.test.ts (new)
- backend/supabase/phase32-project-document-sharing.sql (new)
- backend/supabase/phase32-preflight.sql (new)
- backend/supabase/phase32-verify.sql (new)
- backend/supabase/workflow-healthcheck.sql
- frontend/src/hooks/use-document-access.ts
- frontend/src/hooks/use-repository-session.ts
- frontend/src/hooks/use-projects.ts (delete setting cache)
- frontend/src/components/projects/project-document-sharing.tsx (new)
- frontend/src/components/documents/document-access-dialog.tsx (removed)
- frontend/src/app/projects/[id]/page.tsx
- frontend/src/app/documents/page.tsx
- frontend/src/i18n/en.ts
- frontend/src/i18n/id.ts
- frontend/src/lib/document-access.test.tsx
- frontend/src/lib/document-repository-page.test.tsx
- frontend/src/lib/project-deletion-cache.test.tsx
- docs/document-repository-categories.md (historical notes marked superseded)
- docs/project-document-sharing-rollout.md (new)
