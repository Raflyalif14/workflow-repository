# Workflow Repository Management System

## Overview

Workflow Repository Management System adalah platform internal untuk mengelola workflow project, scenario, milestone, deadline, approval, assignment PIC, dan notification berbasis email.

Arsitektur terbaru menggunakan Supabase sebagai platform utama untuk module baru:

- Supabase PostgreSQL
- Supabase Auth
- Supabase Storage
- Supabase JS SDK

Authentication saat ini menggunakan Supabase Auth. Prisma, Docker, Docker Compose, dan PostgreSQL lokal masih ada di repository untuk legacy modules dan compatibility selama proses migration.

## Tech Stack

| Layer | Technologies |
| :--- | :--- |
| Frontend | Next.js 15 App Router, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, React Hook Form, Zod |
| Backend | Node.js, Express.js, TypeScript, Zod, Supabase JS SDK, Nodemailer |
| Primary Backend Platform | Supabase PostgreSQL, Supabase Auth, Supabase Storage |
| Email | SMTP via Nodemailer |
| Legacy / Compatibility | Prisma ORM, Docker, Docker Compose, local PostgreSQL |

## System Roles

- `SUPER_ADMIN`: manage users dan konfigurasi sistem.
- `SALES`: create project, mengatur deadline workflow, request initiation approval, dan initiate milestone.
- `HEAD_SA`: assign PIC dan melakukan approval.
- `SA`: mengerjakan milestone, submit milestone, revision, dan resubmission.

## Core Features

Fitur yang sudah tersedia saat ini:

1. Supabase authentication
2. User registration menggunakan internal email domain
3. Backend-generated secure random initial password
4. Initial password dikirim melalui SMTP
5. Forced password change pada login pertama
6. Forgot password
7. Supabase recovery token
8. Reset password melalui SMTP recovery email
9. Role-based access control
10. Scenario management
11. Workflow stages
12. Project creation
13. Automatic project milestone initialization
14. PIC assignment
15. Working-day deadline calculation
16. Holiday-aware deadline calculation
17. Deadline approval
18. Milestone submission
19. HEAD_SA milestone approval/rejection
20. SA revision and resubmission
21. Pre-initiation milestone approval
22. SALES milestone initiation
23. SMTP notification ke PIC setelah milestone di-initiate
24. Activity logs

Belum selesai: automatic next milestone dan automatic project completion.

## Workflow Lifecycle

Simplified current milestone lifecycle:

```text
CREATED
-> deadline setup / approval
-> initiation approval
-> SALES initiate
-> IN_PROGRESS
-> SA submit
-> SUBMITTED
-> HEAD_SA approve/reject
```

Jika approved:

```text
SUBMITTED -> APPROVED
```

Jika rejected:

```text
SUBMITTED
-> REJECTED
-> SA start revision
-> IN_PROGRESS
-> SUBMITTED
```

SALES melakukan initiation hanya setelah pre-initiation approval dari `HEAD_SA` sudah approved.

## Authentication Flow

### Registration

```text
Internal email
-> backend generates initial password
-> Supabase Auth user created
-> public.users created
-> SMTP sends initial password
-> must_change_password=true
```

User tidak memilih password sendiri saat register. Role register berasal dari backend env `DEFAULT_REGISTER_ROLE`.

### First Login

```text
login initial password
-> normal resources blocked
-> change initial password
-> must_change_password=false
-> login/access normal
```

Access token tetap diberikan saat login pertama agar user dapat memanggil endpoint change initial password.

### Forgot Password

```text
forgot-password
-> Supabase recovery token
-> SMTP reset link
-> reset-password
-> login using new password
```

Forgot-password memakai anti-enumeration response: email terdaftar, tidak terdaftar, non-internal, atau inactive tetap mendapat pesan bisnis generik.

## Project Structure

```text
.
├── backend/
│   ├── package.json
│   ├── .env.example
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── middlewares/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── utils/
│   │   ├── validators/
│   │   ├── app.ts
│   │   └── server.ts
│   ├── supabase/
│   │   └── phase*.sql
│   └── prisma/
│       └── legacy schema / seed
├── frontend/
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── app/
│       ├── components/
│       ├── hooks/
│       ├── lib/
│       ├── schemas/
│       └── types/
├── docker-compose.yml
├── package.json
└── .env.example
```

`backend/supabase` menyimpan SQL setup/migration scripts untuk module Supabase. `backend/prisma` masih dipertahankan untuk legacy modules.

## Environment Setup

Gunakan template env, jangan commit file `.env`.

Backend:

```bash
cp backend/.env.example backend/.env
```

Backend variables:

```env
PORT=4000
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

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

Frontend:

```bash
cp frontend/.env.example frontend/.env.local
```

Frontend variables:

```env
NEXT_PUBLIC_API_URL=http://localhost:4000/api
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

Development/testing email dapat menggunakan Mailtrap Email Sandbox. Production SMTP credentials harus selalu berasal dari environment variables.

## Running Locally

Pastikan Supabase project dan environment variables sudah dikonfigurasi terlebih dahulu.

Backend:

```bash
cd backend
npm install
npm run dev
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Default access:

- Frontend: http://localhost:3000
- Backend API: http://localhost:4000/api
- Healthcheck: http://localhost:4000/api/health

## Testing

Backend test files yang tersedia:

- `auth-registration.test.ts`
- `auth-change-initial-password.test.ts`
- `auth-forgot-reset.test.ts`
- `milestone-created-status.test.ts`
- `milestone-submission.test.ts`
- `milestone-approval.test.ts`
- `milestone-revision.test.ts`
- `milestone-initiation-approval.test.ts`
- `milestone-initiation.test.ts`
- `milestone-initiation-email.test.ts`

Command Windows:

```powershell
cd backend
npx.cmd ts-node src\services\<test-file>.ts
```

TypeScript verification:

```powershell
cd backend
npx.cmd tsc --noEmit
```

Belum ada klaim CI/CD pada README ini.

## Security Notes

- `SUPABASE_SERVICE_ROLE_KEY` hanya untuk backend.
- Jangan expose service role key ke frontend.
- `.env` tidak boleh di-commit.
- Gunakan `.env.example` sebagai template tanpa secret nyata.
- Temporary password tidak disimpan plaintext di database.
- Reset token dan reset URL ber-token tidak boleh di-log.
- SMTP credentials berasal dari environment variables.
- Role registration tidak dapat dipilih oleh client.
- User ID pada password reset berasal dari verified Supabase recovery token.
- Forgot-password response dibuat generic untuk mengurangi risiko email enumeration.

## Legacy Architecture Notice

Repository masih memiliki Prisma ORM, Docker, Docker Compose, PostgreSQL lokal, dan beberapa backend service lama yang masih memakai Prisma.

Komponen tersebut dipertahankan untuk legacy modules dan compatibility selama migration berjalan. Module baru menggunakan Supabase sebagai primary platform. Migration dari Prisma belum diklaim selesai.

Legacy / optional development setup:

```bash
cd backend
npx prisma generate
npx prisma migrate dev --name init
```

Docker Compose masih dapat digunakan untuk kebutuhan legacy/local compatibility, tetapi bukan mandatory setup untuk module Supabase terbaru.

## Development Status

Completed:

- Auth registration
- Initial password SMTP
- Forced first password change
- Forgot/reset password
- Scenario/workflow
- Project milestone initialization
- PIC assignment
- Deadline calculation/approval
- Submission/revision
- Milestone approval
- Initiation approval
- SALES initiation
- SMTP PIC notification

Still in development:

- Revised deadline-change approval behavior
- Automatic next milestone
- Automatic project completion
- Frontend alignment with latest backend flows
- Remaining legacy Prisma migration
- Final Docker/Prisma cleanup

Legacy Prisma/Docker cleanup dilakukan paling akhir setelah Supabase migration selesai.
