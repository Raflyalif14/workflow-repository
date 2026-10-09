# Project Detail: approved documents and own-review stale warning

Checked on `main / 1e6f772`, with staging empty. Existing approval/PIC,
SA badge, Assigned work, activity and CTA patches were preserved.

## Proven source mismatch

The inline `ProjectDocumentsSection` only used `useDocuments({ projectId })`,
which reads the official documents endpoint. It never read approved output
snapshots. Completing/approving an output does not create a row in `documents`,
so this source could legitimately be empty while the repository had an
approved output. No copy, re-upload, status change or migration is needed.

The panel is now a focused component that combines the same two authorized
sources used by Documents: official documents and `useOutputRepository()`.
It uses `buildRepositoryItems` to admit only current APPROVED output snapshots
with a version ID and files, filter to this project, and deduplicate outputs.
Each multi-file output is one entry with a download control for each file.
Downloads pass the exact approved snapshot ID and file ID through the existing
authorized endpoint. Official documents retain their existing latest-version
download behavior.

The backend mapper already validates output/project/version identity, approved
snapshot status, file ownership and repository access. It loads files from
snapshot references, not the mutable draft. The review hook already invalidates
the output repository key, Project Detail, milestones and related queries.
Those rules and invalidations were retained, with focused regression assertions.
Errors are not presented as an empty result or as readable stale cached files;
the panel adds retry using the same queries.

When a later version is non-approved, the panel follows the current repository
policy and excludes that output. Older approved snapshots remain in the
existing authorized history; this panel does not grant access to draft/history.
Repository sharing does not grant Project Detail access.

## Own approval versus stale deep link

The warning was based on the URL fragment's output/snapshot target. After a
successful review, the same fragment remained while the output became
APPROVED, which correctly failed the stale predicate but incorrectly implied
a conflict with this user's own successful decision.

Only an exact output/snapshot pair confirmed successful in this request's
results now resolves its review fragment. The milestone anchor and unrelated
fragment parameters are retained. This applies to a confirmed approve/revise,
including partial results only for successful targets. Failed/unconfirmed
requests, other snapshots and old links opened later are not resolved. URL
presentation failure cannot turn a confirmed database success into a failed
review. Backend status/CAS checks, confirmation, receipt IDs and retry are
unchanged.

## Validation completed

PASS:

- `project-documents-panel.test.tsx` (new and registered): approved-only
  snapshots, correct per-file download version IDs, one entry per collection,
  current-project scope, refresh/next revision, official documents preserved,
  no actions for ineligible sessions, safe download errors, load/error/empty,
  retry and EN/ID.
- `approval-queue.test.ts`: exact own-success target resolution versus real
  stale snapshots, preserved anchors/parameters, repository invalidation.
  Its hook capture fixture needed an explicit business-request mock because
  that unrelated real hook now requires a React auth context. The mock rejects
  any unexpected business mutation; assertions were retained.
- `output-file-revisions.test.tsx`: confirmation/cancel, retained feedback,
  stale snapshot refusal, concurrent click latch and receipt reuse.
- `document-repository.test.ts`: combined list, deduplication and safe states.
- Backend `output-document-repository-list.test.ts` and
  `output-document-access.test.ts`: existing role scopes, approved snapshot
  selection, denied unrelated users and authorized download boundaries with
  mocked database/Storage. Backend code was not changed.
- `pic-assignment-request.test.tsx`: existing approval/PIC behavior preserved.
- `i18n/i18n.test.ts`, frontend `tsc --noEmit`, strict UTF-8 and diff check.

The first panel fixture omitted the official document's mandatory update
timestamp, causing a repository sort error. The fixture was corrected to match
the actual response; the application sorter and assertions were not weakened.
TypeScript was run from `frontend`, using the installed compiler.

## Actual Chrome evidence and limits

Re-run: `node frontend/tests/browser/project-approved-documents-browser.cjs`
against the existing loopback dev server (`WORKFLOW_TEST_ORIGIN` optional).
Chrome 154.0.8037.98 ran the actual AuthProvider, Project Detail, review
confirmation and document panel with all API requests intercepted. An isolated
synthetic Head SA approved once; the harness never forwards API requests to
live services. Unknown requests fail and external requests are blocked.

Four checks passed at 1440px / English:

1. Confirmed approve sends exactly one fixture request; both approved files
   appear without copying documents, and the normal success has no stale warning.
2. An actual page reload preserves the panel despite an empty official source.
3. Reopening the already-reviewed old deep link still warns.
4. A later submission with a changed snapshot still warns, is excluded from the
   Approved panel, and sends no additional review.

`results.json` records zero unknown requests and zero browser runtime errors.
`approved-panel-en-1440.png` was visually inspected. The initial browser
fixture used fragment-only navigation for the later version; it retained the
old query cache. The harness now explicitly reloads for that check, which passed.

This proves browser behavior with fixture API, not the reported live project's
state, live database transaction, real Storage bytes or full provider integration.
EN/ID panel behavior is covered by component tests; this browser run was EN
desktop. Owned Chrome/profile resources were cleaned; user processes were
left running. No live review, SQL, migration, Storage change or Git write action.

## Scoped files

- `frontend/src/app/projects/[id]/page.tsx`
- `frontend/src/components/projects/project-documents-section.tsx` (new)
- `frontend/src/components/projects/output-documents-section.tsx`
- `frontend/src/lib/approval-queue.ts`
- `frontend/src/lib/approval-queue.test.ts`
- `frontend/src/lib/project-documents-panel.test.tsx` (new)
- `frontend/package.json` (explicit test registration only)
- `frontend/tests/browser/project-approved-documents-browser.cjs` (new)
- This report, results and screenshot.

Run the updated frontend; no backend/schema rollout is needed for this task.
