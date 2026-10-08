# Frontend presentation redesign

Baseline: main / f9efeba, clean worktree and empty index. No repository AGENTS.md
was found. The screenshot was not available in this turn; the written Metoric
specification guides this adaptation. The original redesign changes presentation only.
The subsequent authorized activity correction below extends its read API only.

## Inventory and order

Existing routes: /, /projects, /projects/new, /projects/[id], /milestones,
/approvals, /documents, /users and /settings (including its existing child routes).
Navigation still uses canShowNavigationItem and existing role lists. No role
selector, new navigation route or dependency was added. The activity correction
adds a read endpoint under the existing Dashboard API.

| Role | Existing data and actions retained |
| --- | --- |
| SALES | Owner projects, planning/result/phase-decision tasks, estimates and WON contracts |
| SA | Assigned milestones, output revision queue, deadlines and project progress |
| HEAD_SA | Plan/deadline/output reviews, PIC assignment, waiting for Sales, project values and SA workload |
| SUPER_ADMIN | Delivery exceptions, approval pipeline, project health and operational summary |

Sources remain useDashboard, useProjects, useApprovals, useApprovalStats and
useMyAssignedMilestones, with existing eligibility, fallback, sorting, polling
and cache invalidation. No inline approval action was introduced. Reviews and
revisions open their existing project/workspace links.

Dashboard DOM order: greeting; primary task and attention/waiting information;
project list; Head SA project values/workload; metrics and work-status chart;
activity. Wide project grids only activate at 2xl; each table has an internal
scroll boundary. Smaller viewports use labelled project rows.

## Shared styling and navigation

Light canvas, white surfaces, blue primary/deep/soft tokens, 18px outer shells
with an 8px quiet inset and 12px inner surfaces, soft shadows, readable semantic
status text, line icons and reduced-motion support. Plus Jakarta Sans uses a
Google Fonts stylesheet with display=swap; system fonts remain usable when the
external font cannot load. No package was added.

Buttons, inputs, cards, badges and dialogs retain props, refs, native date/file
controls and handlers. Existing tab controls retain their state/keyboard logic;
shared styling changes their selected appearance. The mobile drawer keeps full
labels even if desktop navigation was collapsed, traps keyboard focus, closes
with Escape or desktop resize, restores focus/scroll, and is inert when closed.
Language switching does not introduce component keys or provider remounting.

## Validation

New dashboard-layout test covers four roles, EN/ID, section order, existing
review workspace links, loading/error/empty states and actual drawer keyboard
handlers. It is registered in the explicit frontend npm test runner.

Passed: dashboard-layout, i18n, settings-navigation, head-sa-project-values,
document-repository-page and approval-queue-ui; frontend tsc --noEmit; strict
UTF-8 and git diff --check.

Three existing tests also fail using unchanged HEAD code loaded in memory:
- dashboard-phase-status: a mutation hook calls useAuth without AuthProvider.
- global-search: output link expectation still requires #output-documents.
- dashboard-ux: SA paused/non-active metric expectation conflicts with helper behavior.
Those tests/helpers were not edited to hide these baseline failures.

Validation used the installed ts-node loader with a temporary alias resolver
and the installed Lucide CommonJS entry; local Lucide package metadata marks
that .js entry as ESM, requiring a loader adapter. No dependency was changed.
Temporary loaders are removed from the worktree after validation.

Development HTTP compilation succeeded for /, /documents, /approvals, /projects,
/projects/new, /settings, /users, /milestones and /login. This is not a logged-in
visual or UAT check. Browser initialization failed, so desktop/mobile appearance,
actual font download and screenshots remain unverified. No live mutation ran.

## Follow-up consistency review

The second pass found remaining local overrides rather than missing theme tokens:
opaque old auth shadows, translucent Cards overriding the shared shell, old list
surfaces and tight desktop breakpoints beside the sidebar. These now use the new
surface tokens across Projects, Project Detail/create, Documents, Milestones,
Approvals, Settings/operational health, Users and auth pages. Workflow-template
pages already use shared Cards; their native controls are aligned as well.

Status text now references named success/warning/info/primary/destructive tokens
at its actual consumers, instead of overriding old dark-theme utility names in
global CSS. Green/red/amber status meanings are retained. Filter selections are
blue and exposed as pressed/selected controls. Native selects/textareas follow
shared input radius/height and dialogs scroll within the viewport.

Existing route actions, handlers, authorization and query contracts are retained.
This is presentation consistency, not a new workflow or a removal of functions.
Browser initialization still fails; visual desktop/mobile confirmation remains
pending even when development compilation and component tests pass.

Follow-up validation: frontend TypeScript passed. Seven targeted tests passed: dashboard-layout, document-repository-page, approval-queue-ui, settings-navigation, auth-registration-regression, output-file-revisions and project-create-request. All 17 active route checks returned HTTP 200 without development compilation error markers (including dynamic project/workflow routes and all auth routes). HTTP compilation does not verify authenticated rendering. Previously documented unrelated baseline test failures were not rerun.

## Review before Sales/activity refinement

Reviewed against main / f9efeba: 47 modified files and 2 new files; index empty.
All changes are frontend presentation, its regression test/runner, and this report.
No backend, dependency version, auth/session provider, hook, API contract or business
mutation changed. Native input props and handlers, role navigation filters and
review workspace destinations remain. No production fixture values or fake controls
were added. Dashboard sections were moved with their existing data; error feedback
now prevents failed metric inputs appearing as valid zeros.

AST-assisted comparison confirms 32 of 35 non-dashboard/non-shell/non-UI TSX
files are identical after removing className and aria-pressed attributes. The
remaining three contain font links or semantic color strings, reviewed separately.
Dashboard, app shell, shared UI, dictionaries, tokens, runner and new test were
reviewed separately. The three documented HEAD test failures remain unchanged.
No application code changed during this final review, so the last targeted tests,
TypeScript and 17-route compilation results were reused, not rerun.

Overflow review covered minimum grid widths/breakpoints, internal Dashboard table
scrolling, viewport-bounded dialogs, closed-drawer inert state and keyboard/focus
restoration. Blue/semantic tokens and reduced-motion rules are consistent by code
inspection. Browser initialization was attempted twice again and failed with a
Windows sandbox helper error. Actual narrow-screen text fit, font download and
visual focus/contrast remain manual browser checks; no screenshot or live UAT is
claimed. Existing shared Dialog focus/ARIA behavior was not redesigned in this
patch. No newly introduced functional regression was identified in this review.

## Sales workspace refinement and corrected activity pagination

Sales empty workspace and attention panels share one compact message only when
queries finish successfully without actions, waiting items or other follow-ups.
Distinct tasks, waiting information and project links remain. Sales project rows
use four minmax(0, ...) desktop columns: project/progress with retained status/Open,
estimate, stage and PIC; they stack on mobile. The greeting is 26px and Dashboard
spacing is reduced. These prior presentation changes remain intact.

The requested activity page size is EIGHT. The earlier local 5+3 pagination was
replaced, including its tests and copy. There is no frontend slice of the first
eight records into smaller pages.

Read API contract:
- Existing GET /api/dashboard still returns recentActivity as an array of up to 8.
  Its additive recentActivityPagination contains pageSize=8 and nextCursor|null.
  The initial database query reads 9 authorized rows to prove whether more exist.
- New authenticated GET /api/dashboard/activity?cursor=... returns items (up to 8),
  nextCursor|null and pageSize=8. Cursor is optional for an API first-page caller.
  No history total/page count is returned or inferred.
- Queries order created_at DESC, id DESC. A cursor carries the exact database
  timestamp (including PostgreSQL microseconds) and ID; older pages compare that
  tuple with strict less-than. Only validated timestamp/UUID values enter filters.
- Sales owner, SA current project PIC and manager project scopes are resolved before
  cursor/limit on every page, including all project query pages. A cursor is not
  authorization. Active-account/password guards use existing auth middleware.
  The minimal project projection for later pages reads ID/name/owner/PIC only.
- DOCUMENT_ACCESS_CHANGED remains private to manager access details, consistent
  with ProjectActivityService. Both initial and later Dashboard activity queries
  exclude that private audit before limit. No raw audit/recipient fields are sent.
  Other workflow, document, auth/session and sharing rules are not changed.

UI and cache:
- First page reuses overview; Next fetches rows after the eighth via the cursor API.
  Further pages likewise fetch older items. Previous pops the cursor history.
- Footer shows Page N, Previous and Next, with keyboard-accessible blue-theme Buttons.
  Boundaries come from history/actual nextCursor; no invented final page or total.
  Pending requests disable navigation. Error/retry retains the page; an empty older
  page still permits Previous. Activity links and newest-first API order remain.
- Language/refetch preserve cursor history. Account/role/session changes reset it.
  There is no activity filter currently; Work status tabs affect their own chart.
- Later-page query keys include actor, session, role and cursor under the existing
  dashboard overview invalidation prefix. Existing mutation invalidations refresh
  those pages. Account changes cancel/remove old private page cache immediately;
  late session responses are rejected. Disabled/first-page hooks do not fetch,
  poll or manually refetch the new endpoint. Existing eligible polling stays 30s.
- Older backend responses without pagination metadata remain renderable as eight
  rows, with Next disabled; missing metadata never implies a ninth record.

Validation completed:
- Backend dashboard-activity HTTP/service fixture test: 0/8/9/17/24, stable equal
  timestamps and microseconds, all role scopes, reassignment revocation, active and
  initial-password guards, invalid cursor, newer insert/replay, scope beyond 250
  projects, default overview compatibility, failure/recovery and safe projection.
- Existing dashboard.service, dashboard-concurrency, dashboard-project-values and
  backend dashboard-phase-status tests passed after activity-query mock support
  for neq was added. Their original assertions were retained. A new fixture's
  page-scope assertion was corrected to retain the newer row that became authorized
  when fixture ownership expanded; no production scope was widened to satisfy it.
- Frontend dashboard-recent-activity: actual Next/Previous handlers for 0/8/9/17/19,
  full server pages, links/order, pending/error/retry/empty return and locale/account
  state. dashboard-activity-query: enabled eligibility, cursor URL, no duplicate
  first request, private keys/cache reset, mutation invalidation and late responses.
  Dashboard layout/mobile drawer and i18n parity tests also passed.
- The updated Dashboard route also compiled through the development server with
  HTTP 200 and no compilation-error marker; this is not a browser/UAT check.
- Backend and frontend tsc --noEmit passed. Strict UTF-8 and tracked/new diff checks
  passed. Three previously proven frontend HEAD test failures remain unchanged and
  were not rerun. No full build/full suite was run.

These are HTTP tests against a local ephemeral Express server with isolated
Supabase auth/query fixtures, not live PostgreSQL or logged-in browser UAT. Browser
visual verification remains unavailable from the earlier sandbox failure. No live
read/write, SQL, migration, Storage operation, stage, commit or push was performed.
Rollout needs the updated backend followed by the frontend (or coordinated release);
no schema change is required. Check a permitted account with >8 activities manually
for items 1-8, 9-16 and Previous, then an unauthorized account. Do not infer a complete
historical count from the page number.

Current checkpoint file changes for this correction:
- Backend: dashboard route/controller/service; new dashboard-activity validator and
  HTTP test; query-double support in concurrency/project-values/phase-status tests.
- Frontend: Dashboard page, RecentActivityPanel, use-dashboard hook, dashboard types,
  query keys, EN/ID, runner, layout/recent-activity tests and new activity-query test.
- Report: this document and its explicit current worktree file inventory below.
The earlier redesign/password-related files outside this scope retain their captured
hashes. No applied migration or dependency/lockfile was changed.

## Explicit final file inventory and manual Git commands

The following commands are for the owner to execute. They have NOT been run.
The file list is the reviewed 63-file inventory, including this report.

```powershell
Set-Location -LiteralPath "D:\Workflow Repository System"
if ((git branch --show-current) -ne "main") { throw "Branch bukan main." }
if (@(git diff --cached --name-only).Count -ne 0) { throw "Staging harus kosong; tinjau isinya dahulu." }
$files = @(
  "backend/src/controllers/dashboard.controller.ts"
  "backend/src/routes/dashboard.routes.ts"
  "backend/src/services/dashboard-concurrency.test.ts"
  "backend/src/services/dashboard-phase-status.test.ts"
  "backend/src/services/dashboard-project-values.test.ts"
  "backend/src/services/dashboard.service.ts"
  "frontend/package.json"
  "frontend/src/app/approvals/page.tsx"
  "frontend/src/app/change-password/page.tsx"
  "frontend/src/app/documents/page.tsx"
  "frontend/src/app/forgot-password/page.tsx"
  "frontend/src/app/globals.css"
  "frontend/src/app/layout.tsx"
  "frontend/src/app/login/page.tsx"
  "frontend/src/app/milestones/page.tsx"
  "frontend/src/app/page.tsx"
  "frontend/src/app/projects/[id]/page.tsx"
  "frontend/src/app/projects/new/page.tsx"
  "frontend/src/app/projects/page.tsx"
  "frontend/src/app/register/page.tsx"
  "frontend/src/app/reset-password/page.tsx"
  "frontend/src/app/settings/page.tsx"
  "frontend/src/app/settings/telegram-delivery-health/page.tsx"
  "frontend/src/app/settings/workflows/[id]/page.tsx"
  "frontend/src/app/users/page.tsx"
  "frontend/src/components/app-shell.tsx"
  "frontend/src/components/approvals/approval-action-dialog.tsx"
  "frontend/src/components/assignments/assign-pic-dialog.tsx"
  "frontend/src/components/dashboard/head-sa-project-values-panel.tsx"
  "frontend/src/components/dashboard/phase-work-status-panel.tsx"
  "frontend/src/components/documents/document-comments-drawer.tsx"
  "frontend/src/components/documents/upload-version-dialog.tsx"
  "frontend/src/components/language-switcher.tsx"
  "frontend/src/components/milestones/milestone-contributions-panel.tsx"
  "frontend/src/components/projects/create-project-dialog.tsx"
  "frontend/src/components/projects/milestone-timeline.tsx"
  "frontend/src/components/projects/output-document-files.tsx"
  "frontend/src/components/projects/output-documents-section.tsx"
  "frontend/src/components/projects/output-scope-section.tsx"
  "frontend/src/components/projects/pic-assignment-card.tsx"
  "frontend/src/components/projects/postpone-project-dialog.tsx"
  "frontend/src/components/projects/project-timeline-editor.tsx"
  "frontend/src/components/settings/operational-health-panels.tsx"
  "frontend/src/components/settings/personal-notification-settings.tsx"
  "frontend/src/components/ui/badge.tsx"
  "frontend/src/components/ui/button.tsx"
  "frontend/src/components/ui/card.tsx"
  "frontend/src/components/ui/dialog.tsx"
  "frontend/src/components/ui/input.tsx"
  "frontend/src/components/users/user-form-dialog.tsx"
  "frontend/src/hooks/use-dashboard.ts"
  "frontend/src/i18n/en.ts"
  "frontend/src/i18n/id.ts"
  "frontend/src/lib/query-keys.ts"
  "frontend/src/types/dashboard.ts"
  "frontend/tailwind.config.ts"
  "backend/src/services/dashboard-activity.test.ts"
  "backend/src/validators/dashboard-activity.validator.ts"
  "docs/frontend-redesign.md"
  "frontend/src/components/dashboard/recent-activity-panel.tsx"
  "frontend/src/lib/dashboard-activity-query.test.tsx"
  "frontend/src/lib/dashboard-layout.test.tsx"
  "frontend/src/lib/dashboard-recent-activity.test.tsx"
)
git --literal-pathspecs add -- $files
if ($LASTEXITCODE -ne 0) { throw "Stage gagal." }
git diff --cached --stat
git diff --cached --check
if ($LASTEXITCODE -ne 0) { throw "Diff check gagal; jangan commit." }
git commit -m "feat: refine dashboard layout and paginate recent activity"
if ($LASTEXITCODE -ne 0) { throw "Commit gagal; jangan push." }
git push origin main
if ($LASTEXITCODE -ne 0) { throw "Push gagal; cukup ulangi git push origin main." }
git status -sb
git log -1 --oneline
```

## Workspace summary overflow correction

The mobile two-column metric grid could overflow with IDR 25,000,000. Shared summary/loading grids now use one minmax(0,1fr) column below 640px, two from 640px and the existing four columns from 1280px, with min-width:0 children. Metric values use the full card width below the label/icon row and responsive type, preserving full currency text without truncation or formatting changes.

Chrome verified actual summary-component SSR fixture markup and app CSS for SALES, HEAD_SA, SA and SUPER_ADMIN, EN/ID, at 360/390/1440px. All 24 cases stayed within card/page bounds; the example revenue remained on one line, and 640px separately showed two columns. [Evidence and limitations](visual-verification-2026-10-08/workspace-summary/README.md). This is static component visual verification, not an authenticated full Dashboard session or live integration. Dashboard layout assertions and frontend TypeScript passed; UTF-8/diff checks completed at checkpoint. Existing language-switcher/login evidence remains intact.
