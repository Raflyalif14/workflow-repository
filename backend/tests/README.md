# Backend tests

From the repository root on Windows:

```powershell
npm.cmd run typecheck --prefix backend
npm.cmd run build --prefix backend
npm.cmd run test:ci --prefix backend
```

GitHub runs the same scripts with `npm` on Node 22 / Ubuntu, after `npm ci --prefix backend`. No GitHub application secrets or live services are required. See `.github/workflows/backend-checks.yml`.

## CI test boundary

`test:ci` discovers every `src/**/*.test.ts` and `tests/**/*.test.cjs`. Each selected file runs in a fresh process, with a 60-second limit. A nonzero exit, signal, timeout or missing test selection fails the command. Adding a new test includes it automatically.

The runner passes a small environment allowlist and synthetic Supabase configuration. Its preload disables `dotenv.config`, blocks external fetch/TCP connections, and redirects repository `.private` file access used by the face fixtures to a temporary directory per test. The parent also cleans that directory if the child times out. Existing HTTP tests may start loopback servers; providers, mail and Telegram are mocked by the tests. These hooks prevent accidental live access in this suite; they are not an OS sandbox for untrusted code.

The CI harness has its own regression test for environment isolation, dotenv, connection restrictions, private-store redirection and failed test exits. Type checking runs separately, so the per-file runner transpiles TypeScript without checking the same types repeatedly.

List the selected and excluded files, or run one group:

```powershell
npm.cmd run test:ci --prefix backend -- --list
npm.cmd run test:ci --prefix backend -- deadline
```

## Separate environment tests

Eight exact file paths and reasons live in `ci-exclusions.cjs`. Exclusions print as `EXCLUDED` and are never counted as passing:

- Eight Python/model integration files require local downloaded weights and pinned Python runtimes. Some fixtures use Windows-specific runtime paths.

The Node development watcher test uses a generated local HTTP server and remains in the CI selection.

The existing `npm test --prefix backend` command remains available for the full local suite, including those environment-dependent tests. It uses the previous runner; it does not provide the isolation described above. Run it only with the required local fixtures configured. Do not treat CI as proof that Python models, a live database/Storage stack, or deployment have been verified.

The PostgreSQL and auth/Storage harnesses under `postgres/` and `services/` also require their own environments and are outside this CI job.
