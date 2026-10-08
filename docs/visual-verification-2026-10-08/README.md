# Visual verification checkpoint - 8 October 2026

Baseline verified: main / f55934937d18444e75c2798aafffd98ee504fb8e. Worktree and index were clean. No applicable AGENTS.md was found in the repository or checked ancestors. This checkpoint is PARTIAL; it is not completion of four-role browser QA.

## Browser and fixture inventory

- Chrome 154.0.8037.98 and Edge 154.0.4258.62 are installed.
- Browser Use initialization failed before opening a tab: node_repl kernel exited with windows sandbox failed: helper_unknown_error: setup refresh had errors. No repeated initialization or user-browser interaction followed.
- Ordinary shell initialization also failed; the approved elevated execution mechanism worked. Native Chrome headless and its loopback DevTools worked with a new disposable profile. No sandbox-disabling flags were used.
- No installed Playwright, playwright-core, @playwright/test, Puppeteer, puppeteer-core or Selenium package resolved from frontend/backend; no browser fixture harness/configuration was found.
- Existing dashboard-layout, dashboard-recent-activity, document-repository-page and approval-queue-ui fixtures replace hooks or render in Node. They do not create browser sessions or an HTTP mock environment. Their prior passing results are code/component evidence, not interactive visual verification.
- Existing frontend/backend listeners on 3000/5000 were left running. Only public /login on 127.0.0.1:3000 was opened, using a fresh browser profile without an account. Auth bootstrap was inspected: no session returns before profile fetching. Recorded browser API/mutation requests were both zero.
- No dependency, mock server, alternate authentication path or new infrastructure was added. Authenticated synthetic browser coverage remains blocked by the absence of a browser-ready fixture environment within this scope. Native screenshots alone cannot exercise the Node fixture hooks in the application browser.

## Actual browser results

Viewport height was 1000 CSS px; mobile checks are narrow Chromium viewports, not physical touch-device testing. Screenshots include full vertical content. Chrome DevTools metrics explicitly set and verified the viewport; native --window-size alone produced misleading clipped mobile screenshots, which were replaced before this checkpoint.

| Actor | Viewport | Page | Locale | Result/evidence |
| --- | --- | --- | --- | --- |
| Anonymous isolated profile | 1440 x 1000 | Login | EN | PASS - [screenshot](login-en-1440.png) |
| Anonymous isolated profile | 390 x 1000 | Login | EN | PASS - [screenshot](login-en-390.png) |
| Anonymous isolated profile | 360 x 1000 | Login | EN | PASS - [screenshot](login-en-360.png) |
| Anonymous isolated profile | 1440 x 1000 | Login | ID | PASS - [screenshot](login-id-1440.png) |
| Anonymous isolated profile | 390 x 1000 | Login | ID | PASS - [screenshot](login-id-390.png) |
| Anonymous isolated profile | 360 x 1000 | Login | ID | PASS after language-label fix - [screenshot](login-id-360.png) |

All six measured document.scrollWidth equal document.clientWidth. Exactly one password button exists. Enter toggles password -> text -> password, Tab advances to Sign in with a visible blue focus ring, and vertical scrolling reaches the form footer. Login/registration links and controls remain visible. No credentials were entered and no form was submitted. Locale changes executed the existing select change handler and persisted within the isolated guest profile. Raw safe measurements are in [login-observations.json](login-observations.json).

The development indicators (Next and React Query devtools) appear in screenshots. They are not treated as production application controls. No production-mode or touch-device verification is claimed.

## Proven UI issue and smallest fix

The native language select had max-w-[100px], visibly clipping Bahasa Indonesia to Bahasa Ind on mobile. [Before screenshot](login-id-360-before.png). LanguageSwitcher now uses min-w-0 max-w-full, preserving native select, callbacks and disabled state. It measures 138px and shows the complete label at all checked widths. This is the only application source change. Shared authenticated topbar fit still needs its own browser check; login evidence does not prove that layout.

## Coverage still pending

| Role | Viewports | Pages | Browser status |
| --- | --- | --- | --- |
| SALES | 1440, 390, 360 | Dashboard, Projects, Project Detail, Documents; Approvals access restriction | NOT RUN - isolated authenticated browser fixture unavailable |
| HEAD_SA | 1440, 390, 360 | Dashboard, Projects, Project Detail, Documents, Approvals | NOT RUN - same blocker |
| SA | 1440, 390, 360 | Dashboard, Projects, Project Detail, Documents; Approvals access restriction | NOT RUN - same blocker |
| SUPER_ADMIN | 1440, 390, 360 | Dashboard, Projects, Project Detail, Documents, Approvals | NOT RUN - same blocker |

No browser pass is claimed for role task completeness, waiting information, sidebar/drawer focus and Escape, dialogs, tables/filters, Recent Activity 8-item Next/Previous or its loading/error/retry boundaries. Existing tests for those features were not rerun without a related change. Protected route/API permissions were not changed or bypassed. GoTrue, Storage and real account integration remain unverified.

## Validation and cleanup

- i18n dictionary test: PASS, using existing frontend/scripts/run-local-test.cjs and installed ts-node; no dependency install.
- Frontend TypeScript --noEmit: PASS.
- Six browser login checks after the UI change: PASS, with screenshots and measurements above.
- Strict UTF-8 on changed/new text and git diff --check: checked at final checkpoint.
- No full build/suite, database read/write, migration, live account mutation, stage, commit or push.
- The only task-owned runtime was the isolated Chrome profile; closed and removed at final checkpoint. Existing user processes were not stopped. Evidence screenshots and this report are deliberately retained.

## Checkpoint files

- frontend/src/components/language-switcher.tsx
- docs/visual-verification-2026-10-08/README.md
- docs/visual-verification-2026-10-08/login-observations.json
- Six final login-{en,id}-{1440,390,360}.png screenshots
- login-id-360-before.png

To finish the requested visual matrix, a permitted browser-ready synthetic account/API fixture is needed; then verify the protected pages and their real client interactions at the listed viewports. Do not treat this checkpoint as authorization/UAT evidence.

## Follow-up: Workspace summary mobile overflow

The shared Dashboard summary grid and MetricCard now keep the full estimated amount inside the card: one column below 640px, two from 640px, four from 1280px; minmax tracks/min-width:0 and responsive values. [Detailed fixture-browser results and screenshots](workspace-summary/README.md). All four roles were checked in EN/ID at 360/390/1440px using actual summary SSR markup and app CSS in Chrome; 24 layout measurements passed. This extends component-layout evidence only. Authenticated full Dashboard and other protected-page coverage above remains pending. The prior LanguageSwitcher fix and login evidence are preserved.
