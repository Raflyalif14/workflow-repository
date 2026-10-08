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
- CDP Fetch interception is enabled before navigation. `/api/*` requests are fulfilled from fixtures; unconfigured reads/writes return HTTP 501 and fail the final check. Non-frontend external HTTP requests are blocked. Host resolution permits only loopback; Google Fonts are blocked, so the system fallback is used.
- Only the specified loopback frontend origin is forwarded, for pages/assets/HMR. This harness must be used with these client-rendered app pages, not arbitrary SSR routes that perform server-side external fetches. It is not an OS firewall or an assertion about an unrelated server process.
- Fixture responses contain synthetic UUIDs, names, `.invalid` emails, and explicitly fake session tokens. Traffic logs retain methods, paths, status, role, and synthetic account number; no request headers or token values are recorded.
- Unknown business mutations fail closed. Checked dialogs are cancelled; tests do not submit business changes or obtain download URLs.
- Account reset uses a synthetic second-account storage event, then the actual AuthProvider reloads `/auth/me` and clears its query cache. No application session code is replaced.
- `finally` closes only the owned Chrome instance and deletes only its verified temporary profile. Screenshots/results remain as evidence.

## Scope and limitations

Dashboard matrix: four roles × EN/ID × 360/390/1440px, tasks/revision/waiting, workspace links, metric bounds and page overflow. Drawer: keyboard open, focus containment, Tab wrap, Escape, focus/scroll restoration. Other routes: Projects, Project Detail, Documents, Approvals in Indonesian at three widths; SALES/SA Approvals remain restricted. Activity: 17 rows, real cursor requests, 8/8/1, pending/error/retry, locale retention and account reset. Dialogs: actual estimated-value edit and output-review confirmation, including short-height scrolling and cancellation.

Fixtures test frontend behavior, not server authorization, database invariants, GoTrue, Storage, real downloads, all possible statuses, or all application dialogs. Page overflow checks do not ban intentional scrolling within tables/filter toolbars. Screenshots use desktop Chrome emulated viewport dimensions, not real mobile hardware. Do not infer production performance from these runs.

See [recorded checkpoint](../../../docs/dashboard-browser-verification/README.md). Initial harness failures and the reason they were corrected are retained there; passing checks are not silently substituted for failed UI checks.
