# Workflow Repository Management System

## Overview

Workflow Repository Management System is an internal project and workflow repository for `SUPER_ADMIN`, `SALES`, `HEAD_SA`, and `SA` users. It manages the project lifecycle, workflow stages and milestones, Project Plan approval, PIC assignment, deadline management and approvals, postpone/resume actions, a document repository, dashboard reporting, in-app notifications, Telegram notifications, and user/authentication administration.

## Architecture

| Layer | Current runtime |
| --- | --- |
| Frontend | Next.js 15, TypeScript, Tailwind CSS, TanStack Query, React Hook Form, Zod |
| Backend | Node.js, Express, TypeScript, Zod |
| Database | Supabase PostgreSQL |
| Authentication | Supabase Auth |
| File storage | Private Supabase Storage |
| Email | Nodemailer over SMTP |
| Telegram | Telegram Bot API |

The frontend uses the authenticated backend API. Privileged Supabase access, including `SUPABASE_SERVICE_ROLE_KEY`, remains backend-only and must never be exposed through `NEXT_PUBLIC_*` variables or browser code.

## Roles

- `SUPER_ADMIN`: manages users and system settings, including Telegram delivery-health monitoring.
- `SALES`: creates and owns projects, drafts the initial timeline, submits Project Plans, completes Sales-owned stages, requests applicable deadline changes, and postpones/resumes permitted projects.
- `HEAD_SA`: reviews Project Plans, assigns or reassigns SA PICs, reviews SA milestone submissions, and performs HEAD_SA workflow stages.
- `SA`: works only on assigned stages and projects, submits work for review, and revises rejected work.

Server-side authorization is the source of truth for these permissions.

## Project Workflow

The simplified project lifecycle is:

```text
DRAFT
-> initial timeline
-> Project Plan submission
-> HEAD_SA approval
-> ACTIVE
-> ordered stage/milestone progression
-> COMPLETED
```

- A rejected Project Plan remains available for correction and resubmission according to the current approval flow.
- SA-owned stages require PIC assignment before SA work can proceed.
- An SA submits completed work for HEAD_SA review. HEAD_SA approval completes that milestone; rejection returns it to the SA revision flow.
- SALES and HEAD_SA stages progress under the responsible-role rules in the current workflow engine.
- Completion of the final stage completes the project.
- Where the current workflow code reads historical status, `APPROVED` is treated as completed-equivalent alongside `COMPLETED`.
- Retired initiation/trigger endpoints return HTTP `410`; the former initiation workflow is not part of the active lifecycle.

## Authentication & User Management

### Registration and first login

Public/internal registration validates the configured internal company email domain. The backend generates a secure initial password, emails it directly to the user, and sets `must_change_password` so the user must choose a new password on first login.

SUPER_ADMIN user creation follows the same security model:

- The administrator supplies full name, email, role, and active status.
- The administrator neither chooses nor receives the initial password.
- The backend generates the password and emails it directly to the new user.
- The user must change it on first login.

Passwords must be at least 12 characters and include uppercase, lowercase, numeric, and special characters. New passwords cannot contain leading or trailing whitespace.

Forgot-password responses are intentionally enumeration-safe: they do not reveal whether an account exists. Users are deactivated or reactivated through status management rather than relying on legacy deletion UI paths.

## Documents

The document repository supports authenticated upload, project and optional milestone association, version history, comments, and HEAD_SA/SUPER_ADMIN review of submitted document versions. Metadata is stored in Supabase tables, while uploaded bytes are stored in the private `workflow-documents` bucket by default.

The backend checks document and project access before issuing a short-lived signed download URL. Documents are not public.

Document repository schema and bucket setup are provided by:

```text
backend/supabase/phase10a5-documents.sql
```

## Notifications

In-app notifications are persisted per user and displayed through the authenticated notification bell. The system creates workflow-related notifications, supports marking individual or all notifications as read, and provides personal notification preferences.

## Telegram Integration

Telegram notifications extend the in-app notification system with per-user opt-in delivery.

- Users link an account through a secure, one-time Telegram link token. Only its hash is stored.
- Link tokens have a short lifetime and are replay-safe.
- A Telegram account cannot be silently reassigned from one application user to another.
- Users can enable or disable Telegram delivery in their personal notification settings.
- Workflow notifications can be delivered through the Telegram Bot API, with delivery status tracked in the database.
- Delivery failures are classified as `RETRYABLE`, `AMBIGUOUS`, or `TERMINAL`.
- The retry worker performs bounded retries for safe retryable failures. Ambiguous outcomes are not automatically retried.
- `SUPER_ADMIN` users can view Telegram delivery health. The UI has no manual retry control.

The Telegram bot token and webhook secret are backend-only configuration. Do not expose them in frontend code, logs, documentation, or client responses.

## Database Migrations

SQL files under `backend/supabase/` are incremental migration and schema-history files. They are not applied automatically when the application starts.

Do not sort these filenames lexicographically and execute them blindly: names such as `phase10...` sort before `phase2...`. Apply migrations according to the relevant project phase and dependency order. Fresh-database ordering should be verified before production initialization.

Recent relevant files include:

| Capability | Migration file |
| --- | --- |
| Project Plan approvals | `backend/supabase/phase10a-project-plan-approvals.sql` |
| Document repository and private bucket | `backend/supabase/phase10a5-documents.sql` |
| In-app notifications | `backend/supabase/phase10c1-notifications.sql` |
| Telegram link tokens | `backend/supabase/phase10c4a-telegram-link-tokens.sql` |
| Telegram delivery records | `backend/supabase/phase10c5-telegram-delivery.sql` |
| Telegram identity uniqueness | `backend/supabase/phase10c6a-telegram-identity-uniqueness.sql` |
| Telegram delivery reliability metadata | `backend/supabase/phase10c7a-telegram-delivery-reliability.sql` |
| Telegram retry claim function | `backend/supabase/phase10c7b-telegram-retry-claim.sql` |
| Phase 11A user security reconciliation | `backend/supabase/phase11a-auth-user-hardening.sql` |

The Phase 11A migration reconciles the `public.users` fields `must_change_password` and `initial_password_sent_at` used by the current authentication and user-management flows.

## Environment Configuration

Copy the templates and use placeholders appropriate to your environment. Do not commit `.env` files.

### Backend

```powershell
Copy-Item backend/.env.example backend/.env
```

Current local development uses port `5000`:

```env
PORT=5000
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
SUPABASE_DOCUMENT_BUCKET=workflow-documents

APP_BASE_URL=http://localhost:3000
PASSWORD_RESET_URL=http://localhost:3000/reset-password
INTERNAL_EMAIL_DOMAIN=example.co.id
DEFAULT_REGISTER_ROLE=SA

SMTP_HOST=smtp.example.internal
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
SMTP_FROM="Workflow Repository <no-reply@example.com>"

TELEGRAM_BOT_USERNAME=your_bot_username
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
TELEGRAM_WEBHOOK_SECRET=your-telegram-webhook-secret
```

`SUPABASE_SERVICE_ROLE_KEY`, SMTP credentials, `TELEGRAM_BOT_TOKEN`, and `TELEGRAM_WEBHOOK_SECRET` are backend-only secrets.

### Frontend

```powershell
Copy-Item frontend/.env.example frontend/.env
```

```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

Never add a Supabase service-role key, SMTP secret, Telegram bot token, or webhook secret to frontend environment files.

## Local Development

Open two PowerShell terminals from the repository root.

Backend:

```powershell
cd backend
npm.cmd install
npm.cmd run dev
```

Frontend:

```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```

Default local addresses:

- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:5000/api`
- Health check: `http://localhost:5000/api/health`

## Verification

Backend type checking and service tests:

```powershell
cd backend
npx.cmd tsc --noEmit
npm.cmd test
```

Frontend type checking, focused tests, and production build:

```powershell
cd frontend
npx.cmd tsc --noEmit
npm.cmd test
npm.cmd run build
```

Repository whitespace validation:

```powershell
git diff --check
```

## Security Notes

- Never commit `.env` files, credentials, tokens, passwords, or webhook secrets.
- Keep the Supabase service-role key, SMTP secrets, Telegram bot token, and Telegram webhook secret backend-only.
- Do not log credentials, tokens, passwords, or signed document URLs.
- Supabase document storage is private; download URLs are short-lived and issued after backend authorization.
- Password reset responses avoid account enumeration.
- Server-side role checks enforce authorization; frontend `RoleGuard` is not the security boundary.
- Telegram identity linking prevents silent reassignment to another application user.
- Ambiguous Telegram outcomes are not retried automatically when retrying could create duplicate delivery.

## Production Readiness

Core application functionality is implemented. Production deployment, fresh-database bootstrap verification, final security review, and full multi-role UAT remain separate finalization work and are not represented as completed by this repository.
