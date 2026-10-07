# Documents repository access categories

> Historical Phase 29 implementation notes. Phase 32 replaces individual grants
> and per-document sharing with one project setting. See project-document-sharing-rollout.md
> for current cutover rules; old grants do not authorize access after cutover.

## Diagnosis and access

The reported SA requests returned HTTP 200 with empty arrays. The user then
confirmed that this SA was not the current project PIC and that no document
output had been approved. This is consistent with Phase 29 access, rather than
proof of an eligible result being discarded by the frontend. No authenticated
live database/session inspection was available to independently inventory results.

The Phase 29 RPC remains the authority for list, search, detail, individual
file download and ZIP. Its migration and permissions were not changed.

| Category | Meaning |
| --- | --- |
| All accessible | Every result authorized by the backend; default for every role |
| My projects (Sales) | Backend native ownership, not the uploader |
| Assigned projects (SA) | Backend native current project PIC, not an old milestone PIC |

Sales and SA receive horizontal All accessible and My/Assigned projects tabs.
Head SA and Super Admin receive All accessible only; native access for these
roles is not personal ownership or assignment. Existing
non-final output restrictions remain in force. Sharing never grants private
Project Detail, comments, feedback or non-final history. Download always checks
current access, including revocation.

The existing isSharedWithMe backend metadata contract is retained; the current
frontend no longer offers a separate shared category. Shared internal and
individually granted results remain in All accessible. Grant
queries select only ACL source IDs and the verified actor's matching access IDs,
scoped to already-authorized approved sources, in batches of at most 250.
No recipient list, Storage path or signed URL is included in repository lists.
Native plus shared access can overlap; the combined list deduplicates each
source and treats a multi-file output as one entry. Categories and counters
operate on the complete authorized result before frontend pagination.

## State and freshness

Unloaded, ineligible or failed sources show unavailable counters, not successful
zero totals. A successful pair of empty lists may show zero. Errors offer a
session-guarded retry; malformed non-array responses also fail visibly. Tab
selection survives locale changes and refetch; changing tabs resets pagination
and supports arrow keys, Home and End. Account/session changes reset
private selections and retain existing separate query keys/cache clearing.

PIC assignment, both phase-plan approval surfaces and project lifecycle
invalidations refresh official/output repository and search. Output review
refreshes repository and search. Existing grant/revoke and project deletion
invalidations remain intact.

## Changed files in this task

- backend/src/services/document-access.service.ts
- backend/src/services/document.service.ts
- backend/src/services/output-document.service.ts
- backend/src/services/document-repository-access.test.ts
- backend/src/services/document-lifecycle.test.ts (empty ACL fixture support; existing policy assertions unchanged)
- frontend/package.json (two focused tests registered)
- frontend/src/app/documents/page.tsx
- frontend/src/hooks/use-approvals.ts
- frontend/src/hooks/use-document-access.ts
- frontend/src/hooks/use-documents.ts
- frontend/src/hooks/use-output-documents.ts
- frontend/src/hooks/use-projects.ts
- frontend/src/types/document.ts
- frontend/src/lib/document-repository.ts
- frontend/src/lib/document-repository.test.ts
- frontend/src/lib/document-access.test.tsx
- frontend/src/lib/document-repository-cache.test.tsx (new)
- frontend/src/lib/document-repository-page.test.tsx (new)
- frontend/src/i18n/en.ts
- frontend/src/i18n/id.ts
- docs/document-repository-categories.md (new)

## Verification and manual deployment

Focused tests passed: backend repository ACL/local HTTP, output repository list,
global search and official document lifecycle; frontend combined repository,
access/session/error handling, mutation cache, page state, i18n and deletion cache.
Both TypeScript checks passed. UTF-8 and diff whitespace checks passed.
Database/Storage were isolated fixtures in these tests; no live writes occurred.

The local development /documents route returned HTTP 200 without a compilation
error marker. Browser control could not initialize, so visual QA and authenticated
SA/manager UAT are not claimed. No live SQL was executed.

Deploy backend and frontend together; restart the running backend process so
repository responses contain the category metadata. No migration is needed.
Manually verify an existing current-PIC result and an approved shared result,
then verify category counts, pagination and authorized download using existing
accounts. No synthetic records, grants or retries are needed merely for inspection.
