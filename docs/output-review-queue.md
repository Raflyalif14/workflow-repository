# Output review queue in Approvals

- No migration. Deploy the updated backend before the frontend; the frontend rejects an old overview response without `pendingDocs` instead of showing an empty output queue.
- The existing `/approvals/overview` remains HEAD_SA/SUPER_ADMIN only, behind verified active-account authentication. Output working-state visibility still follows `canReadNonFinalOutput`: HEAD_SA sees the queue; SUPER_ADMIN retains plan/deadline oversight and approved-only document access. SALES/SA cannot read overview by changing query parameters.
- `pendingDocs` counts selected outputs in IN_REVIEW with a valid current submitted/legacy-submitted snapshot and valid project/milestone/phase/catalog/file identities. One snapshot with multiple files counts once. Submission actor/time are read from submission metadata; missing legacy metadata stays unknown. Draft files and historical snapshots are not counted.
- Counts include visible blocked pending outputs. Review requires HEAD_SA, ACTIVE/non-postponed project, active phase and IN_PROGRESS milestone, matching existing server guards. The upload start-date restriction is not added to review. Reasons are shown in Approvals. Dashboard's output pending counter uses the same overview count; its operational task groups continue to describe active work and do not create another task for each overview output.
- All database sources are read in pages of 250, with IN batches of at most 200 IDs and stable ordering. Overview still aggregates the complete authorized scope in memory. Global frontend filters and time/category/ID ordering precede 20-item pagination. Counts use the full scope. Cost grows with approval history/scope; no new per-item query, cache or schema is introduced. A changing source between reads can cause a safe load error and require refresh; this read endpoint is not a transactional snapshot.
- Approvals output navigation carries project/milestone/output/current snapshot IDs. The milestone expands, including historical-phase details, and the output receives focus after mounting. A changed snapshot/status displays a stale-submission notice. All decisions, confirmation and CAS remain in the milestone. Output review/version history remains there as well.
- Submit/review/scope changes invalidate the shared approval key as well as existing output/project/milestone/repository/Dashboard keys. In another browser, the existing 60-second polling runs from the single AppShell stats observer; page and Dashboard observers share that query without additional polling. Focus refetch and manual refresh remain available. Disabled role queries do not poll. Auth/session cache clearing remains unchanged.
- Invalid source/relationships fail with a safe overview error. A cached refresh failure is explicitly marked stale; initial missing counters use an unavailable placeholder. The response contains no file paths, signed URLs, file content or private provider errors.

Validation uses mocked providers and local HTTP/isolated UI rendering. No SQL, live submission/review or Storage operations are needed to validate this patch. Verify the queue and deep link with an existing HEAD_SA session after deployment; test results do not establish live PostgREST relationship resolution or browser layout.

## Files for this patch

Backend:

- `backend/src/controllers/approval-overview.controller.ts`
- `backend/src/services/approval-overview.service.ts`
- `backend/src/services/approval-rows.ts` (new)
- `backend/src/services/output-review-queue.service.ts` (new)
- `backend/src/services/approval-overview.test.ts` (new)
- `backend/src/utils/request-timing.ts` (register the opt-in output-review span)

Frontend:

- `frontend/package.json` (append both new tests to the explicit runner)
- `frontend/src/app/approvals/page.tsx`
- `frontend/src/app/page.tsx`
- `frontend/src/app/projects/[id]/page.tsx`
- `frontend/src/components/app-shell.tsx`
- `frontend/src/components/projects/output-documents-section.tsx`
- `frontend/src/hooks/use-approvals.ts`
- `frontend/src/hooks/use-output-documents.ts`
- `frontend/src/i18n/en.ts`
- `frontend/src/i18n/id.ts`
- `frontend/src/lib/approval-queue.ts` (new)
- `frontend/src/lib/approval-queue.test.ts` (new)
- `frontend/src/lib/approval-queue-ui.test.tsx` (new)
- `frontend/src/lib/milestone-presentation.ts`
- `frontend/src/lib/query-keys.ts`
- `frontend/src/types/approval.ts`

Documentation: this file. Total: 23 task files, including seven new files. Ten files already had earlier worktree changes; their existing workflow/auth/PIC work was retained.

## Completed validation and remaining limits

- Seven targeted backend test files passed: approval overview (including real local HTTP with mocked auth/database), phase output read/download, output policy, draft files/CAS/receipts, output notifications, project plan approval, request timing.
- Eleven targeted frontend test files passed: i18n, approval queue, isolated actual Approvals page rendering, approval access, milestone presentation, output UX, output draft, phase review, document repository, review surface, PIC assignment request. The queue tests also exercise actual QueryObservers for cache invalidation/focus freshness, global pagination and late-mounted output focus.
- Backend/frontend `tsc --noEmit`, strict UTF-8 for all 23 task files, and `git diff --check` passed.
- Existing `dashboard-ux.test.ts:234` still fails. The exact HEAD `1347244` helper and test reproduce the same assertion without checkout or file edits: the active fixture is due September 12 with a September 10 reference date, so the helper returns upcoming=1/overdue=0 while the test expects upcoming=0/overdue=1. This patch does not modify that helper/test.
- On October 6 the local application compiled/responded and an existing SALES browser session displayed Access Restricted for Approvals. No account switch or live mutation was performed. A HEAD_SA browser session was unavailable. On October 7, when work resumed, the previous tab was gone and localhost ports 3000/5000 no longer responded. HEAD_SA visual/mobile/deep-link UAT and live PostgREST relationship/count verification remain unperformed; isolated rendering is not visual UAT.
- Baseline: `main / 1347244`, empty index, 113 dirty paths. All baseline paths remain present; 103 remain byte-for-byte identical, including Phase 24-27 migrations and untouched auth/audit/PIC services. Final worktree: 67 modified and 59 untracked paths (126 total), with no staged changes.

Manual rollout: deploy the backend, then the frontend; no new migration. In an existing HEAD_SA session, compare overview counters with the output category, open a pending snapshot link, and verify stale-link/blocked states without making a decision merely for validation. Whole-scope aggregation remains the principal scalability limit.
