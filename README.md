# Workflow Repository Management System

Internal project workflow management for Sales, Head Solution Architect, and Solution Architect teams.

## Runtime Architecture

| Layer | Runtime |
| --- | --- |
| Frontend | Next.js 15, TypeScript, TanStack Query, React Hook Form, Zod |
| Backend | Node.js, Express, TypeScript, Zod |
| Data | Supabase PostgreSQL |
| Authentication | Supabase Auth |
| File repository | Private Supabase Storage |
| Email | SMTP through Nodemailer |

The backend communicates with Supabase through the Supabase JS SDK. The service-role key is backend-only and must never be included in frontend environment files.

## Roles

- `SUPER_ADMIN`: user and system administration.
- `SALES`: creates and owns projects, plans timelines, and completes Sales-owned stages.
- `HEAD_SA`: reviews plans and submissions, and assigns Solution Architect PICs.
- `SA`: works assigned stages, submits deliverables, and handles revisions.

## Workflow

The current workflow is intentionally simple:

```text
DRAFT project
-> Sales saves and submits a timeline
-> Head SA approves the plan
-> ACTIVE project
-> ordered milestone progression
-> COMPLETED project
```

Milestone stages are completed by their responsible role. SA stages are submitted for Head SA approval; rejection returns the milestone to revision. Deadline changes remain subject to their own approval flow. Project postpone/resume, PIC assignment, working-day calculation, and audit history remain available.

## Documents

The Documents screen supports upload, project/milestone association, versions, comments, review, and download. Metadata is stored in Supabase tables and uploaded bytes are stored in a private Supabase Storage bucket. The backend verifies authentication and project access before it creates a short-lived signed download URL.

Before enabling document uploads in an environment, apply:

```text
backend/supabase/phase10a5-documents.sql
```

The migration is additive. It creates the document metadata tables and the private `workflow-documents` bucket if they do not already exist. Set `SUPABASE_DOCUMENT_BUCKET` to the same bucket name when using a different name. Applying the migration and moving any pre-existing files are deliberate environment operations; this repository does not perform either automatically.

## Environment

Backend template:

```bash
cp backend/.env.example backend/.env
```

Required backend settings:

```env
PORT=4000
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
SMTP_USER=
SMTP_PASS=
SMTP_FROM="Workflow Repository <no-reply@example.com>"
```

Frontend template:

```bash
cp frontend/.env.example frontend/.env.local
```

```env
NEXT_PUBLIC_API_URL=http://localhost:4000/api
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

## Local Development

Install and run the backend:

```bash
cd backend
npm install
npm run dev
```

In another terminal, install and run the frontend:

```bash
cd frontend
npm install
npm run dev
```

Default addresses:
- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:4000/api`
- Healthcheck: `http://localhost:4000/api/health`

Application Dockerfiles remain available for containerized backend and frontend deployment. There is no repository-managed local infrastructure stack; configure the Supabase project and SMTP provider through environment variables.

## Verification

Backend static verification:

```powershell
cd backend
npx.cmd tsc --noEmit
```

The backend service tests are executable TypeScript files under `backend/src/services`. For example:

```powershell
cd backend
npx.cmd ts-node src/services/workflow-simplification.test.ts
```

Frontend static verification:

```powershell
cd frontend
npx.cmd tsc --noEmit
npm.cmd run build
```

## Security Notes

- Keep `.env` files out of version control.
- Do not expose the service-role key, SMTP credentials, passwords, recovery tokens, or signed document URLs in client code or logs.
- Supabase Storage remains private; the backend issues download URLs only after authorization.
- Production dependency remediation and deployment hardening are separate work items.
