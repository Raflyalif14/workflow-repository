# Project creation receipts ? Phase 31

## Scope and confirmed failure boundary

Previously `ProjectManagementService.create` inserted a random project UUID, initialized milestones/outputs through separate requests, then uploaded randomly identified intake files and inserted intake rows one by one. A lost final response or concurrent retry could repeat that entire sequence. Compensation could also remove an object/project whose commit response was uncertain.

Phase 31 changes only create-project and its intake. Phase 24?30, generic mutations, output collections/CAS, document workflows and workers remain unchanged. The current form creates no schedule in this POST: its effective inputs are name, customer, scenario, estimated value, selected scope and intake. Scheduling remains a later existing operation. The existing create flow does not enqueue notification intents; this patch does not introduce one.

## Operation and commit boundaries

1. The existing final confirmation allocates one UUID. The hook holds that UUID, the original FormData and selected File references until a confirmed response with a project ID. Token refresh replays the same multipart body/header. A different account/session discards the client operation identity; token rotation within the same session does not.
2. Active Sales authorization precedes multipart parsing. Missing/invalid `x-project-create-request-id` returns HTTP 422 / `CREATE_REQUEST_REQUIRED`; the server never generates a replacement ID for an old client.
3. After existing intake validation, the server hashes actual buffers using SHA-256. The fingerprint includes normalized effective scalar/scope inputs and each ordered attachment's kind, original filename, MIME, size and content hash. Client hashes are not trusted. Receipt data contains neither tokens nor raw bytes nor signed URLs.
4. Service-only `project_creation_operation` locks a request receipt, verifies its server actor and immutable payload, and reserves one project UUID plus intake IDs/exact Storage paths. Its unique key is the operation's UUID, with immutable actor and `PROJECT_CREATE` type. Another actor cannot use it.
5. A ten-minute DB lease and token fence prevent a second worker from starting the same transfer. The lease is renewed at file transitions; there is no database transaction held across Storage transfer. Expired workers cannot advance metadata with their old token. BUSY requests receive HTTP 409 / `CREATE_IN_PROGRESS` and retain their operation.
6. Each intake file transitions `PENDING -> UPLOADING -> STORED`. START_FILE is committed before transfer. Storage upload keeps `upsert:false`. A lost/failed transfer response is reconciled by downloading only the reserved exact object and checking server SHA-256 and size. Already-STORED files are not transferred again.
7. COMMIT is one PostgreSQL transaction: project INSERT and existing Phase 24 initial phase/Phase 30 creation audit triggers, ordered milestones, selected outputs, every intake row, and success receipt. Any audit/constraint failure rolls back the metadata transaction. Receipt success cannot precede these writes.
8. Replay of COMMITTED performs active actor/current ownership checks and reads current authorized project, milestones and intake. It does not initialize anything or cache a historical response. Lists/Dashboard are invalidated. A deleted project's receipt remains a tombstone and returns HTTP 410; it cannot recreate that project.

Receipt tables are private/RLS protected; service_role has SELECT but no direct mutation privilege. All writes use the SECURITY DEFINER RPC with actor/fence checks. No FK cascades the receipt on project deletion. Existing deletion still gathers committed intake's exact paths through its existing attachment rows.

## Failure recovery and explicit limitations

- Before START_FILE: after release/lease expiry, the same request resumes unstarted files using reserved IDs.
- Upload succeeded but file-state response was lost: retry probes the exact object, validates hash/size and continues, without a new transfer.
- Some files are STORED: they are skipped; the same receipt proceeds with remaining files and finalization.
- COMMIT result or readback response was lost: retry finds COMMITTED and returns the same project's current state.
- Backend restart: DB receipt/manifest/lease, not a process-local Map, determines recovery. An unexpired lease remains busy until expiry.
- An UPLOADING object that is absent, mismatched or unreadable stays uncertain. There is an unavoidable crash window between the START_FILE commit and sending bytes to Storage. Absence alone cannot prove a delayed transfer will never arrive. This implementation intentionally **does not automatically re-upload or delete** in that case. `CREATE_STORAGE_UNCERTAIN` keeps the operation/input frozen and requires reconciliation.
- A changed/deactivated actor or changed workflow configuration cannot finalize silently. Stored pre-commit objects remain tracked in the private manifest. No automatic abandoned-intake cleanup or output-cleanup RPC reuse is introduced.
- Client UUID/FormData retention is in memory, not durable across browser reload/navigation. The UI warns against reloading or creating a replacement while the outcome is uncertain and displays the safe operation UUID. Administrative lookup by that UUID is required if browser files/state are lost. This patch does not claim full browser-restart recovery.
- Storage and PostgreSQL are not one distributed transaction. The metadata/success receipt boundary is atomic; full transfer atomicity is not claimed.

For unresolved operations: stop/fence every writer first, verify the private receipt and live metadata under privileged read access, reconcile **individual exact paths** and hashes internally, and confirm there are no legitimate references. Do not put paths/hashes/user content in client errors or public logs. Do not infer orphan status from a timeout or delete by prefix. An administrative recovery/abandonment procedure with proof of writer termination is separate follow-up work; do not manually reset UPLOADING to PENDING while an old transfer may still arrive.

## Manual rollout (agent has not executed SQL)

1. Confirm Phase 24?30 are already applied. Run `backend/supabase/phase31-preflight.sql` manually. Review trigger existence, scenario/model/stage mapping, duplicate active stage keys, and service/client write privileges. Do not fabricate historical receipts.
2. Enter a create-write maintenance window. Drain/stop **all old backend create writers** and hold old browser clients. An old instance lacks the required receipt and cannot be mixed with new instances during rollout. Existing unrelated workflows follow normal deployment policy.
3. Apply `phase31-project-creation-receipts.sql` once, manually. Do not reapply earlier migrations. Verify function/table privileges and guards with `phase31-verify.sql`.
4. Deploy the new backend and frontend together. Old clients without the header now get explicit 422 and must reload the application before starting a new operation; never bypass that check with generated IDs. Resume create writes only when every instance uses the new path.
5. In an isolated database/Storage environment, verify actual transaction rollback on audit failure, concurrent same-ID requests across two backend instances, lease expiration/fencing, partial transfer, lost commit response, owner/account change and deleted-project replay. Compare project/phase/milestone/output/intake/audit counts; no notification intent should be introduced by create.
6. Run verification read queries after fixtures. Review uncertain PROCESSING/UPLOADING jobs internally by safe job IDs; no Storage cleanup is performed by this patch.

## Focused validation and limitations

The new backend test executes real orchestration/controller code against isolated mocked RPC/Storage and verifies source-level transaction/privilege guards. The frontend test exercises the request helper, actual hook, auth replay and existing confirmation handlers with fixtures. These are not proof of live PostgreSQL locking, trigger installation, Storage recovery or browser UAT. Recorded command results belong in the task report; this guide does not assume migrations or runtime checks have passed.

New frontend test is registered in the existing explicit npm runner. Existing intake validation and shared confirmation tests remain applicable. No full build/full suite or live create/upload is required for this task.

## Files in this task

New: `backend/src/services/project-creation.service.ts`, `backend/src/services/project-creation-receipts.test.ts`, `backend/supabase/phase31-project-creation-receipts.sql`, `backend/supabase/phase31-preflight.sql`, `backend/supabase/phase31-verify.sql`, `frontend/src/lib/project-create-request.ts`, `frontend/src/lib/project-create-request.test.tsx`, this guide.

Extended (already dirty): `backend/src/services/project-management.service.ts`, `backend/src/services/project-creation-documents.test.ts`, `backend/src/controllers/project-management.controller.ts`, `backend/src/routes/project.routes.ts`, `frontend/src/hooks/use-projects.ts`, `frontend/src/app/projects/new/page.tsx`, `frontend/src/components/projects/business-confirmation.tsx`, `frontend/src/i18n/en.ts`, `frontend/src/i18n/id.ts`, `frontend/package.json`.

## Checkpoint from this implementation session

- Baseline/final branch: `main`; HEAD `1347244f21b4007fa6e6e239172b579790408969`; index empty.
- Initial snapshot: 193 dirty paths. 183 remain byte-identical; 10 intentionally extended; none removed. Eight task-only files added. All existing Phase 24?30 files remain byte-identical.
- Passed targeted commands: backend `project-creation-receipts.test.ts`, existing `project-creation-documents.test.ts`; frontend `project-create-request.test.tsx`, shared `business-audit.test.tsx`, `i18n.test.ts`; backend/frontend `tsc --noEmit`; strict UTF-8 on dirty text; `git diff --check`.
- New receipt/frontend tests and both TypeScript checks were rerun after their relevant implementation changes; already-passing unrelated tests were not repeated. Frontend runner includes the new test once; backend runner discovers `.test.ts` automatically.
- No listener found on expected local ports 3000/5000. No browser/live PostgreSQL/Storage verification was performed, no SQL applied, and no data mutated. The durable concurrency/recovery guarantees require the isolated integration checks above before production rollout.
