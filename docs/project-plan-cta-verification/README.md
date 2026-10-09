# Project Detail plan submission CTA

Baseline: `main / 1e6f7727b3c20519ff32056e4c9eec7dae35a4b8`, clean worktree and empty staging before this task.

The primary next-action button now sits below its explanation, aligned left on desktop and full width on mobile. The existing EN/ID submit label explicitly describes review. Timeline readiness in the draft tracker now uses the same saved-milestone completeness check as next-action guidance, rather than waiting for a plan approval record to exist. Submission still opens the existing confirmation and uses the existing mutation, authorization and backend rules.

## Completed validation

- Workflow UX helper tests: PASS, including complete/incomplete/empty schedules, operational and legacy models, pending/approved/rejected plans, EN/ID and unchanged submit eligibility.
- i18n dictionary tests: PASS.
- Frontend `tsc --noEmit`: PASS.
- Strict UTF-8 for changed text files and `git diff --check`: PASS.
- Real local Chrome with the existing API fixture harness: SALES, EN/ID, 360/390/1440px. CTA below and aligned with its description, correct saved timeline progress, unchanged date input values across locale changes, no horizontal page overflow. Keyboard Enter opens the existing confirmation; Cancel closes it without a business mutation. No unhandled fixture endpoints or browser runtime errors.
- Screenshots inspected: English desktop and Indonesian mobile; four EN/ID desktop/mobile screenshots retained. The 390px check is recorded in `results.json`.

Run from the repository root with the local Next frontend already running:

```powershell
node frontend/tests/browser/project-plan-browser.cjs
```

The harness intercepts API requests with synthetic data, blocks external requests and removes its own isolated Chrome profile/process. No live project, authentication provider, Storage or backend authorization was tested or mutated. No backend/schema/workflow change, staging, commit or push.
