# Phase 22 output file collections

One output owns an editable draft reference list. The immutable file registry records each uploaded object once. Submit atomically creates one version and copies the exact draft references into the version snapshot; no Storage bytes are copied. Review continues to approve or revise the whole output. Removing/replacing a draft reference does not remove an object or mutate earlier snapshots. Unreferenced uploaded registry entries are retained until project deletion.

Limits are 10 files, 200 MiB per output, and 50 MiB per file, enforced again inside the mutation/submit RPCs. Actor activity, role, both project and milestone PIC, selected scope, stable stage mapping, project status/postponement, milestone status and start date are checked at persistence. Review retains HEAD_SA-only access; SUPER_ADMIN gains no draft/review permission.

## Legacy history

All existing version IDs, version numbers, files, review decisions, feedback and notification references are preserved. Every legacy version receives one file reference. `submitted_at IS NOT NULL` or status `IN_REVIEW`, `REVISION_REQUIRED`, or `APPROVED` establishes `LEGACY_SUBMITTED`. Other historical uploads are marked `LEGACY_UPLOAD_UNCONFIRMED`; a DRAFT upload is never silently counted as a submitted review version. The application identifies this legacy group separately. New versions use `SUBMITTED`, and only submit creates them. Original numbering is retained, so the next submitted version may have a number larger than the number of review snapshots.

Unknown legacy file sizes remain unknown. Already-reviewed files remain downloadable. An editable legacy file with unknown size must be replaced before new submission to enforce the total-byte limit reliably. Preflight lists affected output IDs.

## Retry and Storage

Draft request IDs record a receipt and compare actor, action, expected revision, target file, name, size, MIME type and SHA-256. Retry returns the persisted result/current draft revision; it cannot duplicate a successful upload or silently reuse an ID for different bytes. Submit compares request ID, actor, expected revision and trimmed note; replay returns the same immutable version even after review, with `created = false` and no status write, new notification intent or completion operation.

Storage and database transactions are separate. Phase 23 adds the service-only `record_output_upload_outcome` RPC. Storage errors (whether before or after storing bytes), rejected metadata transport and unconfirmed metadata responses capture the exact attempted path as `PENDING` / `OUTPUT_UPLOAD_UNCONFIRMED`; they do not prove absence or authorize deletion. A confirmed PostgreSQL transaction failure, or an unreferenced losing concurrent attempt, can create a `FAILED` receipt for the existing SUPER_ADMIN cleanup retry. No request immediately deletes Storage objects. A pending uncertainty is never promoted to retryable by a later tracking call.

The RPC takes the same project/output locks as persistence and checks the immutable registry and every other document source before recording cleanup. Registry foreign keys protect draft and snapshot references. A referenced object returns no cleanup job, including when a successful metadata response was lost. Tracking an unused authorized upload does not require the PIC, project status or account activity to remain unchanged after Storage succeeds. Its generated `output-documents/{projectId}/{documentKey}/{uuid}-{name}` object must belong to the exact project/output namespace. A concurrent project deletion is accepted only when an existing deletion receipt proves that project was deleted. Every recorded cleanup path remains unavailable to the draft RPC, even after cleanup completes, so a delayed metadata request cannot attach already-deleted bytes.

If tracking itself fails, the backend emits only operation, project/output/request IDs, uncertainty and the generated upload-attempt UUID. It does not log the path, filename, provider error, credentials or content. In that case durable exact-path capture is **not guaranteed**; an authorized operator must resolve that attempt using restricted Storage/provider records. Never delete by prefix. Normal application retry uses a new attempted object path when no committed receipt exists, preserving the uncertain object for investigation.

Upload/remove replay checks the existing receipt before operational guards, while the RPC still checks active account, role, project/output identity, both PIC assignments and the complete original actor/action/revision/target/file fingerprint. Completion, postponement and final project status do not invalidate an otherwise authorized receipt. Replay returns the actual current output status and performs no additional Storage upload, draft write, history, activity or notification. A new request retains all active-project, milestone/start-date, scope and CAS guards.

### Download all boundary

Download all accepts at most **100 MiB of verified source bytes per request**, checked before signing or fetching any Storage object. Every selected approved output must have a valid current APPROVED snapshot and all its file references. Unknown/non-positive legacy sizes or invalid snapshots reject the entire archive; per-file download remains available. Real response bodies are read incrementally with the declared size as a hard bound and must match that size exactly. Missing or mismatched objects fail the whole request rather than returning a partial ZIP. EN/ID errors explain the limit or the per-file alternative.

ZIP creation still buffers source and compressed output, so peak memory exceeds 100 MiB, but source bytes and transient copies are bounded per request. This does not impose a process-wide concurrency budget. Streaming ZIP or request concurrency limits would be separate work if actual measurements justify them.

Project deletion captures every distinct registry path, including historical and removed draft files. Objects referenced by another project, official document, intake or contribution source are excluded. Snapshot-delete triggers permit only the admin-validated project-deletion transaction or cascading deletion after the parent project disappears. No migration performs Storage deletion; cleanup uses explicit object paths, never a prefix.

## Manual rollout

1. Verify existing migration state. Prerequisites are Phase 13, Phase 17 for language preferences, Phase 18a, Phase 19, Phase 18b, Phase 20 and Phase 21. Preserve their documented deployment order; do not rerun applied migrations. Phase 18b must follow retirement of its old submission writers.
2. Save the read-only results of `backend/supabase/phase22-preflight.sql`. Resolve either mismatch query if it returns rows. Review unknown legacy-size IDs and classification counts. This migration deletes zero legacy rows and zero Storage objects.
3. Pause output mutations and project deletion. Stop all old backend instances before applying Phase 22: old upload code writes Storage before its old version RPC, so merely disabling its RPC while leaving those instances active is insufficient.
4. Apply only the new `backend/supabase/phase22-output-document-file-collections.sql` manually. The transaction expands the schema, backfills references, replaces submit/review/deletion behavior, disables the old upload-version RPC and establishes permissions/immutability together.
5. Deploy the matching backend and frontend together; resume mutations only after both use the collection contract. Keep the existing notification worker and its Phase 21 delivery RPC unchanged.
6. Run `backend/supabase/phase22-verify.sql` manually. Check invariants, service-role permissions and all three enabled immutable triggers. Verify one allowed PIC draft, snapshot submission, whole-output review, revision history, authorized per-file download and approved Documents entry in a test project when authorized.

Database/browser execution is a separate rollout check. Static tests and TypeScript checks do not prove that the live schema, Storage or PostgreSQL triggers have been exercised. Rollback must keep the write pause until a compatible backend is available; do not restore an old upload writer or rerun old migrations over Phase 22.

### Phase 23 rollout (Phase 22 already applied)

1. Do **not** rerun or edit Phase 22. Pause output writes and project cleanup retries; drain/stop backend instances using the previous upload cleanup behavior.
2. Review and apply only `backend/supabase/phase23-output-upload-outcomes.sql` manually. Its prerequisite guard rejects a Phase 22 draft RPC missing protection against all captured cleanup paths. It adds one service-role-only function; no queue, draft, version or Storage object is deleted.
3. Deploy the updated backend, then frontend with the EN/ID archive errors and actual-status receipt type. Resume writes only when Phase 23 exists and all backend instances use the new recorder. Existing notification workers and retry policy stay unchanged.
4. Check permissions and uncertain jobs with read-only queries below. Database/Storage fault injection remains a separate authorized test-environment check. Keep uncertain `PENDING` jobs unavailable to normal retry until an operator determines the outcome.

```sql
select to_regprocedure('public.record_output_upload_outcome(uuid,uuid,uuid,text,boolean)') as recorder;
select has_function_privilege('service_role','public.record_output_upload_outcome(uuid,uuid,uuid,text,boolean)','execute') as service_allowed,
       has_function_privilege('authenticated','public.record_output_upload_outcome(uuid,uuid,uuid,text,boolean)','execute') as authenticated_allowed,
       has_function_privilege('anon','public.record_output_upload_outcome(uuid,uuid,uuid,text,boolean)','execute') as anon_allowed;
-- Safe summary, no paths or user content. Expected permissions: true / false / false.
select status,failure_code,count(*) as jobs
from public.project_deletion_cleanups
where dependency_counts ? 'output_upload_orphans'
group by status,failure_code;
-- Safe list of outcomes requiring operator investigation.
select id,project_id,created_at,status,failure_code,storage_object_count
from public.project_deletion_cleanups
where dependency_counts ? 'output_upload_unconfirmed'
  and dependency_counts->>'output_upload_unconfirmed' = '1'
order by created_at,id;
```

For an investigated job, retrieve only its captured `storage_paths` through restricted operator access by exact job ID. Recheck every reference source (registry, official versions, output scalar/version, intake and contributions) against each exact path before considering manual removal. Do not convert a pending job to FAILED merely because the client received an error, and do not remove a live referenced object. The monitoring projection intentionally does not expose paths; its failure-code allowlist may show no code for the new pending category. No cleanup SQL or Storage operation was executed during this patch.

## Storage model and API contract

| Table | Purpose |
| --- | --- |
| `project_output_document_files` | Immutable object metadata; retains files removed from the draft for history and exact project cleanup. |
| `project_output_document_draft_files` | Editable, ordered working-file references for one output. |
| `project_output_document_version_files` | Immutable, ordered references captured at submission. |
| `project_output_document_draft_requests` | Actor/content/CAS-bound receipts for repeatable draft operations. |

`project_output_documents.draft_revision` guards draft writes. Existing versions gain snapshot classification and submission receipt fields; existing IDs and numbering remain unchanged.

All paths below are relative to `/api/projects/:projectId/output-documents`:

| Endpoint | Contract |
| --- | --- |
| `POST /:key/upload` | One multipart file per request; `expected_draft_revision`, `request_id`, optional `replace_file_id`. The multiple-file picker sends these serially for the same output. |
| `DELETE /:key/files/:fileId` | Removes only a draft reference, with revision and request ID. |
| `POST /submit` | Each item supplies `document_key`, `expected_draft_revision`, and `request_id`; creates/replays one whole-output snapshot. |
| `POST /review` | Existing expected-version guard and whole-output decision remain. |
| `GET /:key/files/:fileId/download` | Authorized draft/current-snapshot download; optional `version_id` pins the snapshot. |
| `GET /:key/versions/:versionId/files/:fileId/download` | Authorized historical snapshot-file download for existing history roles. |
| `GET /:key/versions` | Preserved legacy records plus review snapshots, with all referenced files and classification. |

Existing single-download/version-download routes remain compatible by choosing the first file. `/api/documents/outputs` returns one entry per approved output, `approvedVersionId`, and all safe file metadata; `/documents` uses per-file downloads. Listings contain neither Storage paths nor signed URLs. Global search retains authorized non-final output discovery and searches safe file names within that scope.

## Changed files

Backend implementation:

- `backend/src/controllers/output-document.controller.ts`
- `backend/src/routes/project.routes.ts`
- `backend/src/services/output-document.service.ts`
- `backend/src/services/global-search.service.ts`
- `backend/src/services/project-deletion.service.ts`
- `backend/src/validators/output-document.validator.ts`

Frontend implementation:

- `frontend/src/app/projects/[id]/page.tsx`
- `frontend/src/app/documents/page.tsx`
- `frontend/src/components/projects/output-documents-section.tsx`
- `frontend/src/components/projects/output-document-files.tsx` (new)
- `frontend/src/hooks/use-output-documents.ts`
- `frontend/src/types/project.ts`
- `frontend/src/lib/output-document-ux.ts`
- `frontend/src/lib/output-document-draft.ts` (new)
- `frontend/src/lib/document-repository.ts`
- `frontend/src/i18n/en.ts`, `frontend/src/i18n/id.ts`
- `frontend/package.json` (registers the new draft test; no dependency added)

Focused tests:

- `backend/src/services/output-document-draft-files.test.ts` (new)
- `backend/src/services/phase22-file-collections.test.ts` (new, static SQL verification)
- `backend/src/services/project-deletion-output-files.test.ts` (new)
- `backend/src/services/output-document-access.test.ts`
- `backend/src/services/output-document-repository-list.test.ts`
- `backend/src/services/output-document-notification.test.ts`
- `backend/src/services/output-document-policy.test.ts`
- `backend/src/services/global-search.service.test.ts`
- `frontend/src/lib/output-document-draft.test.ts` (new)
- `frontend/src/lib/output-document-ux.test.ts`
- `frontend/src/lib/document-repository.test.ts`

Migration and rollout artifacts (all new):

- `backend/supabase/phase22-output-document-file-collections.sql`
- `backend/supabase/phase22-preflight.sql`
- `backend/supabase/phase22-verify.sql`
- `docs/output-file-collections-rollout.md`

## Validation completed on 2026-10-05

Ten focused backend test files passed: draft files, Phase 22 static checks, access, repository listing, notifications, policy, global search, retained-file deletion preview, project deletion, and cleanup retry. Five focused frontend test files passed: draft queue/reload/idempotency, output UX, existing file selection, repository, and EN/ID dictionaries. Backend and frontend `tsc --noEmit` passed. The new backend tests are discovered by the existing runner; the new frontend test is registered explicitly.

Tests use mocks or static SQL checks. No SQL, migration, Storage cleanup, full build, or full suite was run. No local application listener was detected on ports 3000/3001/5000, so browser and live database/Storage behavior remain rollout checks.

### Audit fixes validated on 2026-10-05

Phase 22 was confirmed already applied by the operator; its migration was not edited for these fixes. Seven targeted backend test files passed: draft files (including before/after Storage failure, lost metadata response, concurrent same-ID upload, safe failed tracking and upload/remove replay after completion/postponement/final status), archive bounds/completeness, Phase 22 and Phase 23 static checks, access, policy and repository listing. Three targeted frontend files passed: archive errors in EN/ID, dictionary parity/placeholders and draft request/retry helpers. The frontend archive test was added to the explicit runner; backend discovery already includes the new test files.

Backend and frontend `tsc --noEmit` passed. `git diff --check` passed. Validation used mocks/static checks, not live PostgreSQL or Storage. No local application listener was detected on ports 3000/3001/5000 in this session, so no browser/Network verification was claimed. Phase 23, permission verification and real fault handling still require the manual rollout above.
