<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Agent guide — Rep Ledger

Start here, then read `CLAUDE.md` (rules), `ARCHITECTURE.md` (how it fits together),
`PROJECT_STATUS.md` (what's done / pending) and `UI_GUIDELINES.md` (how it should look).

## Stack
Next.js 16.4 (App Router, Turbopack, `src/proxy.ts`), React 19, TypeScript, Tailwind CSS 4,
TanStack Query 5, Recharts 3, Zod 4, Supabase (`@supabase/ssr` 0.12, `supabase-js` 2), Vitest 5.

## Before you change anything
- Business rules for PT sessions and money are enforced in SQL. If a change affects them, edit SQL
  via a **new** migration and extend `supabase/tests/integration.sql` — not just the UI.
- Pure logic belongs in `src/lib/domain` with unit tests.
- Never create, sign into, or seed accounts on production; test locally with throwaway accounts
  and delete them afterwards (see `PROJECT_STATUS.md` → "Data currently in the database").

## Definition of done for a change
1. `npm run check` passes (typecheck, lint, 36+ unit tests, build).
2. SQL changes: database suite prints `ALL INTEGRATION TESTS PASSED`.
3. UI changes: verified in a browser at desktop width and 375px, light and dark.
4. `CHANGELOG.md` updated; docs updated if behaviour changed.

## Task map
| Want to… | Look at |
|---|---|
| Change attendance states or how a day consumes a session | `supabase/migrations/*ledger_logic.sql`, `src/lib/domain/attendance.ts`, `day-editor.tsx`, `quick-log.tsx` |
| Change financial metrics | `src/lib/domain/finance.ts`, `package_summary` view, `finance/page.tsx` |
| Change forecasting | `src/lib/domain/forecast.ts`, `derived.ts` |
| Add an exercise alias / parser rule | `src/lib/domain/parser.ts` + `tests/unit/parser.test.ts` |
| Add a table | new migration with RLS + ownership FK; add to `ARCHIVE_TABLES` and `restore_archive` |
| Add a page | `src/app/(app)/<route>/page.tsx` (`"use client"`), nav in `shell.tsx` |
| Deploy | `SETUP.md` §5 |
