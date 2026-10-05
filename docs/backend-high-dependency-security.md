# Backend high dependency remediation

Checked 2026-10-05 on `main / 37ba74c`; initial worktree and index were clean.
Runtime used for validation: Node 22.21.0, npm 10.9.4. No application database,
Storage, SMTP provider, workflow, API, authorization or frontend was changed.

## Audit counts

| Audit | Before: high / moderate package entries | After: high / moderate package entries | Unique advisory sources before / after |
| --- | --- | --- | --- |
| `npm audit --json` | 5 / 4 | 0 / 4 | 15 / 4 |
| `npm audit --omit=dev --json` | 1 / 4 | 0 / 4 | 11 / 4 |

Before remediation there were five distinct high advisories overall, two in
runtime dependencies. Package counts include inherited findings: `chokidar`
and `ts-node-dev` are not two additional independent vulnerabilities. Both final
audit commands still exit 1 because moderate findings remain.

## High findings and remediation

| Package / official advisory | Scope and dependency chain | Installed before | Affected / first fixed version in installed branch | Action / result |
| --- | --- | --- | --- | --- |
| Nodemailer [GHSA-2x7j-588g-ccc2](https://github.com/nodemailer/nodemailer/security/advisories/GHSA-2x7j-588g-ccc2) | Direct runtime `nodemailer` | 9.0.5 | `<9.1.0` / 9.1.0 | Pin 10.0.14; absent from final audit |
| Nodemailer [GHSA-v53p-9fqp-m79j](https://github.com/nodemailer/nodemailer/security/advisories/GHSA-v53p-9fqp-m79j) | Direct runtime `nodemailer` | 9.0.5 | `<=10.0.5` / 10.0.6 | Same update; absent from final audit |
| brace-expansion [GHSA-6j4f-fj2g-mc7p](https://github.com/juliangruber/brace-expansion/security/advisories/GHSA-6j4f-fj2g-mc7p) | Dev: `ts-node-dev@2.0.0 -> rimraf@2.7.1 -> glob@7.2.3 -> minimatch@3.1.5 -> brace-expansion` | 1.1.18 | `<1.1.19` / 1.1.19 | Remove obsolete watcher chain; package absent |
| brace-expansion [GHSA-qhr7-859c-m2p7](https://github.com/juliangruber/brace-expansion/security/advisories/GHSA-qhr7-859c-m2p7) | Same dev chain | 1.1.18 | `<1.1.20` / 1.1.20 | Same removal; package absent |
| braces [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), [upstream issue](https://github.com/micromatch/braces/issues/70) | Dev: `ts-node-dev@2.0.0 -> chokidar@3.6.0 -> braces` | 3.0.3 | `<=3.0.3` / no published patched release found | Remove obsolete watcher chain; package absent |

`EmailService` uses Nodemailer to compose/send initial-password and reset emails.
Sender configuration is server-owned, recipient emails come from the account
flows, and display names are escaped by the existing builders. It does not
directly call addressparser or parse incoming arbitrary email. This limits the
observed usage but is not a claim that the advisories were harmless.

Nodemailer 10 requires Node >=20; the tested Node 22 runtime is compatible.
10.0.14 is the current stable release, includes later composition/transport
corrections beyond 10.0.6, and its existing service APIs passed targeted tests.
See the [upstream changelog](https://github.com/nodemailer/nodemailer/blob/master/CHANGELOG.md).
No production TypeScript changes or unrelated dependency upgrades were needed.

The dev-only chains still affect developer processes; their classification does
not establish safety. Registry/upstream checks found `ts-node-dev` latest still
2.0.0 with the vulnerable watcher chain, so updating that parent could not close
the unpatched `braces` advisory. No override is used. The dev command now uses
`node --watch -r ts-node/register/transpile-only src/server.ts`; existing
`ts-node@10.9.2` became a direct, exact dev dependency. Node watch is stable in
Node 22 and watches required/imported modules ([Node documentation](https://nodejs.org/download/release/v22.21.0/docs/api/cli.html#--watch)).
Its startup and imported-file restart were tested with an isolated TypeScript
HTTP fixture, without starting application workers. Reload behavior for other
file kinds or different runtime versions was not tested.

The lockfile was regenerated through npm. Only Nodemailer's existing package
version changed; 44 obsolete lockfile entries were removed with the watcher
chain. Multer remains 2.4.0; `@types/nodemailer` remains 8.0.1 and backend type
checking passes the service APIs actually used.

## Remaining moderate findings

Four package entries correspond to four advisory sources, all present in the
runtime audit:

- `express@4.22.2 -> qs@6.15.3` and
  `express -> body-parser@1.20.6 -> qs`: [GHSA-x5fp-wj9c-mxmx](https://github.com/advisories/GHSA-x5fp-wj9c-mxmx)
  and [GHSA-4mjr-xmp4-gh2g](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g).
- `express-rate-limit@8.7.0 -> ip-address@10.7.0`:
  [GHSA-j6r3-76f7-8jcv](https://github.com/advisories/GHSA-j6r3-76f7-8jcv) and
  [GHSA-h3mg-xc3c-68pw](https://github.com/advisories/GHSA-h3mg-xc3c-68pw).

These are outside this high-only remediation. npm reports fixes available; a
separate smallest-parent-update assessment should verify Express parsing/query
behavior and auth rate-limit/IP behavior before changing those dependencies.
They are not classified as unreachable or safe here.

## Completed validation

- Normal `npm ci --no-audit --no-fund` passed (125 installed packages); an earlier
  `npm ci --ignore-scripts` also passed.
- `npm ls` confirms Nodemailer 10.0.14, ts-node 10.9.2 and Multer 2.4.0, and no
  ts-node-dev/chokidar/braces/brace-expansion.
- Backend `tsc --noEmit` passed after the test additions.
- Six targeted test files passed: `email-transport`, `development-watch`,
  `auth-registration`, `auth-forgot-reset`, `user.service`, `multipart-upload`.
  The new tests are discovered by the existing recursive npm test runner.
- Email tests use the actual Nodemailer stream transport for EN/ID MIME,
  envelope, escaping and transport reuse; no SMTP provider was contacted.
- Watch and multipart tests use HTTP on localhost; application services use
  mocks rather than live database/Storage. Multipart regressions cover normal
  uploads and rejected/broken/aborted uploads under existing access guards.
- Final full and runtime audits completed with zero high findings.
- `git diff --check` passed. No full build or full suite was run.

Files changed: backend manifest/lockfile, two new targeted test files, and this
report. No staging, commit, push, SQL or Storage cleanup was performed. Audit
results describe the registry's known findings at this time, not comprehensive
application security. Live SMTP/TLS/provider delivery and production deployment
were not verified; deploy on a runtime compatible with Nodemailer 10.
