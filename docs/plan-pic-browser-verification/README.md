# Plan/PIC frontend regression verification

2026-10-09, baseline `main / 1e6f772`. Chrome 154.0.8037.98, isolated profile.

## Proven cause

The project SELECT already requests `pic_revision_exact:pic_revision::text`, but
`ProjectManagementService.mapProject` omitted both revision fields from the
response. Both real plan review dialogs read `project.pic_revision`. Before
opening confirmation they rejected an undefined revision using the generic
`picOperation.failed` message. This branch never calls the mutation hook or
fetch, explaining a screen with only successful read requests and no backend
`[PicMutation]` log.

The previous browser fixture hardcoded a revision and concealed this contract
gap. This harness now creates its project response by calling the actual backend
detail service with a mocked database row containing a real-shaped numeric
revision and its exact text projection. It does not invent the DTO field.

## Fix

- The shared backend project mapper returns `pic_revision` from the already
  selected exact text alias. Zero and large bigint revisions retain precision.
  A safe legacy numeric/string fallback is supported; absent or unsafe numeric
  revision is not replaced with zero. No database/schema/RPC changes.
- Project Detail and Approvals distinguish incomplete review data and local
  request preparation failures from an uncertain mutation result. Reload keeps
  PIC and notes. Local stale review remains blocked before mutation.
- UUID preparation now occurs within try/finally so an exception cannot leave
  the dialog busy latch stuck. Existing capture, permission, CAS and retry
  identity policy is preserved. No automatic approval retry is introduced.
- New messages are available in English and Indonesian.

## Actual browser evidence

`before-results.json` and `before-missing-revision.png` were captured before the
mapper fix, using the actual original response mapper: undefined revision,
generic failure at Review decision, no confirmation and **zero mutation**.

`after-results.json` records the completed checks after the fix:

| Check | Result |
| --- | --- |
| Review decision opens existing confirmation | PASS |
| Cancel causes no mutation | PASS, both Project Detail and Approvals |
| Double final submit sends one request | PASS, native form/handler latch |
| Header/payload | PASS, synthetic Bearer authorization, JSON, correct approval/PIC, server revision and UUID |
| Uncertain response and explicit retry | PASS, both workspaces preserve request ID and complete body |
| Language change during retained retry | PASS, note and request identity retained through EN/ID |
| Missing revision after fix | PASS, local message says no decision was sent; no new request |
| Reload recovery | PASS, both workspaces keep PIC/notes and restore confirmation |
| Unknown API route / browser exception | None |

Four intercepted synthetic mutation requests represent two requests plus their
explicit retries across the two workspaces. Their payloads and authorization
headers are checked in memory and are not saved in reports or screenshots.
The before capture uses Chrome's original default viewport; after captures use
1440 x 1000. This is focused interaction verification, not a new mobile matrix.

Screenshots: `after-confirmation.png`, `after-local-error.png`,
`approvals-confirmation.png`, `retry-indonesian.png`, and the before capture.

## Targeted validation

- `project-pic-revision-contract.test.ts`: PASS; actual detail/list mapper,
  default/reduced detail, zero/bigint precision, absent revision and denied actor.
- `project-detail-activity.test.ts`: PASS; access and activity projection remain
  intact after the shared mapper change.
- `pic-assignment-request.test.tsx`: PASS; local missing-data/UUID errors, input,
  confirmation/cancel, CAS, retry identity, conflict reload and invalidation.
- `i18n.test.ts` and `phase-review.test.ts`: PASS.
- Backend and frontend `tsc --noEmit`: PASS.
- Strict UTF-8 on 27 changed/new text files, harness syntax and `git diff --check`: PASS.

The initial harness selectors were adjusted to actual button labels and the
existing dialog DOM. The new backend query mock also needed its `.in()` method
to cover list reads. No application expectations or permission assertions were
weakened to accommodate those setup issues.

## Rerun and isolation

With the existing local frontend development server available:

```powershell
Set-Location -LiteralPath 'D:\Workflow Repository System'
node frontend/tests/browser/plan-pic-browser.cjs
```

Uses existing Chrome/CDP tooling and dependencies. The actual app route,
AuthProvider, hooks, API client and dialogs run in Chrome. Every API request is
fulfilled by the synthetic fixture; unknown routes fail explicitly and external
requests are blocked. The mapper's database access is mocked and its network is
disabled. Only the harness-owned Chrome/profile is closed and removed.

The before capture is preserved historical evidence from the original mapper
and dialog. The final harness runs the fixed behavior and only writes after
results, so rerunning it does not overwrite the original evidence. Do not
restore application files to rerun the pre-fix capture.

No live mutation, account, GoTrue, PostgreSQL RPC or Storage access is tested.
This proves the frontend/DTO regression and its fix, not live approval UAT.
Existing PostgreSQL/RPC tests were not repeated; no migration is needed.
