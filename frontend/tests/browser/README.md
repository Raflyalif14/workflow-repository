# Isolated Chrome dashboard checks

Uses installed Chrome, Node 22's native WebSocket, and the actual running Next frontend. No added dependency, application bypass, production test endpoint, or role selector. Login submits the real form; AuthProvider processes a synthetic API login response.

Run from the repository root with the existing frontend running on loopback:

```powershell
node --test frontend/tests/browser/fixtures.test.cjs
Remove-Item Env:WORKFLOW_TEST_ROLES -ErrorAction SilentlyContinue
Remove-Item Env:WORKFLOW_TEST_OUTPUT -ErrorAction SilentlyContinue
Remove-Item Env:WORKFLOW_REVIEW_ONLY -ErrorAction SilentlyContinue
$env:WORKFLOW_TEST_ORIGIN = 'http://127.0.0.1:3000'
node frontend/tests/browser/dashboard-browser.cjs
if ($LASTEXITCODE -ne 0) { throw 'Dashboard browser check failed; inspect results.json and failure.png.' }
node frontend/tests/browser/activity-dialog-browser.cjs
if ($LASTEXITCODE -ne 0) { throw 'Activity/dialog browser check failed.' }
node frontend/tests/browser/empty-review-browser.cjs
if ($LASTEXITCODE -ne 0) { throw 'Empty/review browser check failed.' }
```

Optional `WORKFLOW_TEST_CHROME` selects the existing Chrome executable. `WORKFLOW_TEST_ROLES` selects comma-separated roles for the matrix; `WORKFLOW_TEST_OUTPUT` selects its evidence directory. `WORKFLOW_REVIEW_ONLY=1` skips the already-verified SA empty section of the final script. No npm install is needed. Browser scripts are deliberately separate from the normal unit runner: they require a local frontend and Chrome.

## Isolation

- Fresh temporary `workflow-browser-fixture-*` profile per invocation. No existing browser profile or user process is touched.
- CDP Fetch interception is enabled before navigation. `/api/*` requests are fulfilled from fixtures; unconfigured reads/writes return HTTP 501 and fail the final check. Non-frontend external HTTP requests are blocked. Host resolution permits only loopback. Bundled fonts are served by the local frontend; external font requests remain blocked.
- Only the specified loopback frontend origin is forwarded, for pages/assets/HMR. This harness must be used with these client-rendered app pages, not arbitrary SSR routes that perform server-side external fetches. It is not an OS firewall or an assertion about an unrelated server process.
- Fixture responses contain synthetic UUIDs, names, `.invalid` emails, and explicitly fake session tokens. Traffic logs retain methods, paths, status, role, and synthetic account number; no request headers or token values are recorded.
- Unknown business mutations fail closed. Checked dialogs are cancelled; tests do not submit business changes or obtain download URLs.
- Account reset uses a synthetic second-account storage event, then the actual AuthProvider reloads `/auth/me` and clears its query cache. No application session code is replaced.
- `finally` closes only the owned Chrome instance and deletes only its verified temporary profile. Screenshots/results remain as evidence.

## Scope and limitations

The focused rendering check covers Projects/Documents summaries in EN/ID at 1440/390 px, bundled font loading, page overflow, and runtime errors. Projects uses one ACTIVE and one WON fixture: the completed counter must be 1, the completed tab must request `status_group=DELIVERY_COMPLETED`, and only WON must remain visible. Returning to All projects restores both rows. With the frontend running locally, execute from the repository root:

```powershell
$env:WORKFLOW_TEST_ORIGIN = 'http://127.0.0.1:3035'
node frontend/tests/browser/frontend-rendering-browser.cjs
```

Set the port to the actual local frontend port. Results and two screenshots are written to `.cache/frontend-rendering/`. This uses synthetic SALES credentials and intercepts API calls, including disabled camera capabilities; it never requests a real camera or writes to a production account.

### Dashboard refactor verification

To verify the Dashboard refactor against an isolated production frontend and keep new evidence separate from the earlier checkpoint:

```powershell
$env:WORKFLOW_TEST_ORIGIN = 'http://127.0.0.1:3036'
$env:WORKFLOW_TEST_OUTPUT = Join-Path $PWD '.cache/clean-code-dashboard/browser'
$env:WORKFLOW_TEST_ROLES = 'SALES,HEAD_SA,SA,SUPER_ADMIN'
node frontend/tests/browser/dashboard-browser.cjs
```

Run from the repository root and set the port to the running local frontend. The existing matrix covers all four roles, EN/ID, 360/390/1440 px, work links, metric layout, navigation, activity paging, empty results, and related routes. Unexpected frontend runtime errors or unconfigured API calls fail the run. The `fixtureBaseline` field identifies the historical fixture baseline, not the revision of the running app. All API responses use synthetic data; these checks do not verify live backend authorization or database contents.

### Navigation feedback

With a local production frontend running, execute from the repository root:

```powershell
$env:WORKFLOW_TEST_ORIGIN = 'http://127.0.0.1:3035'
node frontend/tests/browser/navigation-feedback-browser.cjs
```

This check uses a fresh synthetic HEAD_SA session for EN/ID at 1440/390 px. It holds actual route requests, verifies immediate feedback after clicking a sidebar link, closes the mobile drawer, checks same-page clicks and Back, and injects slow/failed API responses. It records click-to-DOM-feedback, click-to-route, and API request durations in `.cache/navigation-feedback/results.json`, plus two screenshots. These are controlled UX measurements, not live database performance results. The optional `--baseline` switch is for a pre-change build without the indicator and writes `baseline.json`.

Do not run `next dev` and `next build`/`next start` against the same `.next` directory concurrently: development may overwrite production chunks. For a standalone build with `outputFileTracingRoot` set to the repository root, the server is `frontend/.next/standalone/frontend/server.js`; copy `.next/static` into its `.next/static` before starting it on the test port. The navigation checks use bundled static assets and synthetic APIs, without camera/model assets from `public`. Use a separate checkout/build directory when rebuilding while development remains active.

### Cached page refresh feedback

```powershell
$env:WORKFLOW_TEST_ORIGIN = 'http://127.0.0.1:3036'
node frontend/tests/browser/navigation-refresh-browser.cjs
```

Runs 16 cached-data cases: Projects/Milestones × EN/ID × 1440/390 px × success/error. API responses are delayed by 900 ms to separate route commit from query completion. Checks retained cached content, visible refresh status, unchanged header height, mobile drawer closure, one successful shared request, the existing one-retry error policy, cleanup of indicators and overflow/runtime errors. All accounts/APIs are synthetic. Results are in `.cache/navigation-refresh-2026-10-20/results.json`. `--baseline` checks a build without the new cached-data indicator. `--capture` runs a smaller screenshot matrix and writes `visual-results.json`; do not use those screenshot-instrumented timings for performance comparisons.

### Project detail refactor

```powershell
$env:WORKFLOW_TEST_ORIGIN = 'http://127.0.0.1:3036'
node frontend/tests/browser/project-detail-browser.cjs
```

Runs 18 scenarios on the actual project-detail page: SALES/SA/HEAD_SA/SUPER_ADMIN × EN/ID × 1440/390 px, plus two HEAD_SA draft-review cancellation checks. Covers intake/activity sections, milestone expansion/collapse, role-scoped deletion controls, required rejection notes, mobile layout, and runtime errors. All accounts and API responses are synthetic; project mutations and unknown requests fail the run. Results/screenshots are under `.cache/clean-code-project-detail/browser/`. The separate `project-review-dialogs.test.tsx` unit test exercises confirmation payloads, duplicate/stale submission guards, PIC selection/conflict, and retained revisions with mocked mutations.

### Milestones queues

```powershell
$env:WORKFLOW_TEST_ORIGIN = 'http://127.0.0.1:3036'
node frontend/tests/browser/milestones-browser.cjs
```

Runs 24 scenarios on the actual Milestones page: four roles × EN/ID × 1440/390 px, plus eight localized error/empty checks for SA and Head SA. Verifies tab/snapshot counts, assignment and output-review anchors, mixed/paused/completed assignments, loading feedback, and role-scoped queries. Synthetic APIs only; unexpected requests, business mutations, and runtime errors fail the run. Results and two screenshots are under `.cache/clean-code-milestones/browser/`. The existing `assigned-work-page.test.tsx` also covers independent assignment/review failures without depending on internal row component nesting.

### Approvals list and dialogs

```powershell
$env:WORKFLOW_TEST_ORIGIN = 'http://127.0.0.1:3036'
node frontend/tests/browser/approvals-browser.cjs
```

Runs 20 scenarios: four roles × EN/ID × 1440/390 px, plus stale-cache/retry/empty flows for Head SA and Super Admin in both languages. Covers category/history/search filters, 23 pending records across pages, retired pending exclusions, snapshot counts, rejection validation, PIC selection and confirmation cancellation, read-only Super Admin details, keyboard navigation, and exact output snapshot links. Only synthetic auth/language requests may write; business mutations fail the test. Evidence is under `.cache/clean-code-approvals/browser/`. Existing unit tests cover mutation payloads, retained PIC revisions, uncertain-response retries, and permission wiring.

### Documents repository and versions

```powershell
$env:WORKFLOW_TEST_ORIGIN = 'http://127.0.0.1:3036'
node frontend/tests/browser/documents-browser.cjs
```

Runs 24 scenarios: four roles × EN/ID × 1440/390 px, plus eight denied-detail/retry/error/empty flows. Covers combined official/output results, approved-output deduplication, category/status/search filters, keyboard access tabs, pagination, private-project links, version history visibility, upload-dialog cancellation, and exact version/file download requests. Downloads use dummy URLs and a synthetic archive response; the browser captures download intentions without opening tabs or saving files. This verifies frontend download handling, not actual Storage files, ZIP contents, or server authorization. Evidence is under `.cache/clean-code-documents/browser/`. No business writes are allowed.

### Recent activity page numbers and direct jump

Run `node frontend/tests/browser/activity-pagination-browser.cjs` with `WORKFLOW_TEST_ORIGIN` set to the loopback frontend. Covers EN/ID at 360/1440 px, exact page totals, direct page 1 → 3 via Enter, bounds, loading locks, Next/Previous, failure/retry and account reset. Uses synthetic APIs; server scope/count behavior is tested separately. Evidence: `.cache/activity-pagination-2026-10-20/`.

### Recent activity filters

Run `node frontend/tests/browser/activity-filters-browser.cjs` against the same loopback frontend. Covers EN/ID at 360/390/1440 px, combined project/type/date filters, Apply versus draft changes, count/pagination, Reset, empty/error/retry and account isolation. Uses synthetic API responses; actual filtering and authorization are tested in the backend dashboard tests. Evidence: `.cache/activity-filters-2026-10-20/`. `--mobile-preview` reruns only the 360 px Indonesian case after a visual adjustment, keeping the full matrix results separately.

Dashboard matrix: four roles × EN/ID × 360/390/1440px, tasks/revision/waiting, workspace links, metric bounds and page overflow. Drawer: keyboard open, focus containment, Tab wrap, Escape, focus/scroll restoration. Other routes: Projects, Project Detail, Documents, Approvals in Indonesian at three widths; SALES/SA Approvals remain restricted. Activity: 17 rows, numbered page requests, 8/8/1, pending/error/retry, locale retention and account reset. Dialogs: actual estimated-value edit and output-review confirmation, including short-height scrolling and cancellation.

Fixtures test frontend behavior, not server authorization, database invariants, GoTrue, Storage, real downloads, all possible statuses, or all application dialogs. Page overflow checks do not ban intentional scrolling within tables/filter toolbars. Screenshots use desktop Chrome emulated viewport dimensions, not real mobile hardware. Do not infer production performance from these runs.

See [recorded checkpoint](../../../docs/dashboard-browser-verification/README.md). Initial harness failures and the reason they were corrected are retained there; passing checks are not silently substituted for failed UI checks.
