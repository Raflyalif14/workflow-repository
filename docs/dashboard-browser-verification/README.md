# Full Dashboard browser checkpoint — 2026-10-08

Baseline verified: `main / e25cd057d6f94f09d7e78d175f72e0ce50619012`, clean worktree and empty index. No applicable AGENTS.md was found. Chrome `154.0.8037.98`, Node `22.21.0`; existing local Next frontend was reused. User frontend/backend processes were not stopped. No application/backend code or dependency changed.

## Actual browser results

| Area | Coverage | Result |
|---|---|---|
| Dashboard | SALES, HEAD_SA, SA, SUPER_ADMIN; EN/ID; 360/390/1440 | 24/24 pass: eight initial activities, task/workspace links, complete metric values within cards, no horizontal page overflow after layout settles |
| Role tasks | Sales planning/result/waiting; SA revision/work; Head output review/workload; Admin approval overview | Synthetic tasks remain visible; SA/Head output links use the existing milestone-output deep link |
| Navigation | Drawer for every role at 360 | Focus containment, Tab wrap, Escape, opener focus and body scroll restored; Projects/Documents present; Approvals only manager roles |
| Recent Activity | Every role with 17 items | Actual cursor requests: 8 → 8 → 1, Previous returns, boundary buttons disabled; pending disables navigation; ID switch preserves page 2 |
| Activity recovery/account | SALES, 360 | Explicit 503 error, retry returns page 2; second synthetic account reloads verified profile and page 1, no old cursor/data reused |
| Other pages | Projects/Detail/Documents: every role, ID, 360/390/1440; Approvals: managers and SA at all widths, SALES restricted page at 1440 | 45 route geometry checks pass, plus SALES restriction check; no role API request to approval overview for SALES |
| Empty | HEAD_SA/SUPER_ADMIN 360; SALES 1440; SA 360/390/1440 | Empty activity and successful zero metrics; no persistent overflow. SA screenshots retain the three successful targeted checks |
| Existing dialogs | Sales estimated value, ID, three widths; Head output confirmation, EN, three widths | Values retained during locale switch; mobile review content actually scrolls at 300px viewport height and both footer buttons can be reached; Cancel makes zero business mutations |
| Login | 360 | Exactly one password-visibility control |

Manual screenshot inspection included Sales desktop, SA Indonesian mobile, Head Project Detail/Approvals, Admin desktop, and both dialog types. No proven app UI regression required a code fix. The original language-switcher/Workspace-summary fixes and existing visual evidence remain unchanged.

## Evidence

- [Machine checkpoint](checkpoint.json): final cases and isolation summaries across the separate runs.
- Root `dashboard-sales-*.png`, `drawer-sales-360.png`, `activity-last-sales-360.png`, `page-sales-*.png`: first SALES run.
- `remaining-roles/`: HEAD_SA/SA dashboard matrix, drawer, cursor and route screenshots/results.
- `super-admin/`: completed Admin matrix, drawer, cursor, routes and empty run.
- `scenarios/`: activity error/account reset, Sales dialog, login, restricted Approvals and empty screenshots/results.
- `empty-review/`: targeted SA empty screenshots, Head confirmation scrolling and cancellation results.
- [Rerunnable harness](../../frontend/tests/browser/README.md).

## Harness diagnostics, not app fixes

The first CDP wait tried to serialize a DOM node; it now evaluates Boolean. The first SALES run stopped because the restricted Approvals page was shorter than the harness's text-length threshold; the restriction is correct. Pointer-driven drawer opening after full-page capture was unreliable in this harness; keyboard activation exercised the real button instead. A SA empty assertion ran during the existing responsive margin transition (header x≈146px); after waiting 400ms for layout to settle, the 360/390/1440 checks passed (354/384/1434px client and scroll widths respectively). No CSS was changed to hide this transient result. Earlier failed harness diagnostics remain in results/failure screenshots where available.

These issues justify only the affected reruns. SALES's passed matrix was retained; error/account/dialog cases were run separately. The review-only run replaced `empty-review/results.json`; the SA empty success measurements above come from its preceding targeted run and retained screenshots, not the later JSON.

## Validation and boundaries

- Browser checks above executed against actual app pages/AuthProvider/app shell with intercepted synthetic API responses. All recorded runs have zero unconfigured fixture API calls and zero uncaught page exceptions. Unknown routes/mutations explicitly fail with HTTP 501.
- Four Node fixture tests passed (fail-closed handling, synthetic identity/locale, ordered 17-item cursors/error/empty, role fixture queues).
- Frontend `tsc --noEmit`: passed. Strict UTF-8 and whitespace checks: completed at final checkpoint.
- API fixtures are not backend authorization verification. No real GoTrue, database, Storage, file download, business mutation, or live account was exercised. No live data was changed.
- External font requests were blocked; screenshots use the system fallback, not proof of Google Fonts rendering. Testing is Chrome viewport emulation, not physical devices. Other pages were checked in ID; their full EN matrix and every possible dialog/status are not claimed.
- Owned Chrome instances/profiles were removed; the existing frontend/backend processes remain. Nothing was staged, committed or pushed.

## Files in this checkpoint

`frontend/tests/browser/`: CDP launcher, synthetic fixture module, Dashboard driver, activity/dialog driver, empty/review driver, four fixture tests, README. `docs/dashboard-browser-verification/`: screenshots, run results, combined checkpoint, this report. `docs/frontend-redesign.md`: link to this authenticated-fixture browser evidence. No production source file changed.
