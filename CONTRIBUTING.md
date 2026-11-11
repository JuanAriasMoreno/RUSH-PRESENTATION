# Contributing to RUSH!

This is a private university project. These rules keep everybody's work safe and `main` always working.
A step-by-step guide in Spanish is in [`INSTRUCCIONES_PARA_TRABAJO_COLABORATIVO.txt`](INSTRUCCIONES_PARA_TRABAJO_COLABORATIVO.txt).

## Setup

Follow the [README](README.md): `npm install`, copy `.env.example` to `.env`, start MySQL
(`npm run db:up`), create the schema (`npm run db:init`) and run `npm run dev`.
Every developer has their **own** `.env` and **own local database**. They are never shared through Git.

## Branches

* `main` is the shared, working version. **Never commit directly to `main`.**
* Before starting a task, update `main` (GitHub Desktop: *Fetch origin* → *Pull origin*).
* Create one branch per task from the latest `main`:

| Prefix | Use | Example |
|---|---|---|
| `feature/` | new functionality | `feature/new-quiz-functionality` |
| `fix/` | bug fix | `fix/results-page` |
| `docs/` | documentation only | `docs/update-readme` |

Use short lowercase names with hyphens.

## Commits

* Small commits that do one thing.
* Clear summary in the imperative, for example `Add total time hint to quiz editor` or
  `Fix winner banner on results page`.
* Never commit `.env`, passwords, API keys, `node_modules/`, build output (`dist/`), uploaded files
  (`backend/uploads/`), database dumps or test reports. `.gitignore` already excludes them; check the
  list of changed files before every commit.

## Before opening a Pull Request

Run, from the project root:

```bash
npm run typecheck
npm test
npm run build
```

If you changed screens or the live game, also run the end-to-end tests (see the README).

## Pull Requests

1. Push your branch (GitHub Desktop: *Publish branch* / *Push origin*).
2. Open a Pull Request into `main` and describe what changed and how you tested it.
3. At least one teammate reviews it. Fix the comments by pushing more commits to the same branch.
4. Merge only after approval and when the checks above pass. Delete the branch after merging.
5. If GitHub reports a conflict, update your branch from `main` (GitHub Desktop: *Branch* →
   *Update from main*), resolve it, test again and push.

## Database changes

* Schema changes affect everybody: agree on them with the team first.
* Change `database/rush_schema.sql` **and** add an additive, idempotent step in
  `backend/src/db/migrations.ts` so existing databases are upgraded without losing data
  (`npm run db:migrate`, also applied automatically when the backend starts).
* Never run `npm run db:reset` or delete data on a shared or important database without team approval.
