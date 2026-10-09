# Assigned work classification verification

## Proven cause and fix

Baseline checked: `main / 1e6f772`, staging empty. All existing approval/PIC,
activity, CTA and badge changes were preserved.

`frontend/src/app/milestones/page.tsx` previously calculated Under review from
`useOutputRepository()` (`GET /documents/outputs`), looking for `IN_REVIEW`.
The actual controller calls `listAccessibleFiles(actor(req))` with its default
`approvedOnly` policy; the service filters `APPROVED` plus a non-null current
version. Submitted outputs cannot reach that filter. This is a source mismatch,
not a milestone completion defect or a missing cache invalidation.

The page now uses `outputs` metadata on `GET /me/assigned-milestones`, already
added by the badge patch. It contains only output status and required/selected
flags, through the existing milestone FK and actor PIC filter. No backend,
database, endpoint, access or workflow change is made in this task. SA no longer
fetches the approved repository to classify its assignments. The separate
HEAD_SA review queue is retained; it was not expanded in this SA-scoped task.

## Classification

The shared `getAssignedMilestoneState` drives the badge action filter, assigned
KPI/tab membership and row classification:

| State | Rule |
| --- | --- |
| Needs action | ACTIVE, non-postponed project; existing actionable milestone status; at least one required/selected output TO_DO, DRAFT or REVISION_REQUIRED. Legacy milestones without output collections retain the prior action rule. |
| Waiting for Head SA review | Active, non-postponed assignment with selected/required SUBMITTED or IN_REVIEW output and no eligible SA work remaining. |
| Completed | Existing milestone COMPLETED or APPROVED; never inferred just because outputs are approved. |
| Other | Postponed/final/inactive projects, approved-only milestones awaiting existing progression, or other states. These remain in All assigned. |

Mixed output milestones enter Needs action once and show the count of other
outputs waiting for Head SA. The review KPI counts milestones, not output files
or snapshots. All assigned and project/milestone links remain unchanged. The
new waiting labels are exactly `Waiting for Head SA review` / `Menunggu review
Head SA`. Locale changes retain the active tab.

Submit/review already invalidate the assigned query. The real-hook HTTP fixture
now additionally proves classification changes after refetch, `ACTION →
WAITING_REVIEW → ACTION`. Focus refetch and account cache clearing remain
unchanged; there is no new polling or cross-session push.

## Targeted validation

PASS:

- `assigned-milestone-ux.test.ts`: submit, partial submit, revision,
  required/optional selection, waiting output count, approved versus completion,
  paused/final and legacy action behavior; real hook/query invalidation.
- New `assigned-work-page.test.tsx`: actual page KPI/tab/list consistency,
  partial waiting indicator, milestone links, All assigned preservation,
  completion/postponed, EN/ID, locale state and loading/error/empty states.
  Registered in the existing explicit frontend runner.
- `settings-navigation.test.tsx`: existing desktop/drawer badge and role checks.
- `i18n/i18n.test.ts`: dictionary completeness and placeholders.
- Frontend `tsc --noEmit`, strict UTF-8 for this task's text files, and
  `git diff --check`.

The local CommonJS fallback runner initially could not render a Lucide icon:
the installed package's require export produced missing icons. Resolving the
installed ESM entry, as the app bundler does, made the page fixture pass without
changing assertions or application icons. An initial standalone i18n invocation
also lacked the `@/` resolver; the corrected invocation passed. These were test
runner errors, not application failures.

## Real browser evidence

`node frontend/tests/browser/assigned-work-browser.cjs` passed seven checks in
Chrome 154.0.8037.98 against the existing local dev server. It uses the actual
AuthProvider, app shell and Assigned work page, a fresh owned profile, and
intercepts every API request. Unconfigured API requests fail; non-app external
requests are blocked. No live API/data/Storage is used. Owned browser/profile
resources were cleaned up; the existing dev server was left running.

- SA / EN / 1440px: waiting KPI/tab=1, action badge=0, waiting row/link visible.
- SA / ID / 390px: correct waiting label; locale change keeps the review tab;
  mixed output work shows Needs action plus one waiting output indicator.
- SA / ID / 390px: revision, completed, approved-only classifications.
- SA / ID / 360px: postponed retained in All assigned, not waiting; no page
  horizontal overflow.
- Zero unconfigured API requests and zero browser runtime errors; no SA call
  to `/documents/outputs`.

Evidence: `results.json`, `waiting-en-1440.png`, `waiting-id-390.png`,
`partial-id-390.png`. The desktop waiting and mobile partial screenshots were
also visually inspected. This is browser verification with synthetic API;
it does not prove live project state, backend authorization, PostgREST schema
cache, or database progression. No migration or live mutation was performed.

## Files for this task

- `frontend/src/app/milestones/page.tsx`
- `frontend/src/lib/assigned-milestone-ux.ts`
- `frontend/src/lib/assigned-milestone-ux.test.ts`
- `frontend/src/lib/assigned-work-page.test.tsx`
- `frontend/src/i18n/en.ts`
- `frontend/src/i18n/id.ts`
- `frontend/package.json`
- `frontend/tests/browser/assigned-work-browser.cjs`
- This report, results and three screenshots.
- `docs/sa-milestone-badge.md` links this follow-up.

Run the backend from the existing badge patch and this frontend together. No
schema rollout is needed. No staging, commit or push was performed.
