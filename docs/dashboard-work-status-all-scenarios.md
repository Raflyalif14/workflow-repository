# Dashboard work status: All scenarios

## Findings and behavior

The existing two filters intentionally cover only Pra-Tender Active/Postponed and current tender Won/Lost. Tender ACTIVE was therefore absent from both. The role-scoped project query already reads all pages of 250 with deterministic updated_at/id ordering, explicitly embeds the active phase, and aborts on a failed later page. No new query or endpoint is needed.

`allWorkStatus` adds an independent, nullable aggregate to the existing Dashboard response. It counts unique scoped project IDs, including tender ACTIVE and Pra-Tender COMPLETED. Existing `phaseWorkStatus` remains compatible. Null or missing aggregates mean unavailable; explicit zero counts mean an empty loaded scope.

All categories: Planning (DRAFT), Active (ACTIVE), Postponed, Completed, Won, Lost. The active Supabase schema also supports WAITING_RESULT and CANCELLED: these have explicit Waiting for result and Cancelled categories, shown when present. Waiting for result is unfinished Sales work; cancellation is not completion or a lost tender. Unknown statuses, missing required pause data, and conflicting duplicate classifications invalidate the aggregate. A null legacy pause flag follows existing `!== true` semantics. Final COMPLETED/WON/LOST/CANCELLED take precedence over leftover postponed flags. Otherwise POSTPONED or a true pause flag takes precedence over Planning/Active/Waiting for result. No workflow status or KPI/revenue calculation changes.

Phase filters follow active_phase_id to the named project_phases FK, validate project ownership, phase key, phase scenario, and current_scenario_id. Missing/foreign/mismatched READY relations are unavailable. Legacy fallback is allowed only without a phase, for LEGACY_REVIEW or pre-phase rows without migration metadata, and without a conflicting current scenario. No milestones or outputs are used to guess a phase. Invalid phase metadata does not suppress a valid All aggregate.

The All filter defaults on mount. All total is the number of unique scoped projects. Pra-Tender total is Active + Postponed; tender total is Won + Lost. These totals are labelled separately. Chart and legend share one validated presentation helper and consistent status colors. Selection is local state and survives prop/locale changes. Zero displays an empty state without fake slices. Failed refresh retains valid previous data with a stale notice and retry. A missing new aggregate from an old backend never becomes zero or a sum of the two narrow phase filters.

## Freshness and access

Existing ownership/PIC/global role scopes, polling, focus refresh, query keys, and account-change cache clearing are retained. Create project previously invalidated only the project list; it now also invalidates Dashboard. Existing plan submit/review, postpone/resume, close/continue phase, outcome, deletion and PIC reassignment invalidation already covers Dashboard. Filter selection sends no request or mutation.

## Files in this change

- `backend/src/services/dashboard.service.ts`
- `backend/src/services/dashboard-phase-status.test.ts`
- `frontend/src/types/dashboard.ts`
- `frontend/src/lib/dashboard-phase-status.ts`
- `frontend/src/lib/dashboard-phase-status.test.ts`
- `frontend/src/components/dashboard/phase-work-status-panel.tsx`
- `frontend/src/app/page.tsx`
- `frontend/src/hooks/use-projects.ts`
- `frontend/src/i18n/en.ts` and `id.ts`
- This guide.

The existing explicit frontend runner already includes dashboard-phase-status.test.ts; no duplicate registration or package changes were needed.

## Validation and deployment

Passed four backend test files: dashboard-phase-status, dashboard.service, dashboard-concurrency and dashboard-project-values. Passed frontend dashboard-phase-status and i18n tests, including real mocked mutation invalidation callbacks, default/filter retention, chart/legend, unavailable/zero, refresh error and EN/ID. Both TypeScript noEmit checks passed. Strict UTF-8 and diff checks cover the changed files.

These are mock/fixture and rendered-tree checks, not live PostgreSQL/browser UAT. Local ports 3000/5000 were unavailable; no production counts, timings or mobile layout were measured. No SQL, live data mutation, full suite/build, stage, commit or push was performed. The existing unrelated Dashboard UX test was not edited or run in this scoped validation.

Deploy backend first, then frontend. The old frontend still consumes the unchanged phase field. The new frontend with an old backend displays All as unavailable and can still use valid phase filters. No migration or dependency update is required. Manually verify three filters, role scopes, refresh/locale retention and responsive layout after deployment using authorized existing data.
