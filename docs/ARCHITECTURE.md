# RUSH! — Application Architecture

## Overview

```
Browser (React + Vite)  ──REST /api/*──►  Express (Node.js, TypeScript)  ──mysql2/Kysely──►  MySQL 8 (database/rush_schema.sql)
        │                                     │
        └──Socket.IO (same origin, cookie)──► SessionEngine (authoritative game state, timers, scoring)
                                              │
                                              ├─► Google Cloud Translation v2 (word translation)
                                              ├─► OpenAI Chat Completions (contextual explanation)
                                              ├─► SMTP via Nodemailer (email notifications; console fallback)
                                              └─► Object storage: S3-compatible or local dev folder (media URLs only in MySQL)
```

npm workspaces:

| Workspace | Purpose |
|---|---|
| `shared/` | Zod validation schemas, limits and types shared by frontend and backend (question rules, limits). |
| `backend/` | Express REST API, Socket.IO server, business services, DB access. |
| `frontend/` | React SPA (React Router, TanStack Query, Tailwind CSS). |

## Technology choices (and why)

* **Kysely + mysql2 instead of Prisma.** The schema relies on STORED generated columns
  (`owner_flag`, `correct_flag`, `active_flag`), CHECK constraints and `SELECT … FOR UPDATE`
  locking. Prisma does not model generated columns and wants to own migrations. Kysely is a
  type-safe SQL query builder: the TypeScript table types in `backend/src/db/types.ts` mirror
  `rush_schema.sql` exactly, the schema file stays the single source of truth, and every query
  is parameterised (SQL-injection safe).
* **express-session (server-side sessions)** with an HttpOnly, SameSite=Lax cookie. The session
  store is in-process (`memorystore`) because the schema has no session table and the schema must
  not be changed silently (see `OPEN_QUESTIONS.md`, A-17). The same session middleware
  authenticates Socket.IO connections.
* **Socket.IO** for real-time sessions; the server is authoritative for state, timing and scoring.
* **Zod** validation shared by both sides.
* **Vitest** (unit + integration against a real MySQL test database), **Playwright** (E2E).

## Backend layout (`backend/src`)

```
config/        env parsing (zod) — fails fast on invalid configuration
db/            Kysely instance, table types, transaction helper
http/          express app, middleware (auth, csrf/origin, rate limits, errors)
routes/        thin REST controllers (auth, users, rooms, invitations, topics, quizzes,
               questions, sessions, translation, vocabulary, media, admin)
services/      business logic + permission checks (one file per area)
realtime/      Socket.IO server and SessionEngine
integrations/  google translate, openai, mailer, storage (each with a dev fallback)
scripts/       db init/reset, promote superadmin, seed demo data
```

Permission checks live in services (`services/permissions.ts`), never only in the UI.

## Frontend layout (`frontend/src`)

```
api/           fetch client + typed endpoint functions
i18n/          English interface texts and provider
components/    UI primitives (Button, Dialog, EmptyState, …) and the translation popup
features/      pages grouped by area: auth, dashboard, profile, rooms, quizzes, play, vocabulary, settings, admin
```

## Real-time session protocol

| Direction | Event | Payload |
|---|---|---|
| C→S | `session:join` | `{ sessionId }` → ack with lobby state |
| C→S | `session:start` / `session:cancel` | `{ sessionId }` (OWNER/ADMIN only) |
| C→S | `session:answer` | `{ sessionId, questionId, answer }` → ack `{ accepted }` |
| S→C | `session:lobby` | participants list |
| S→C | `session:question` | question without correct answers, `endsAt`, `serverNow` |
| S→C | `session:question-end` | the receiving player's own result + correct answer |
| S→C | `session:completed` | final standings (shown once, at the end) |
| S→C | `session:cancelled` | — |

The server never sends correct answers before a question ends and never sends one player's
answers to another player.
