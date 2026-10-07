# Phase 27: atomic PIC assignment

## Confirmed code findings

- AssignmentPhase5Service formerly updated projects, inserted history, updated
  milestones, then activated/progressed work as separate requests. Compensation
  could itself fail; legacy project writes had no CAS and V2 compared only PIC,
  which misses A → B → A. Activity was best-effort after mutation.
- Non-phase V2 plan approval used separate approval/history/milestone/project
  writes with compensation. Phase 24 plan approval was already atomic; its SQL
  body is preserved as a private core, called inside the Phase 27 transaction.
- PIC notifications formerly were best-effort service sends. Failure was swallowed
  (not a mutation failure), but intent was not guaranteed durable. Phase 27 queues
  notifications/deliveries in the mutation transaction.
- Phase 25 Continue already serialized the Sales decision with a project lock.
  Phase 27 preserves that policy and records the PIC reset/revision in its same
  transaction. New-project Phase 24 initialization also participates in revision.
- Progression could fill an empty milestone PIC from an old project snapshot.
  An additional null-PIC CAS prevents overwriting a newer committed assignment.

## Model, access, writes

Project `pic_revision` starts at zero for existing records. A trigger increments
it on PIC OR active-phase changes, protecting A → B → A and phase resets. It
rejects old direct PIC writers and direct revision manipulation. Initial phase
creation advances it too. No legacy project/phase is classified or backfilled.

`assign_project_pic_atomic` keeps HEAD_SA-only assignment, active actor and active
SA target (or Head SA assigning themself), ACTIVE project and explicitly false
postponed flag. READY projects require a valid ACTIVE phase; LEGACY_REVIEW stays
unclassified. V2 requires the latest approved plan in that phase. Reassignment
requires a reason. Same-PIC is a no-op after CAS, with no history/audit/intent.

Lock order is project → users sorted by ID → active phase → approval → milestones
sorted by ID. Standalone assignment does not take the approval row lock; project
lock serializes the approved-plan decision writer. Previous phases and
COMPLETED/APPROVED milestones retain PIC. SA (and eligible self-Head-SA) stage roles
are used; phase/stage IDs are explicit, never matched by stage display name.
Legacy Assign PIC uses canonical Phase 2 step 5/HEAD_SA fallback when stage_key is
absent. Preflight must classify noncanonical legacy templates before rollout.

The transaction includes project/active-phase PIC sync, eligible milestones,
assignment history with phase_id, before/after activity metadata and durable
notification intents. All errors propagate and roll back. Output/file/version
tables are not touched. Plan approval additionally includes decision, first-stage
activation and project status. Legacy non-PIC plan workflow remains unchanged.

`project_pic_requests` stores idempotent operation receipts, not another audit
system. A separate receipt is necessary for no-op and rejected-plan operations
that must not create PIC history/audit. PK is project/request UUID. Actor, normalized
payload and original result are committed with the operation. Same request and
payload replays; altered payload or revision conflicts. Replay rechecks active
actor, access, eligibility and phase; response current_pic_id/revision/status are
read from the latest locked project, not the historical result. Frontend only
invalidates and refetches; it never writes a replayed PIC into cache. Receipts have
project ON DELETE CASCADE; no Storage references. History phase FK preserves its
project deletion ordering (assignments deleted before phases/project).

Stable error codes: PIC_FORBIDDEN (403), PIC_INVALID (422), PIC_CONFLICT (409),
PIC_NOT_EDITABLE (409), PIC_UNAVAILABLE (503). Provider diagnostics are not returned.
Session actor never comes from request payload. Revision is transmitted as decimal
text to avoid JS precision loss. Old request contracts fail closed after rollout.

## Notifications and UI

Existing notifications plus notification_deliveries are the durable intent/queue.
In-app off/Telegram on creates a hidden notification plus retryable Telegram job;
in-app on/Telegram off creates visible notification only; both on create both;
both off create neither. Telegram also requires linked chat. Recipient language
uses preferred_language; English is default. No token/chat ID/provider error is
returned by mutations. No email/Telegram HTTP request occurs before commit.
Delivery failure after commit is handled by the existing Telegram retry worker.
This guarantees committed intent, not eventual external delivery.

Assignment card and both plan dialogs retain selection/reason across transient
errors and locale changes. They capture revision while reviewing, show old → new
PIC, require final confirmation and prevent duplicate clicks with a synchronous
latch. Cancel sends nothing. Retry retains request UUID/value/revision. Changed
choice creates a new intent. Conflict refreshes state and requires another review
and confirmation; it never automatically resubmits using a newer revision.
Successful/replayed operations invalidate detail, milestones, history, activity,
project lists, Dashboard and approval/assignment task queries.

## Manual rollout: no SQL executed by agent

1. Review Phase 24–26/auth/session/Dashboard work separately. Confirm required
   migrations are deployed. Run phase27-preflight.sql read-only. Classify any
   inconsistent PIC/history/stage/phase rows manually; no repair/backfill is bundled.
   We have no measured live inconsistency count.
2. Stop every old backend instance/PIC writer (including plan approval). Pause
   user mutations during maintenance. Take the normal database backup.
3. Apply phase27-atomic-pic-assignment.sql transaction manually. It adds receipt
   table, revision, audit metadata/history phase field, private SQL helpers/RPCs,
   replaces initializer/Continue bodies only in this NEW migration, and renames
   Phase 24 review function to a private core. The older frontend/backend cannot
   safely perform PIC writes afterward; do not run mixed writer versions.
4. Deploy new backend then frontend together before reopening mutations. Reads
   need new projection columns; the new backend cannot precede Phase 27. Old
   tabs must reload. Worker uses the existing retry queue; no migration rerun.
5. Run phase27-verify.sql. Query mismatches must be empty; review any preexisting
   discrepancies instead of automatically changing them. Verify RPC/helper grants.
6. In a controlled database environment, manually test genuine rollback for
   failing history/audit/notification/receipt writes, two sessions with the same
   revision, ABA, duplicate UUID, conflicting UUID payload, no-op, lost-response
   retry, initial + tender + legacy plan approval, new project initialization and
   Continue PIC reset. Check prior-phase files/history remain readable. Verify
   all four channel combinations and post-commit Telegram failure/retry.
7. Check legacy progression and the stale next-milestone guard. Ensure configured
   project-deletion RPC still deletes assignments before phases and receipts
   cascade when project is deleted. This task performs no deletion/Storage test.

Do not roll back to old writers while Phase 27 guards/schema remain enabled.
Rollback requires a reviewed coordinated deployment/migration plan. The agent
does not claim PostgreSQL rollback/concurrency or live UAT from mock/static tests.

## Target validation and changed files

New backend tests: pic-assignment-atomic.test.ts (local HTTP with mocked auth/DB,
transaction contract model, channel/replay cases and SQL structure), and
pic-progression-race.test.ts. Frontend pic-assignment-request.test.tsx exercises
actual card/approval handlers and query invalidation using retained hook slots;
it does not replace browser keyboard/layout testing. Old compensation-specific
test fixtures are replaced by the transaction contract test; legacy plan and
actor/target/read-surface tests are retained. Frontend explicit runner includes
the new test; backend discovers test files automatically.

- Backend controllers: assignment-phase5, project-plan-approval.
- Backend services/tests: assignment-phase5; project-plan-approval;
  pic-assignment-notification.test; phase-plan-review.test; pic-mutation;
  pic-assignment-atomic.test; pic-progression-race.test; project-activity;
  project-management; workflow-progression.
- Validators: assignment-phase5, project-plan.
- SQL: phase27-atomic-pic-assignment, phase27-preflight, phase27-verify.
- Frontend: package.json; projects/[id]/page.tsx; approval-action-dialog;
  pic-assignment-card; use-approvals; use-projects; en/id dictionaries;
  activity-timeline; types/project; pic-assignment-request and its test.
- Documentation: this file. Existing hunks in mixed files are retained; Phase
  24–26 SQL, auth/session files and Dashboard implementation remain unchanged.

## Completed validation and limits

- 17 targeted backend test files passed, including actual local HTTP middleware
  with mocked providers, PIC/plan transaction contracts, progression race and
  existing Telegram retry worker. Seven targeted frontend test files passed.
- backend/frontend tsc --noEmit passed; strict UTF-8 and whitespace checks passed
  for all task files; git diff --check passed.
- telegram-delivery.test.ts fails at its existing Test 10: unexpected table users.
  Its mock omits the locale lookup by NotificationService.createNotification.
  The same error was reproduced using HEAD 1347244 versions of BOTH the test and
  notification service compiled in memory, without checkout/reset or edits. The
  test and notification implementation are unchanged in this task; no assertion
  was changed to conceal this preexisting failure. Earlier delivery cases pass.
- Local app and backend health return HTTP 200. No authenticated browser UAT,
  database SQL execution or live mutations were performed. HTTP health alone
  does not verify deployment, schema, transactions or UI behavior.
- 97 dirty files were hashed before edits; 81 remained byte-identical, while
  16 mixed files received scoped changes. All 33 protected baseline auth/session,
  Phase 24-26 SQL and Dashboard files checked retain their SHA-256 hashes.
