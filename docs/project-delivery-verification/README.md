# Project delivery responsive layout

Baseline inspected: `main / 1e6f772`, empty staging. Existing approval/PIC,
Official Documents, SA badge and Assigned work changes were retained.

## Cause and change

Delivery rows and headers used the viewport `2xl` breakpoint (1536px).
At 1440px the rows remained a single-column stack and the Open link stretched
as a grid item. A separate 980px minimum width also forced scrolling at larger
viewports without considering the sidebar's available panel width.

The panel now uses an inline-size container query:

- Panel width >=960px: Projects | PIC | Current work | Status | Progress | Open.
  The header and rows share column widths; per-row labels are hidden.
- Narrower panels: two columns; on small mobile the project name spans both
  columns and metadata uses two columns. At >=560px the name joins the two-column
  layout. Names wrap in full, with no ellipsis or clipping.
- Vertical padding is 12px, with no minimum row height. Open is a compact blue
  link button, aligned right. Progress retains its existing percentage, clamp
  for the bar, unknown state and completed/total stage counts.
- Existing SA/admin customer, deadline/risk and admin owner information remains
  as supplementary metadata. Sales keeps its distinct revenue opportunity
  layout and estimated values, with the same compact Open control.

No data selection, ordering, calculation, authorization, API, cache invalidation,
workflow, mutation, or backend change was made.

## Validation

- Existing `dashboard-layout.test.tsx`, extended with retained project links,
  PIC, current work, progress/stages, compact controls and supplemental metadata:
  PASS across all four roles and EN/ID. Loading/error/empty, workspace navigation
  and drawer behavior remain covered by the existing tests.
- Existing `dashboard-ux.test.ts`: PASS.
- Frontend installed TypeScript `tsc --noEmit`: PASS.
- Strict UTF-8 of task text files and `git diff --check`: PASS.
- The initial browser check expected a `1/2` string; the actual dictionary uses
  `1 of 2 stages` / `1 dari 2 tahap`. The fixture assertion was corrected to
  those exact existing labels. No app behavior or assertion strength was changed.
- An initial local ts-node invocation used classic JSX; rerunning with the
  application's automatic JSX runtime passed. No dependency was added.

## Actual Chrome evidence

`node frontend/tests/browser/project-delivery-browser.cjs` uses the existing
fixture and CDP harness, actual Dashboard/AuthProvider/app shell, an owned Chrome
profile, and the existing loopback dev server. Unconfigured API calls fail and
external requests are blocked. No live credentials, data or mutations are used.

Chrome 154.0.8037.98: **40/40 checks PASS**:

| Roles | Languages | Viewports / sidebar |
| --- | --- | --- |
| SALES, HEAD_SA, SA, SUPER_ADMIN | EN and ID | 1440px open, 1440px closed, 768px, 390px, 360px |

Checks cover full project-name fit, no page/row horizontal overflow, preserved
project links, small Open buttons, desktop six-column header alignment, medium
and mobile two-column layout, progress bar/percentage/stage counts, and responsive
label visibility. Desktop delivery rows in the fixtures are 72-104px tall,
including long names and supplementary metadata. Mobile height follows content.
The Sales opportunity layout remains unchanged apart from the Open control.

The desktop screenshot exposed differing automatic widths for the Open header
versus its button. A shared 5.5rem action column corrected that; the final browser
run asserts alignment and regenerated evidence. Final results have zero unknown
API calls and zero browser runtime errors. Owned browser/profile resources were
cleaned up; the user's dev server was left running.

Evidence: `results.json`, `head-sa-en-1440-open.png`,
`head-sa-en-1440-closed.png`, `head-sa-id-768.png`, `head-sa-id-390.png`,
`head-sa-id-360.png`. Desktop open and mobile 360 screenshots were also inspected.
The mobile screenshot includes the development server's Next.js indicator.

This proves browser presentation with synthetic API, not live backend permissions,
Supabase/GoTrue/Storage integration, or production project state.

## Scoped files

- `frontend/src/app/page.tsx`
- `frontend/src/app/globals.css`
- `frontend/src/lib/dashboard-layout.test.tsx` (already registered in runner)
- `frontend/tests/browser/project-delivery-browser.cjs`
- This report, results and five screenshots.

No migration or rollout of SQL is needed. No stage, commit or push was performed.
