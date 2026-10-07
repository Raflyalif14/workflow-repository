# Document repository access (Phase 29)

## Policy

`OFFICIAL` identifies `documents.id`; `OUTPUT` identifies `project_output_documents.id`.
Missing ACL rows mean `RESTRICTED`, revision 0, no grants. Phase 29 does not backfill
shared documents or alter any file, snapshot, review, project or workflow.

Native project policy stays intact: Head SA/admin all projects, Sales owner, SA PIC.
Official non-final visibility retains the existing role policy; output non-final
visibility remains Head SA/PIC only. Managers can change ACLs only on a valid current
Approved result in native project scope. A grant never authorizes management or writes.
Head SA currently has global project scope; no narrower organization scope is invented.

Shared/granted readers receive the current Approved file metadata and authorized
downloads. They receive no project name, customer/value details, private history, comments,
feedback, uploader/recipient data, grant list, or ACL audit. Project IDs in download
routing are identifiers, not permission to read the project. Invalid, missing,
unconfirmed legacy or non-Approved current results fail closed. Earlier Approved
snapshots are not substituted when a new current result is non-final.

Restricted grants remain stored in shared mode and apply again upon restriction.
Removing a grant cannot remove native role/owner/PIC rights. Disabled accounts never
gain read rights; inactive retained grants can be removed but cannot be newly saved.

## Atomic writes and read enforcement

Service-only SQL RPCs resolve the active actor from verified server identity.
List/search use authorized source IDs before database paging; detail and each
download resolve authorization again. Archives include only approved authorized
snapshots, retaining the existing 100 MiB archive limit and bounded Storage reads.
Single-file signed URLs retain the 300 second TTL and private bucket.
Revocation blocks new requests; already issued signed URLs remain valid until TTL.

The write RPC locks project, actor, source, recipients, then ACL; CAS, canonical
grant set, audit and request receipt commit in one transaction. Same request and
payload replay without another audit; conflicting payload or stale revision fails.
No-op saves record a receipt but no change audit. Cancel makes no request.
Actor/source eligibility and recipient activity are rechecked even on retry.
A changed eligibility can therefore reject a replay rather than bypass authorization.

ACL/grant/receipt tables are not readable from client database roles. Restrictive
activity policies hide ACL audits and prohibit their insert/update/delete from those roles. The API exposes audits only
to managers. Phase 29 aborts if activity client read/write privileges exist without RLS;
review that existing policy manually instead of enabling RLS blindly.

ACL metadata cascades with project/source/user deletion. It contains no file or
Storage references and must not change the existing exact-path cleanup enumeration,
historical-file protection, deletion receipts or cleanup retry policy.
No sharing notifications are created.

## Manual rollout

1. Preserve/review the full current dirty patch (including Phases 24-28). Verify
   all its required prior phases are applied. Run `phase29-preflight.sql` manually
   read-only. Investigate duplicate latest versions, invalid results, activity RLS
   or privileges; do not guess repairs or run any Storage cleanup.
2. Review Phase 29 SQL in staging with realistic roles. Test transaction rollback
   on audit failure, concurrent updates and deletes, receipt replay, inactive actor
   and recipient changes, and all native/shared/granted read combinations.
3. Pause traffic or use a coordinated deployment window, apply Phase 29 manually,
   then deploy matching backend nodes and frontend. Do not run mixed old/new nodes:
   old readers do not understand sharing. New code fails closed (503) if RPCs are
   absent; there is no fallback that ignores ACLs.
4. Run `phase29-verify.sql` manually. New tables are empty immediately after first
   application; confirm grants/receipts and audit privacy/permissions.
5. Verify EN/ID management confirmation, cancel, stale conflict/reload, retry,
   account switching, repository counters/search/direct links and per-file/ZIP
   download using isolated fixtures. Revoke access and check a new request denies
   access without claiming old signed URLs expire immediately.
6. If reverting application deployment, disable management first and retain ACL
   rows/audits. Old application cannot serve new grant/shared recipients. Do not
   drop metadata or mutate file/history tables as rollback.

## Verification boundary

Repository tests use isolated RPC/Storage transports and SQL static checks.
They do not prove PostgreSQL transaction execution, live RLS policies, concurrent
database locking, Supabase signed URL behavior or browser usability. No SQL,
live ACL mutation, notification or Storage operation is run by this implementation.

## Files in this task

- `backend/src/controllers/document-access.controller.ts`
- `backend/src/controllers/document.controller.ts`
- `backend/src/controllers/output-document.controller.ts`
- `backend/src/routes/document.routes.ts`
- `backend/src/services/document-access.service.ts`
- `backend/src/services/document-lifecycle.test.ts`
- `backend/src/services/document-repository-access.test.ts`
- `backend/src/services/document.service.ts`
- `backend/src/services/global-search.service.test.ts`
- `backend/src/services/global-search.service.ts`
- `backend/src/services/output-document-access.test.ts`
- `backend/src/services/output-document-archive.test.ts`
- `backend/src/services/output-document-draft-files.test.ts`
- `backend/src/services/output-document-repository-list.test.ts`
- `backend/src/services/output-document.service.ts`
- `backend/src/services/phase-output-read.test.ts`
- `backend/src/services/project-activity.service.test.ts`
- `backend/src/services/project-activity.service.ts`
- `backend/src/services/project-detail-activity.test.ts`
- `backend/src/services/project-management.service.ts`
- `backend/src/test-utils/`
- `backend/supabase/phase29-document-repository-access.sql`
- `backend/supabase/phase29-preflight.sql`
- `backend/supabase/phase29-verify.sql`
- `docs/document-repository-access-rollout.md`
- `frontend/package.json`
- `frontend/src/app/documents/page.tsx`
- `frontend/src/components/documents/document-access-dialog.tsx`
- `frontend/src/components/documents/document-comments-drawer.tsx`
- `frontend/src/hooks/use-document-access.ts`
- `frontend/src/hooks/use-documents.ts`
- `frontend/src/hooks/use-global-search.ts`
- `frontend/src/hooks/use-output-documents.ts`
- `frontend/src/hooks/use-repository-session.ts`
- `frontend/src/i18n/en.ts`
- `frontend/src/i18n/id.ts`
- `frontend/src/lib/document-access.test.tsx`
- `frontend/src/lib/global-search.ts`
- `frontend/src/types/document.ts`

## Local validation

14 targeted backend tests passed, including the real route/auth/controller chain on local HTTP with mocked providers, plus upload CAS/receipt/snapshots, archive and exact-path cleanup regressions. Five targeted frontend tests passed, including ACL dialog/cache/session and i18n.

The existing `global-search.test.ts` assertion for an output without a milestone ID fails both in the current tree and with HEAD helper + HEAD test copied to an isolated temporary directory: it expects `#output-documents`, while HEAD already uses milestone-specific anchors and no anchor when milestone ID is absent. That unrelated assertion was left intact. New ACL tests cover the unchanged native mapping and repository links for sharing recipients.
