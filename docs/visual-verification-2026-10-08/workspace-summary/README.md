# Workspace summary overflow - 8 October 2026

Verified starting point: main / f559349, with the existing LanguageSwitcher change and login evidence preserved. No AGENTS.md was found. Index remained empty.

## Cause and change

The shared Dashboard summary used two columns at every mobile width. On the isolated 360px fixture, the unmodified layout put the complete text IDR 25,000,000 beyond the card boundary. [Before screenshot](sales-en-360-before.png).

frontend/src/app/page.tsx now uses one minmax(0,1fr) column below 640px, two minmax(0,1fr) columns from 640px, and the existing four-column desktop layout from 1280px. Both the loading grid and loaded summary use the same breakpoints. Grid items, definition values and the shared MetricCard have min-width:0. The value uses the full card content width below the label/icon row, with responsive 20/24px type and a wrapping fallback for larger values. No ellipsis, clipping, hidden value, rounding or currency formatting change was added. The existing label, semantic icon and description remain.

SALES, HEAD_SA, SA and SUPER_ADMIN all use this shared summary grid/MetricCard. The separate Head SA project-value panel already starts with one column and min-width:0/wrapping values, so it was not changed.

## Actual browser evidence and limits

Chrome 154.0.8037.98 ran with a dedicated disposable profile and local DevTools. The existing dashboard-layout test fixture rendered the actual Dashboard components to HTML; only its synthetic estimate was set to 25,000,000 in a temporary copy. The summary section used the running application's actual compiled stylesheet and Plus Jakarta Sans. The static fixture modeled Dashboard padding and the 248px desktop sidebar offset. It did not contain auth tokens, a synthetic login, API mocks or live data.

These are real Chromium layout measurements/screenshots of the actual summary component SSR markup. They are not an authenticated full Dashboard session. Full-page/sidebar interaction, live metrics, GoTrue and Storage integration remain unverified. Login screenshots from the preceding checkpoint are separate evidence and do not establish Dashboard correctness.

| Role | Locale | Viewport | Columns | Layout result | Evidence |
| --- | --- | --- | --- | --- | --- |
| SALES | EN | 360px | 1 | PASS | [Screenshot](sales-en-360.png) |
| SALES | EN | 390px | 1 | PASS | [Screenshot](sales-en-390.png) |
| SALES | EN | 1440px | 4 | PASS | [Screenshot](sales-en-1440.png) |
| SALES | ID | 360px | 1 | PASS | [Screenshot](sales-id-360.png) |
| SALES | ID | 390px | 1 | PASS | [Screenshot](sales-id-390.png) |
| SALES | ID | 1440px | 4 | PASS | [Screenshot](sales-id-1440.png) |
| HEAD_SA | EN | 360px | 1 | PASS | [Screenshot](head_sa-en-360.png) |
| HEAD_SA | EN | 390px | 1 | PASS | [Screenshot](head_sa-en-390.png) |
| HEAD_SA | EN | 1440px | 4 | PASS | [Screenshot](head_sa-en-1440.png) |
| HEAD_SA | ID | 360px | 1 | PASS | [Screenshot](head_sa-id-360.png) |
| HEAD_SA | ID | 390px | 1 | PASS | [Screenshot](head_sa-id-390.png) |
| HEAD_SA | ID | 1440px | 4 | PASS | [Screenshot](head_sa-id-1440.png) |
| SA | EN | 360px | 1 | PASS | [Screenshot](sa-en-360.png) |
| SA | EN | 390px | 1 | PASS | [Screenshot](sa-en-390.png) |
| SA | EN | 1440px | 4 | PASS | [Screenshot](sa-en-1440.png) |
| SA | ID | 360px | 1 | PASS | [Screenshot](sa-id-360.png) |
| SA | ID | 390px | 1 | PASS | [Screenshot](sa-id-390.png) |
| SA | ID | 1440px | 4 | PASS | [Screenshot](sa-id-1440.png) |
| SUPER_ADMIN | EN | 360px | 1 | PASS | [Screenshot](super_admin-en-360.png) |
| SUPER_ADMIN | EN | 390px | 1 | PASS | [Screenshot](super_admin-en-390.png) |
| SUPER_ADMIN | EN | 1440px | 4 | PASS | [Screenshot](super_admin-en-1440.png) |
| SUPER_ADMIN | ID | 360px | 1 | PASS | [Screenshot](super_admin-id-360.png) |
| SUPER_ADMIN | ID | 390px | 1 | PASS | [Screenshot](super_admin-id-390.png) |
| SUPER_ADMIN | ID | 1440px | 4 | PASS | [Screenshot](super_admin-id-1440.png) |

In all 24 cases document.scrollWidth equals document.clientWidth, every value's text rectangles stay inside its card, and value scrollWidth does not exceed its clientWidth. The SALES amount remains exactly IDR 25,000,000 or Rp 25.000.000 and fits on one line at 360/390/1440px. The 640px breakpoint was separately measured as two columns. Measurements are retained in [observations.json](observations.json). The old 360px fixture reported textFits=false; the corrected fixture reports true. Browser fixture traffic contained zero API or mutation requests.

## Validation and files

- Existing dashboard-layout assertions passed for all four roles and EN/ID, including task links, loading/error/empty handling and the separate Node drawer handler fixture. The temporary visual fixture reused those assertions with a larger synthetic estimate. This does not claim drawer browser verification.
- Frontend tsc --noEmit passed after the final UI change.
- Strict UTF-8 and git diff --check passed at final checkpoint.
- Application change: frontend/src/app/page.tsx only for this task; the previous LanguageSwitcher change remains.
- Reports: this README, the parent visual checkpoint and docs/frontend-redesign.md.
- Evidence: 24 final summary screenshots, one before screenshot and safe measurement JSON in this directory.
- Temporary loader/HTML/test copy and the task Chrome profile were removed; existing user frontend/backend/browser processes were left running. No backend, permission, workflow, data, migration, stage, commit or push changed.
