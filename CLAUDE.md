# CLAUDE.md

Guidance for Claude (and other coding agents) working in this repository. Read `AGENTS.md` too —
it holds the Next.js 16 rules that `next dev` maintains.

## Project in one paragraph
Rep Ledger is a single-owner personal tracker for a gym membership (19Fitness), prepaid personal
training packages (trainer Soham), daily attendance, workouts and the money behind them. Next.js 16
client app on Vercel; Supabase Postgres with RLS does all data protection and session accounting.
Production: https://gymrepledger.vercel.app · Supabase ref `xipmgknkvhnfbujlavbh`.
Current state and pending manual steps: `PROJECT_STATUS.md`.

## Commands
```bash
npm run dev          # localhost:3000
npm test             # Vitest unit tests (tests/unit)
npm run typecheck
npm run lint
npm run build
npm run check        # all of the above
npm run test:db      # supabase/tests/integration.sql via psql (needs SUPABASE_DB_URL)
```
Run `npm run check` before committing. If you change SQL, re-run the database suite (it rolls back).

## Non-negotiable rules
1. **PT balances come from the ledger.** `remaining = sessions_purchased + Σ non-voided pt_ledger.sessions`.
   Never add a stored counter. Read balances from the `package_summary` view.
2. **Only attendance creates `completed`/`forfeited` entries** (trigger `private.attendance_sync_ledger`).
   Clients cannot insert into `pt_ledger`; manual movements go through `record_session_adjustment`
   / `close_package`.
3. **Never deduct a PT session from a gym absence, an unconfirmed day or ambiguous text.**
   Trainer cancellations, your own cancellations (`client_cancelled`) and reschedules never consume a session.
   Unlogged Sundays display as rest days (UI default only).
4. **Corrections void, never delete** ledger entries; history must stay reconstructable.
5. **Money is integer paise.** Use `parseMoneyToPaise`, `formatMoney`, `sessionValue` (`src/lib/domain/money.ts`).
   No floats for stored amounts. Each package keeps its own rate forever.
6. **Pending payments are never "spent".** Estimated membership end ≠ confirmed end.
7. **Dates are `YYYY-MM-DD` calendar strings.** Use `src/lib/domain/dates.ts`; get today with
   `useToday()` (profile time zone). Never `new Date().toISOString().slice(0,10)` for "today".
8. **No fabricated data** in seeds, charts or insights. Empty states instead.
9. **Respect feature switches.** Hide PT UI when `profiles.pt_enabled` is false and membership UI when
   `membership_enabled` is false (`useFeatures()`, `d.ptEnabled`). Money shown on a card must use
   `<Money>`/`useMoneyFormatter` with an `EyeToggle`.
10. **Security:** RLS on every new table (`user_id = (select auth.uid())`), composite `(id, user_id)`
   foreign keys for ownership, `set search_path = ''` on functions, revoke `EXECUTE` from `anon`.
   Never use or commit the service-role key; only `NEXT_PUBLIC_SUPABASE_*` vars exist.
11. **Planner templates are shared and read-only.** Never write to `plan_exercises` or
   `plan_template_*` from the app; per-user changes go to `planner_settings.default_overrides` or a
   `workout_plans` row. Only map demo videos you have verified (title + channel via oEmbed);
   otherwise leave `video_status = 'pending'`. User-entered demos must be YouTube **Shorts** links
   (`parseShortsUrl` in `src/lib/domain/muscles.ts`). Demo players start muted.
12. **Workouts are logged on Today**, not a separate page. Plan sessions are ordinary workouts with
   `workout_type = 'plan'`; don't add a second storage path for sets.

## Where things live
- Domain logic (pure, tested): `src/lib/domain/*` — add tests in `tests/unit` for any change.
- Data access: `src/lib/data/hooks.ts` (queries/mutations), `derived.ts` (`useCore()`), `export.ts`.
- UI primitives: `src/components/ui.tsx`; follow `UI_GUIDELINES.md`.
- Pages: `src/app/(app)/*`; all pages are `"use client"` and read data through `useCore()`/hooks.
- SQL: `supabase/migrations/` (append new numbered files; never edit applied ones),
  tests in `supabase/tests/integration.sql`.

## Next.js 16 specifics learned here
- Middleware is now `src/proxy.ts` (`export function proxy`).
- `cacheComponents` is **disabled** in `next.config.ts`; with it on, client pages that read the
  current date fail prerendering.
- The app shell renders client-side only (`useSyncExternalStore` gate in `shell.tsx`) to avoid
  hydration mismatches — keep new pages inside `(app)`.
- Page files may only export Next's allowed members; put helpers in `src/lib` or `src/components`.

## Supabase specifics
- Sign-in: Google OAuth is primary (`signInWithOAuth` in `src/app/login/login-form.tsx`, code exchange in
  `src/app/auth/callback/route.ts`); email + password is the fallback. The Google client secret is
  configured only in the Supabase dashboard.
- Apply migrations with the Supabase MCP `apply_migration` or the CLI; keep the file in
  `supabase/migrations` byte-for-byte equivalent.
- `private.app_config.owner_email` decides who gets the personal seed. Don't commit personal emails.
- The security advisor's 5 "security definer executable" warnings are expected.

## Conventions
- TypeScript strict, functional React components, Tailwind classes from design tokens.
- User-facing copy: short, plain, second person; errors through `friendlyError`.
- Commits end with the co-author line requested by the environment.
- Update `CHANGELOG.md` and, when behaviour changes, `README.md`/`ARCHITECTURE.md`.
