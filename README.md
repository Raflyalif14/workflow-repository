# 🚀 Workflow Repository Management System

An Enterprise-Grade Workflow & Pipeline Repository Management Platform built with **Next.js 15 (App Router)**, **Express.js + TypeScript**, **Prisma ORM**, and **PostgreSQL**.

---

## 🛠️ Tech Stack Overview

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | Next.js 15 (App Router), TypeScript, Tailwind CSS, shadcn/ui, Lucide Icons, TanStack Query, React Hook Form, Zod |
| **Backend** | Node.js, Express, TypeScript, Prisma ORM, JWT (jsonwebtoken), bcryptjs, Zod validation |
| **Database** | PostgreSQL 16 |
| **DevOps & Container** | Docker, Docker Compose, Multi-stage builds |

---

## 📁 Project Structure

```text
├── docker-compose.yml          # Multi-container orchestration (Postgres, Backend, Frontend)
├── .env.example                # Root environment variables template
├── .gitignore                  # Git ignore rules
├── package.json                # Monorepo management scripts
│
├── backend/                    # Express + TypeScript + Prisma Backend
│   ├── Dockerfile              # Multi-stage production container
│   ├── tsconfig.json           # TypeScript configuration
│   ├── package.json            # Backend dependencies
│   ├── .env.example            # Backend env template
│   ├── prisma/
│   │   └── schema.prisma       # Database schema (User, Repo, Workflow, Steps, Logs)
│   └── src/
│       ├── config/             # DB & Env configs (prisma.ts, env.ts)
│       ├── controllers/        # Request handlers (auth, workflow)
│       ├── middlewares/        # Auth (JWT), Validation (Zod), Error Handlers
│       ├── routes/             # API routing
│       ├── services/           # Business logic layer
│       ├── utils/              # Token, hashing & response helpers
│       ├── validators/         # Zod schemas for input validation
│       ├── app.ts              # Express application setup
│       └── server.ts           # Server bootstrap
│
└── frontend/                   # Next.js 15 (App Router) Frontend
    ├── Dockerfile              # Next.js standalone container
    ├── tsconfig.json           # TypeScript configuration
    ├── next.config.ts          # Next.js configuration
    ├── tailwind.config.ts      # Tailwind CSS configuration with shadcn tokens
    ├── components.json         # shadcn/ui configuration
    ├── package.json            # Frontend dependencies
    ├── .env.example            # Frontend env template
    └── src/
        ├── app/                # App router (layout, page, globals.css, providers)
        ├── components/         # UI components & Layouts (shadcn primitives)
        ├── hooks/              # TanStack Query custom hooks
        ├── lib/                # API Client and utilities
        ├── schemas/            # Zod form validation schemas
        └── types/              # Domain interfaces & TypeScript types
```

---

## ⚙️ Environment Variables

### 1. Root / Backend (`backend/.env`)
Salin file template `.env.example`:
```bash
cp backend/.env.example backend/.env
```
Isi konfigurasi:
```env
PORT=5000
NODE_ENV=development
DATABASE_URL="postgresql://postgres:postgrespassword@localhost:5432/workflow_repo_db?schema=public"
JWT_SECRET="super-secret-jwt-key-change-this-in-production-min-32-chars"
JWT_EXPIRES_IN="7d"
CORS_ORIGIN="http://localhost:3000"
```

### 2. Frontend (`frontend/.env.local`)
```bash
cp frontend/.env.example frontend/.env.local
```
Isi konfigurasi:
```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
NODE_ENV=development
```

---

## 🚀 Quick Start Guide

### Option 1: Menggunakan Docker Compose (Direkomendasikan)

Pastikan Docker & Docker Compose sudah terpasang di komputer Anda.

1. **Jalankan seluruh service:**
   ```bash
   docker compose up -d --build
   ```
2. **Cek status container:**
   ```bash
   docker compose ps
   ```
3. **Akses aplikasi:**
   - Frontend: [http://localhost:3000](http://localhost:3000)
   - Backend API: [http://localhost:5000/api](http://localhost:5000/api)
   - Healthcheck: [http://localhost:5000/api/health](http://localhost:5000/api/health)

---

### Option 2: Menjalankan Secara Lokal (Node.js & Local PostgreSQL)

#### 1. Setup Database & Backend
```bash
cd backend
npm install

# Generate Prisma Client & Migrate Schema
npx prisma generate
npx prisma migrate dev --name init

# Jalankan Backend Dev Server
npm run dev
```

#### 2. Setup Frontend
Buka terminal baru:
```bash
cd frontend
npm install

# Jalankan Frontend Dev Server
npm run dev
```

Buka browser di [http://localhost:3000](http://localhost:3000).

---

## 🗄️ Database Management dengan Prisma

- **Prisma Studio (GUI Database Viewer):**
  ```bash
  cd backend
  npx prisma studio
  ```
  Akses di [http://localhost:5555](http://localhost:5555)

- **Push perubahan skema:**
  ```bash
  npx prisma migrate dev --name <nama_migrasi>
  ```

---

## 🛡️ Best Practices yang Diimplementasikan

1. **Modular Layered Architecture**: Controller $\rightarrow$ Service $\rightarrow$ Prisma ORM.
2. **Type Safety End-to-End**: Validasi Zod pada Backend dan Frontend yang sinkron dengan TypeScript interfaces.
3. **Centralized Error & Response Handling**: Middleware error global dengan format response seragam.
4. **State Management Optimal**: TanStack Query dengan caching, revalidation, dan optimistic mutation.
5. **Modern Containerization**: Multi-stage build pada Dockerfile untuk meminimalkan image size dan mengoptimalkan runtime Next.js standalone.
