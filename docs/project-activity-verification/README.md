# Readable Project Detail activity

Presentation-only change on `main / 1e6f7727`, preserving the pending plan CTA changes.

- Project and milestone UUIDs no longer appear in structured activity text. Available project/milestone/scenario names are used instead. Missing names have localized fallbacks, not guessed names or raw IDs.
- Technical reference-only fields are omitted from the display; version numbers, counts, business values, user text and before/after evidence remain. Underlying API responses and database audits are unchanged.
- Schedule changes pair rows internally by ID and display milestone names, start date, working days and due date under localized Before/After labels. Unchanged schedule rows are omitted. Null/missing values say Not set / Belum diatur.
- Existing pagination, actor/time metadata, project read access and backend behavior are unchanged; no extra data requests were added.

## Validation completed

Activity timeline, business audit and i18n tests PASS. Frontend TypeScript, strict UTF-8 and diff check PASS. The initial business-audit runner invocation could not resolve React from the root; using the installed frontend node_modules via NODE_PATH resolved the runner without changing assertions/dependencies.

Local Chrome with isolated synthetic API fixtures PASS in EN/ID at 360, 390 and 1440px: readable names and dates, no technical UUID/null output or horizontal page overflow, no unhandled fixture requests/runtime errors and no business mutations. Four screenshots and the six-case results.json are retained. This proves browser rendering with fixtures, not live database/Storage behavior. Only the harness-owned Chrome profile/process was removed.

To repeat with the local frontend already running:

```powershell
node frontend/tests/browser/project-activity-browser.cjs
```

No live data, SQL, backend changes, stage, commit or push.
