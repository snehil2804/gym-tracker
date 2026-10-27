# Changelog

All notable changes to Rep Ledger. Format follows [Keep a Changelog](https://keepachangelog.com/);
dates are when the change landed.

## [Unreleased]

### Fixed
- An OAuth `?code=` that lands on any page (Supabase's Site-URL fallback) is forwarded to
  `/auth/callback`, so sign-in completes instead of stalling; expired/cross-site codes show a plain message.

### Added
- **Continue with Google** as the primary sign-in method (Supabase OAuth, PKCE). Email + password moves
  below it as a fallback. The button enables itself when Google is turned on in Supabase; OAuth errors
  returned to `/auth/callback` are shown on the login page in plain language.
- Project documentation: `PROJECT_STATUS.md`, `CHANGELOG.md`, `CLAUDE.md`, `ARCHITECTURE.md`,
  `ROADMAP.md`, `SETUP.md`, `UI_GUIDELINES.md`; expanded `AGENTS.md` and `README.md`.

## [0.1.0] — 2026-10-27

First complete release, deployed to https://gymrepledger.vercel.app.

### Infrastructure
- Created Supabase project `gym-tracker` (`xipmgknkvhnfbujlavbh`, ap-south-1, free plan).
- Created Vercel project `gym-tracker` (functions in `bom1`) with `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for all environments.
- Private GitHub repository `snehil2804/gym-tracker`; production deployed from `main`.
- Owner email stored in `private.app_config` (not in source control).

### Database (`supabase/migrations`)
- `20261026000001_core_schema` — tables: `profiles`, `memberships`, `trainers`, `pt_packages`,
  `pt_payments`, `attendance`, `pt_ledger`, `schedule_blocks`, `exercises`, `workout_templates`,
  `workouts`, `workout_exercises`, `workout_sets`, `body_measurements`, `goals`, `progress_photos`,
  `audit_log`; check constraints; composite `(id, user_id)` ownership foreign keys; RLS on every
  table; profile-on-signup trigger; generic audit trigger; `private` schema with `app_config`.
- `20261026000002_ledger_logic` — attendance → ledger triggers (one active consumption per day and
  per record, void-on-change), package resolution (oldest active with balance), balance floor,
  package price/session lock, RPCs `record_session_adjustment`, `void_session_adjustment`,
  `close_package`, `create_package`, `save_workout`.
- `20261026000003_reporting_seed_restore` — `package_summary` view (security invoker), default
  exercise library (50) and templates (8), `initialize_account()` owner-only idempotent seed,
  `restore_archive()`, private `progress-photos` bucket with per-user folder policies.
- `20261027000004_fk_indexes` — covering indexes for ownership foreign keys; removed redundant indexes.

### App
- Next.js 16 App Router + TypeScript + Tailwind 4; client-rendered app shell with React Query.
- Auth: email/password sign-in, sign-up, password reset, `/auth/callback`, sign-out, `proxy.ts` gate.
- **Today** dashboard: one-tap logging, reminders, PT package card with forecast, missed-value card,
  week strip, membership, money snapshot, recent workouts, insights.
- **Calendar** with 11 day states (icon + colour + label), day editor with impact preview and change history.
- **Review days** queue with per-day and bulk confirmation.
- **PT Packages**: list, detail (ledger, payments, adjustments, forecast, closure), create/renew flow
  with explicit handling of unused sessions.
- **Workouts**: editor with "describe it in a sentence" draft, templates, repeat workout, sets/reps/kg,
  cardio, notes; detail with PR badges; list with search/filters; exercise & template library.
- **Progress**: weekly attendance and workouts, minutes, muscle groups, strength progression & PRs,
  body measurements, goals, private progress photos (signed URLs).
- **Money**: missed value, cash spent vs owed, prepaid value split, per-package table, payments,
  definitions of every metric.
- **History**: attendance, ledger, payments, workouts and audit trail with filters.
- **Settings**: profile/time zone/theme, membership (estimated vs confirmed end), trainers, planned
  breaks, reminder toggles, JSON/CSV export, archive restore, password change.
- Light and dark themes ("ink & ember"), mobile bottom navigation, PWA manifest and icon,
  security headers.

### Tests
- 36 Vitest unit tests (`tests/unit`).
- 72-check database integration suite (`supabase/tests/integration.sql`), all passing on the live DB.

### Fixed during development
- Hydration mismatch from dates/cached data → app shell renders client-side only.
- Next 16 Cache Components prerender errors on client pages → disabled `cacheComponents`.
- Parser split "an hour and a half" on "and"; decimal weights (12.5 kg) read as dates.
- Dark-mode chart colours failed the palette lightness check → separate chart tokens per theme;
  missed segments also hatched (colour-blind safety).
- "1 sessions" pluralisation on the Money page.
- Workout draft message claimed PT was pre-selected on already-logged days.
