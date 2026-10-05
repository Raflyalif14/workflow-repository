# Multer security update — 2026-10-05

## Baseline and dependency scope

Verified `main / a165f81`, clean worktree and empty staging before edits. Local Node is `22.21.0`, npm `10.9.4`. The backend is the active Supabase application; no database or Storage operation was used for validation.

| Package | Before (installed/locked) | After (installed/locked) |
| --- | --- | --- |
| multer | 1.4.5-lts.2; manifest `^1.4.5-lts.1` | 2.4.0, exact manifest |
| @types/multer | 1.4.13; manifest `^1.4.12` | 2.3.0, exact manifest |

The [official advisory list](https://github.com/expressjs/multer/security/advisories) and [stable 2.4.0 release](https://github.com/expressjs/multer/releases/tag/v2.4.0) were checked. [GHSA-3pph-fpjx-jg34](https://github.com/expressjs/multer/security/advisories/GHSA-3pph-fpjx-jg34), published September 14, requires 2.4.0 or higher; earlier August advisories require 2.3.0. The September issue concerns diskStorage; this application uses memoryStorage, but still needs the earlier multipart/abort fixes. The stable npm dist-tag is 2.4.0 and its Node requirement is `>=10.16.0`, compatible with the checked runtime. No prerelease was selected.

Both updates were performed by npm, including the lockfile integrity values. New type definitions are needed to configure `fieldNestingDepth` and `fieldArrayIndexLimit`. Lockfile comparison confirms only Multer and its types changed versions; removal of eleven old Multer transitive packages is expected. No unrelated direct dependency was upgraded.

## Active uploads and access order

All five use the shared memoryStorage parser and 50 MiB per-file limit. Authentication verifies the token, reads the active profile and enforces initial-password requirements before parsing.

| POST route | Multipart fields/count | Authorization order | Existing parser-error status retained |
| --- | --- | --- | --- |
| `/api/projects` | `mom` 1, `photos` 10, `documents` 10 | SALES before parsing; creation validation afterward | 400 |
| `/api/projects/:projectId/output-documents/:key/upload` | `file` 1 | SA/HEAD_SA before parsing; project/PIC/milestone/scope/CAS checks afterward | 500 |
| `/api/documents/:id/versions` | `file` 1 | Authentication before parsing; official-document actor/origin/project access checks afterward | 500 |
| `/api/milestones/:milestoneId/documents` | `files` 10 | SALES/SUPER_ADMIN route guard before parsing; owning Sales/stage/state policy afterward | 400 |
| `/api/milestones/:milestoneId/contributions` | `files` 10 | SALES before parsing; contribution schema and owner/milestone policy afterward | 400 |

Retired document creation and milestone submission endpoints do not use an upload parser. Authorization ordering was preserved, including the official-version path whose object policy runs after parsing. This patch does not claim to move object authorization ahead of buffering.

## Handling and unchanged output contract

`handleMultipartUpload` wraps every active parser. Synchronous parser exceptions, Multer limit errors, filter rejection and broken multipart terminate with the route's safe message and existing JSON error envelope, without raw field/file names, parser details or a development stack. A disconnected request never continues to a controller or writes a response to a dead socket. Multer owns memory-buffer cleanup; application Storage is never called on parsing rejection. The general error handler's unrelated behavior remains unchanged.

Active forms send flat scalar fields or JSON strings. Shared parsing bounds bracket nesting to 8 and numeric array indexes to 100 before append-field builds objects/arrays. These bounds reject hostile multipart field structures while retaining the actual form contracts. Existing accepted file extensions and per-route file counts are unchanged.

Output uploads still send one `file` per endpoint request with the existing revision, request ID and optional replacement target. Multiple files belong to one output's draft. Existing 10-file/200-MiB aggregate guards, immutable submit snapshots, whole-output review, receipt/fingerprint/CAS replay, Phase 23 uncertain-outcome tracking, history and downloads were not modified. Phase 22/23 SQL was not changed or executed.

## Validation

- `npm ci --ignore-scripts --no-audit --no-fund` succeeded. No dependency install script relevant to Windows was required (the only lockfile install script is optional macOS fsevents).
- `npm ls multer @types/multer`: exactly Multer 2.4.0 and types 2.3.0.
- New `multipart-upload.test.ts` passed with a localhost HTTP server, actual routers, actual Multer, actual auth/role middleware and mocked auth profile/Storage/database. It covers all five valid field configurations, payload preservation, wrong fields, excessive file count, unsupported extension, malformed/truncated multipart, missing boundary, oversized array index, deep field names, missing/inactive authentication and role rejection before parsing. It also tests 50 MiB + 1 rejection, exact 50 MiB acceptance, upload cancellation after the parser starts, synchronous parser error, no downstream persistence on rejection, safe development responses and a successful next request after each failure. No uncaught exception or unhandled rejection was observed.
- Existing draft upload/receipt/CAS, milestone contribution, document Supabase helpers, document lifecycle and general error-handler test files passed.
- Backend `tsc --noEmit` and `git diff --check` passed.

Two existing service test files are not green and were left unchanged:

1. `project-creation-documents.test.ts`: its mock returns no output milestone stage rows. The existing output initializer rejects `Missing SA milestone for proposal_deck_solusi`, wrapped by project creation as HTTP 500. This occurs before any Storage upload, without invoking multipart parsing.
2. `sales-milestone-document.service.test.ts`: its first eleven upload/policy cases pass; the repository-list case fails because QueryMock lacks `.range()`, already called by the existing document list service.

Both failures were reproduced using HEAD versions of the relevant service/test/storage sources loaded in memory, without checkout, reset, restore or file edits. That reproduction uses the newly installed runtime dependencies; neither failure calls Multer parsing, and the failing mock/service interfaces already exist in HEAD. This is evidence of stale baseline mocks, not a claim that the entire baseline dependency tree was reinstalled or that every existing test passes.

## Remaining npm audit findings

`npm audit` completed with exit 1: **9 affected package entries, 5 high / 4 moderate**, with no Multer finding. These counts include propagated dependency entries, not nine distinct vulnerabilities.

| Scope | Remaining entries |
| --- | --- |
| Production | nodemailer 9.0.5 (high); qs 6.15.3, body-parser 1.20.6 and express 4.22.2 (moderate, shared qs dependency); ip-address 10.7.0 (moderate, through express-rate-limit) |
| Development | brace-expansion 1.1.18, braces 3.0.3, chokidar 3.6.0 and ts-node-dev 2.0.0 (high, development tooling/dependency propagation) |

No `npm audit fix` was run. These findings need separate scoped work; no exploitability analysis of those unrelated packages was performed. Frontend dependencies were not audited or modified. Tests do not replace production-proxy/concurrent-load checks; no live database/Storage or deployed upload test was performed.
