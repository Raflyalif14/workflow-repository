# Auth / Storage integration checkpoint — 2026-10-08

Baseline verified: branch `main`, HEAD `37cdba4c2f97f07e5a0702f6ea78ffeb1e86ea0b`,
empty index and clean worktree before this task. No applicable `AGENTS.md` was
found. Application source, dependencies, migrations and existing browser /
PostgreSQL evidence are unchanged.

## Environment and isolation

Docker Desktop was available. Existing `workflow_postgres` and `workflow_minio`
containers were inventoried only and remained running; no exec, stop, restart,
schema or object operation targeted them. No existing local Supabase composition
was found. The test used its own labelled four-container stack:

| Service | Actual image |
| --- | --- |
| PostgreSQL | `postgres:16-alpine` (same major as existing PostgreSQL harness) |
| GoTrue | `supabase/gotrue:v2.196.0` |
| PostgREST | `postgrest/postgrest:v14.17` |
| Storage API | `supabase/storage-api:v1.74.0`, file backend |

Tags were checked against the [official Supabase Docker composition](https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml).
All identifiers/credentials were generated for this run; there was no production
data copy. Containers shared only their dedicated bridge with masquerading
disabled; service ports were loopback-only and PostgreSQL was not published.
This is not an OS firewall or a Docker `internal` network. Container/database
identity, mounts, network ownership and PostgreSQL major were checked before SQL.
Database and object bytes lived in tmpfs; no host bind or persistent volume.

The actual Express application ran with only local endpoint variables in an
empty temporary working directory. A fetch allowlist rejected non-owned origins;
the gateway forwarded only fixed local service ports. GoTrue admin creation used
synthetic `.invalid` addresses with explicit email confirmation; phone auth was
off and SMTP used an invalid host. Background application workers were not
started. The existing submit/review best-effort outbox RPC could execute locally,
but no Telegram delivery worker or external mail/SMS service was invoked.

## Completed checks

Final `python backend/tests/services/run.py` exited **0**. The
[machine-readable evidence](results.json) records all twelve checks as PASS.

| Check | Result | Real service / evidence |
| --- | --- | --- |
| Login and `/auth/me` | PASS | GoTrue password grant and PostgREST profile; HTTP 200 with matching server actor/role |
| Inactive account | PASS | GoTrue identity login succeeds; application login and `/me` return 401 for inactive public profile |
| Invalid session | PASS | Actual provider rejection becomes application HTTP 401 |
| Concurrent expired requests | PASS | Actual frontend API client issues profile and multipart requests; each has two attempts, sharing exactly one real refresh; refresh token rotates |
| Upload receipt retry | PASS | App Multer/controller → Storage API → real draft RPC; identical receipt on retry, exactly one registry row and one Storage object |
| Draft signed download | PASS | Assigned SA receives signed URL; actual Storage response bytes equal original synthetic PDF |
| Unauthorized / draft protection | PASS | Unassigned SA and Sales denied draft URL; unassigned request performs no signing call |
| Submit after Phase 33 / retry | PASS | Application submit route and real installed RPC succeed; two submissions with same receipt leave one snapshot |
| Approved access | PASS | Real Head SA review; Sales owner downloads matching bytes, restricted outsider denied before signing |
| ZIP | PASS | Real application ZIP; independent Python `zipfile` validates CRC/decompression and exact original bytes |
| Missing object | PASS | Only the exact owned synthetic object removed; single download and ZIP fail, no successful partial ZIP |
| Logout | PASS | Actual app logout calls GoTrue; saved refresh token subsequently rejected with application 401 |

The final aggregate counter contains **two** refresh calls: one successful
single-flight refresh for the two concurrent requests, and one intentionally
rejected refresh after logout. It does not indicate a duplicate refresh.
Expected Storage `NoSuchKey` errors belong to the missing-object test.

## Setup findings and repairs

Only test harness/bootstrap issues were corrected; no application regression was
demonstrated:

1. Docker Desktop could not reach the initially published ports on an `internal`
   test network. The dedicated bridge now disables masquerading and binds only
   loopback service ports; it is described accurately rather than as an air gap.
2. The plain PostgreSQL image lacked Supabase platform bootstrap. GoTrue first
   hit SQLSTATE `42P01` with the wrong schema search path, then `42501` because
   its migration role did not own `auth.uid()`. The harness now explicitly creates
   the auth role/search path/ownership and database CREATE privilege, following
   [GoTrue initialization](https://github.com/supabase/auth/blob/master/init_postgres.sh).
3. Storage bucket access failed `AccessDenied / permission denied` until the
   local service-role schema/table grants normally provided by
   [Supabase Storage initialization](https://github.com/supabase/postgres/blob/develop/migrations/db/init-scripts/00000000000002-storage-schema.sql)
   were added to this owned test database. Application actor checks/RLS policy
   were not relaxed.
4. Node's Windows subprocess needed its system environment keys preserved for
   CSPRNG initialization. No application `.env` is inherited.
5. The first ZIP assertion wrongly searched compressed bytes. After checking
   the existing DEFLATE implementation, the harness switched to independent
   decompression and CRC verification, retaining exact byte comparison.

Earlier setup failures were not treated as production bugs. Dependent service
checks were repeated only to resolve these blockers; the prior browser matrix
and PostgreSQL rollback/immutability/concurrency suites were not repeated.

## Validation and limits

- Backend and frontend `npx.cmd tsc --noEmit`: PASS, exit 0.
- Harness Python AST and `node --check`: PASS.
- Strict UTF-8, whitespace checks for all five new files and `git diff --check`:
  PASS at this checkpoint.
- No full build or full suite; no live SQL, migration, account or Storage action.
- All task containers/network and empty temporary working directory were removed.
  A final Docker label inventory returned no task resources. Existing user
  containers remained running; downloaded image caches remain available.

**BELUM DIVERIFIKASI:** React AuthProvider/browser lifecycle against this real
stack; hosted GoTrue configuration and external Storage/S3 infrastructure;
email/SMS delivery; live Supabase schema equivalence. The frontend replay library
ran in Node with a minimal localStorage adapter and real provider/HTTP responses,
not a browser session. Fresh short-lived access tokens exercised expiry; logout
checks refresh revocation and does not claim immediate revocation of unexpired
access JWTs.

Business migrations through Phase 33 ran only on this isolated database, using
the explicitly reconstructed historical prerequisites from the existing
PostgreSQL harness (early activity/deadline tables, revenue and status fields).
GoTrue/Storage internal schemas were created by the real services, not those
previous auth/Storage table stand-ins. This checkpoint is integration evidence
for these paths on that test schema, not complete production UAT, a repeat of
the prior concurrency matrix, or proof that every authorization path is correct.

## Files and rerun

Five new files; zero tracked files changed; staging remains empty:

- `backend/tests/services/run.py`
- `backend/tests/services/cases.cjs`
- `backend/tests/services/README.md`
- `docs/auth-storage-integration/results.json`
- `docs/auth-storage-integration/README.md`

See [harness instructions](../../backend/tests/services/README.md). Credentials,
tokens, signed URLs, object paths, browser profiles and raw service logs are not
saved in these artifacts. No stage, commit or push was performed.
