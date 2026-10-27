# Architecture

## Overview

```
┌────────────────────────── Browser ──────────────────────────┐
│ Next.js 16 client components (React 19)                     │
│   React Query cache ── src/lib/data/hooks.ts                │
│   Derived state    ── src/lib/data/derived.ts (useCore)     │
│   Pure domain logic ─ src/lib/domain/* (unit-tested)        │
└───────────────┬─────────────────────────────────────────────┘
                │ supabase-js, publishable key + user JWT
┌───────────────▼────────────── Supabase ─────────────────────┐
│ Auth (email + password)                                     │
│ PostgREST → Postgres 17                                     │
│   RLS on every user table (user_id = auth.uid())            │
│   Triggers: attendance → pt_ledger, package guards, audit   │
│   RPCs: create_package, close_package,                      │
│         record_session_adjustment, void_session_adjustment, │
│         save_workout, initialize_account, restore_archive   │
│   View: package_summary (security_invoker)                  │
│   Schema `private`: app_config + internal functions         │
│ Storage: private bucket `progress-photos/<user_id>/…`       │
└─────────────────────────────────────────────────────────────┘
Vercel (bom1): serves the app; src/proxy.ts refreshes the session cookie and redirects
signed-out requests to /login. Route handlers: /auth/callback, /auth/signout.
```

## Key decisions

| Decision | Why |
|---|---|
| **Integrity enforced in Postgres** (constraints, triggers, `SECURITY DEFINER` RPCs) | A UI bug or a hand-crafted API call must not be able to double-deduct a session, push a balance below zero or touch another user's rows. |
| **Ledger, not counters** | `remaining = purchased + Σ ledger`. `package_summary` derives every number at read time, so nothing drifts. |
| **Attendance is the only source of completed/forfeited entries** | One place decides whether a day used a session. Clients cannot insert ledger rows (no INSERT grant). |
| **Void, never delete** | Corrections keep history: a changed day voids its old entry (with reason) and inserts a new one. |
| **Composite `(id, user_id)` foreign keys** | Makes cross-user references impossible even for `SECURITY DEFINER` code paths. |
| **Integer paise, round once** | `sessionValue(n) = round(n × price ÷ sessions)` per package, so allocations reconcile to the price. |
| **Plain `date` columns + user time zone** | Calendar days never shift; "today" is computed with `Intl` in the profile's time zone. |
| **Client-rendered app shell** | All data is per-user; rendering after mount avoids hydration mismatches with dates and cached data. `cacheComponents` is off. |
| **Owner-only seed in the DB** | `initialize_account()` compares the caller's email to `private.app_config.owner_email`; repeat calls are no-ops (`profiles.seeded_at` + row lock + natural keys). |
| **Rule-based NL parser in the browser** | Works offline, no API keys, deterministic, and never confirms a paid PT session by itself. |

## Data model

```
auth.users ─1:1─ profiles (settings, reminders, tracking_start_date, seeded_at)
           ─1:n─ memberships (estimated_end_date GENERATED, confirmed_end_date nullable)
           ─1:n─ trainers ─1:n─ pt_packages ─1:n─ pt_payments (payment|refund, paid|pending)
                                     │      └─1:n─ pt_ledger (append-only, voidable)
           ─1:n─ attendance (unique user+date) ──trigger──▶ pt_ledger
           ─1:n─ schedule_blocks (vacation/rest/trainer_unavailable/holiday/pause)
           ─1:n─ exercises, workout_templates
           ─1:n─ workouts ─1:n─ workout_exercises ─1:n─ workout_sets
           ─1:n─ body_measurements, goals, progress_photos
           ─1:n─ audit_log (insert/update/delete snapshots, written by triggers)
```

### Attendance states
- `gym_status`: `attended | absent | rest | unverified`
- `pt_status`: `completed | chargeable_absence | missed_unconfirmed | trainer_cancelled | rescheduled | not_scheduled | unverified`
- Only `completed` and `chargeable_absence` create a ledger entry (−1).

### Ledger kinds
| kind | sessions | source |
|---|---|---|
| `completed` | −1 | attendance trigger |
| `forfeited` | −1 | attendance trigger (chargeable absence) |
| `credit` | +n | `record_session_adjustment` |
| `refund` | −n | `record_session_adjustment` or `close_package('refunded')` |
| `expired` | −n | `close_package('forfeited')` |
| `transfer_out` / `transfer_in` | ∓n | `close_package('rolled_over')` |
| `adjustment` | ±n | `record_session_adjustment`, note required |

Uniqueness: one active (`voided_at is null`) `completed|forfeited` per `(user_id, session_date)` and
per `attendance_id`.

## Database functions & triggers

| Object | Type | Purpose |
|---|---|---|
| `private.attendance_before` | BEFORE INSERT/UPDATE on attendance | clears stray fields, resolves package (oldest active with balance), blocks future/expired/cancelled packages |
| `private.attendance_sync_ledger` | AFTER INSERT/UPDATE, BEFORE DELETE | voids/creates the day's ledger entry, checks balance ≥ 0 |
| `private.pt_packages_guard` | BEFORE UPDATE on pt_packages | locks price & sessions once used; start date can't pass recorded sessions |
| `private.audit_row` | AFTER triggers on 10 tables | writes `audit_log`; skips rows removed by account deletion |
| `private.handle_new_user` | AFTER INSERT on auth.users | creates `profiles` row |
| `private.package_remaining`, `resolve_package`, `assert_non_negative`, `ensure_defaults` | helpers | not callable by clients |
| `public.create_package(jsonb)` | RPC, invoker | trainer (find or create) + package + payments in one transaction |
| `public.close_package(...)` | RPC, definer | close/keep usable/roll over/forfeit/refund unused sessions |
| `public.record_session_adjustment(...)` / `void_session_adjustment(...)` | RPC, definer | manual credits, refunds, corrections; void (rollover voids both halves) |
| `public.save_workout(jsonb)` | RPC, invoker | workout + exercises + sets atomically; creates unknown exercises |
| `public.initialize_account()` | RPC, definer | defaults for everyone; personal seed for the owner only |
| `public.restore_archive(jsonb)` | RPC, definer | insert-only restore into the caller's account; skips existing rows |
| `public.package_summary` | view, security invoker | all package balances, counts and payment totals |

All functions use `set search_path = ''`; `EXECUTE` is revoked from `anon`/`public`.

## Front-end structure

| Path | Responsibility |
|---|---|
| `src/app/(app)/layout.tsx` | Providers + Suspense + `AppShell` |
| `src/components/providers.tsx` | QueryClient, toasts, `AccountInit` (calls `initialize_account` once per session), theme sync, sign-out watcher |
| `src/components/shell.tsx` | client-only gate, sidebar (desktop), bottom tab bar + Log button (mobile), More sheet |
| `src/components/quick-log.tsx` | context + sheet: went / missed / trainer cancelled / rest, with Undo |
| `src/components/day-editor.tsx` | full day form, ledger impact preview, per-record audit history |
| `src/components/package-sheets.tsx` | payment, adjustment, edit package, schedule days, close package |
| `src/components/workout-editor.tsx` | NL draft, templates, repeat, sets table, attendance choice |
| `src/components/charts.tsx` | Recharts wrappers + table view toggle |
| `src/components/ui.tsx` | design-system primitives (Button, Card, Sheet, Field, Segmented, Choice, Toast…) |
| `src/lib/data/hooks.ts` | every query and mutation; mutations invalidate affected keys |
| `src/lib/data/derived.ts` | `useCore()` → current package, forecast, review queue, finance, reminders |
| `src/lib/data/export.ts` | JSON archive, CSVs, Zod validation, restore call |
| `src/lib/domain/*` | pure functions: `money`, `dates`, `attendance`, `forecast`, `finance`, `stats`, `parser`, `insights`, `reminders`, `packages`, `csv` |

### Request flow example: "I went → PT done"
1. `QuickLogSheet.commit()` → `useSaveAttendance` → `upsert attendance on (user_id, date)`.
2. RLS allows only the caller's row; `attendance_before` resolves the package.
3. `attendance_sync_ledger` inserts `completed −1`; balance check; `audit_row` logs both rows.
4. Mutation invalidates `attendance`, `ledger`, `packages`, `audit` → `useCore` recomputes.

## Security model
- RLS: owners have full CRUD on ordinary tables; `pt_ledger` and `audit_log` are SELECT-only.
- `anon` has no table privileges; RPCs are not executable by `anon`.
- Only the publishable key is shipped to the browser; no service-role key exists in the app.
- Storage policies restrict `progress-photos` objects to the `<auth.uid()>/` prefix; images are read via 10-minute signed URLs.
- `proxy.ts` is a convenience gate; RLS is the security boundary.
- Response headers: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`.

## Testing strategy
- **Unit** (`tests/unit`, Vitest): everything in `src/lib/domain`.
- **Database** (`supabase/tests/integration.sql`): one `DO` block that creates users, switches to
  `role authenticated` with JWT claims, asserts 72 behaviours and finally raises
  `ALL INTEGRATION TESTS PASSED` to roll everything back.
- **Manual/browser**: local dev server against the live DB with throwaway accounts (since deleted).
