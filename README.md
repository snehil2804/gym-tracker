# Rep Ledger — gym & personal training tracker

A personal app for someone who goes to the gym regularly and pays for personal-training (PT)
packages in advance. It tracks the gym membership, PT packages and payments, daily attendance,
a ledger of PT sessions, workouts and strength progress — and, most importantly, the **value of
prepaid PT sessions lost to confirmed chargeable absences**.

Live: **https://gymrepledger.vercel.app** — data lives in Supabase (`ap-south-1`), the app runs on Vercel (`bom1`).

## Documentation

| File | What's in it |
|---|---|
| [PROJECT_STATUS.md](PROJECT_STATUS.md) | What's done, what's verified, what's pending, owner's next steps |
| [SETUP.md](SETUP.md) | Local setup, recreating the Supabase backend, deploying, first sign-in |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design, data model, triggers/RPCs, security, testing |
| [UI_GUIDELINES.md](UI_GUIDELINES.md) | Visual identity, tokens, components, interaction and chart rules |
| [ROADMAP.md](ROADMAP.md) | Planned work |
| [CHANGELOG.md](CHANGELOG.md) | Release history |
| [CLAUDE.md](CLAUDE.md) / [AGENTS.md](AGENTS.md) | Rules and task map for coding agents |

---

## What it does

| Area | Highlights |
|---|---|
| **Today** (dashboard) | One-tap “I went / I missed”, reminders, this week with streak, recent workouts, data-backed insights. Money and package cards live in Membership insights |
| **Calendar** | Month view with distinct day states, day editor with impact preview and change history, planned breaks — plus the streak game: streak flame, XP and levels, monthly perfect-month chase, badges, and a trail joining winning days (rest days never break a streak; misses cost XP) |
| **Review days** | Queue of past training days that are still unconfirmed, with one-tap or bulk confirmation |
| **Membership insights** | Overview with three tiles and the package, missed PT value, gym membership and money cards. **Personal training** (`/membership/training`): packages (create, renew, edit, close, payments, credits/refunds/adjustments, forecast), trainers, prepaid value split, missed value by month. **Gym membership** (`/membership/gym`): current membership, earlier ones, gym spend, editing (estimated vs confirmed end). **Spending** (`/membership/spending`): total paid split gym / PT, paid-per-month chart, cost per session / workout, all payments, definitions |
| **Workouts** | “Describe it in a sentence” draft (offline, rule-based), templates, repeat a previous workout, sets × reps × kg, cardio, notes, edit / duplicate / delete |
| **Progress** | Weekly attendance and workouts, minutes, muscle groups, strength progression and PRs, body measurements, goals, private progress photos |
| **History** | Attendance, session ledger, payments, workouts and the audit trail, filterable by date, trainer, package and type |
| **Sign-in** | Continue with Google (primary), email + password, password reset |
| **Welcome flow** | First sign-in asks name, photo, birth date (age), height, weight, gym membership, personal trainer and weekly goal — skippable, editable later |
| **Photos** | Crop, zoom, rotate and straighten before uploading (round crop for the profile photo; 3:4, 4:5, square, 16:9 or original for progress photos), or upload the original — up to 40 MB |
| **Delete account** | Settings → Delete account: removes photos, every record and the login; only a minimal log entry (email, provider, created/deleted dates, counts) is kept in `private.deleted_accounts` |
| **Settings** | Profile, PT / gym switches, time zone, theme, planned breaks, reminder toggles, CSV/JSON export, archive restore, password, delete account. Gym membership and trainers are edited under Membership |

---

## Architecture

```
Browser (Next.js client components, React Query)
   │  publishable key + user session (JWT)
   ▼
Supabase
   ├─ Auth (Google OAuth primary, email + password fallback)
   ├─ Postgres  ── RLS on every user table
   │     ├─ triggers: attendance → PT ledger (one entry per day, never twice)
   │     ├─ guards:   package price lock, balance never < 0, future/expired packages
   │     ├─ RPCs:     create_package, close_package, record_session_adjustment,
   │     │            void_session_adjustment, save_workout, initialize_account, restore_archive
   │     ├─ view:     package_summary (all balances derived from the ledger)
   │     └─ audit_log written by triggers on every important table
   └─ Storage: private bucket `progress-photos` (per-user folder policy, signed URLs)
Vercel: hosts the Next.js app (proxy.ts refreshes the session and redirects signed-out users)
```

**Why this design**

- **Correctness lives in the database.** Session accounting, duplicate prevention, ownership and
  price locks are enforced by constraints, triggers and `SECURITY DEFINER` functions, so no client
  (or bug in the UI) can create a double deduction or edit another user's records.
- **Balances are derived, never stored.** `package_summary` computes every count from the ledger,
  payments and attendance; there are no counters to drift.
- **Money is integer paise.** No floating-point arithmetic touches amounts; per-session values are
  `round(n × price ÷ sessions)` so totals always reconcile.
- **Client-rendered app shell.** All data is per-user and fetched with the user's session, so the
  UI renders in the browser (no hydration mismatches with dates), while `proxy.ts` gates routes.
- **No external AI dependency.** Natural-language logging is a deterministic parser that runs in
  the browser and never auto-confirms a paid PT session.

Stack: Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS 4, TanStack Query,
Recharts, Supabase (`@supabase/ssr`), Vitest, Zod.

### Project structure

```
src/
  app/
    (app)/            authenticated pages: dashboard, calendar, review, packages, workouts,
                      progress, finance, history, settings
    login/            sign-in / sign-up / password reset
    auth/callback     email confirmation & reset links
    layout.tsx, globals.css (design tokens, light/dark)
  components/         ui kit, shell/navigation, quick-log, day editor, package sheets,
                      workout editor, charts
  lib/
    domain/           pure, unit-tested business logic: money, dates, attendance rules,
                      forecast, finance, stats, parser, insights, reminders, csv
    data/             React Query hooks, derived state, export/restore
    supabase/         browser + server clients
  proxy.ts            session refresh + auth redirect (Next 16 "proxy", formerly middleware)
supabase/
  migrations/         schema, RLS, triggers, RPCs, views, seed function, storage
  tests/integration.sql   78 database checks run as a real `authenticated` user (rolled back)
tests/unit/           Vitest unit tests for the domain layer
```

---

## Business rules

### Attendance
Each calendar date has at most one record with two independent fields:

- **Gym:** attended · missed · rest · unconfirmed
- **PT:** completed · missed–chargeable · missed–not sure · trainer cancelled · **I cancelled** · rescheduled · no PT scheduled · unconfirmed

A day with no record is **unconfirmed** — except **Sundays, which are rest days by default** (anything you log on a Sunday overrides that). Unconfirmed days are never counted as attended,
completed, missed or lost.

### How the PT balance is calculated
```
remaining = sessions purchased + Σ(non-voided ledger entries)

ledger entry                    sessions   created by
completed                         −1       attendance PT = completed
forfeited (chargeable absence)    −1       attendance PT = missed–chargeable
credit                            +n       manual (trainer gave free/make-up sessions)
refund                            −n       manual or package closure (money returned)
expired                           −n       package closure: unused sessions forfeited
transfer_out / transfer_in        ∓n       package closure: explicit rollover to another package
adjustment                        ±n       manual correction, note required
```
- Only `completed` and `missed–chargeable` attendance touch the balance. A gym absence alone never does.
- A partial unique index allows **one** active completed/forfeited entry per date and per
  attendance record, so nothing can be deducted twice (including by concurrent requests).
- Changing or clearing a day **voids** its entry (kept, crossed out, with a reason) and, if needed,
  creates a new one — corrections are reversible and audited.
- The balance can never go below zero; a session can't be recorded before a package starts, after
  it expires (unless extensions are allowed) or on a cancelled package.
- Sessions are taken from the **oldest active package that covers the date and still has sessions**,
  unless you pick a package explicitly.

### Cost per session and missed-session value
- `cost per session = package price ÷ sessions purchased` — per package, fixed forever. A renewal at a
  new price never changes older packages; their price and session count are locked once used.
- `missed-session value = confirmed chargeable absences × that package's rate`. This is the value of
  prepaid sessions you didn't use, **not new money spent** that day.
- “Possible misses to confirm” (scheduled PT days you missed the gym but haven't confirmed) is shown
  as an upper bound only and is never added to any loss.

### Trainer cancellations, reschedules, refunds and credits
- **Trainer cancelled:** no deduction, never a loss.
- **I cancelled** (you called the session off): no deduction by default. If the trainer still charged it
  (e.g. late cancellation), record the day as *missed–chargeable* instead. Shown as “<Name> cancelled”
  when your display name is set in Settings.
- **Rescheduled:** the original day records the move; only the make-up day (logged as completed)
  uses a session — counted once.
- **Credits** add sessions (not cash). **Refunded sessions** remove sessions; the money is recorded
  as a refund payment, which reduces “spent”.

### Personalisation
- **Personal training** and **gym membership** tracking are switches in Settings → What you track (chosen
  during onboarding). Switching one off hides its screens and cards; nothing is deleted.
- Every money card has an **eye toggle** that masks amounts (₹••••) on this device.

### Payments
Payments are separate from session value. `paid` payments count as spent; `pending` ones are listed
as owed. “Not yet paid” = package price − paid payments. A package with no payment recorded is shown
as entirely not-yet-paid — never as spent.

### Membership expiry
`estimated end = start + duration months − 1 day` (e.g. 29 Sep 2026 + 3 months → **28 Dec 2026**),
labelled *Estimated*. The **confirmed** contractual end date is a separate field you fill in; when
present it is used everywhere and labelled *Confirmed*.

### Forecasts
Next session and estimated last session walk forward from today (or tomorrow if today's PT outcome
is already logged) over the package's training days, skipping Sundays when excluded and any planned
breaks (vacation, rest, trainer unavailable, holiday, package pause). They assume every remaining
planned session happens and are always labelled as estimates. With an expiry date, the app also
shows how many sessions are possible before expiry and how many could go unused.

### Time zones
Dates are stored as plain calendar dates. “Today” is computed in the profile's time zone
(default Asia/Kolkata), so late-night logging never lands on the wrong day.

---

## Sign-in with Google

The login page shows **Continue with Google** first; email + password stays available underneath.
The button switches itself on as soon as Google is enabled in Supabase (the page reads
`/auth/v1/settings`), so no redeploy is needed.

1. **Google Cloud Console** → <https://console.cloud.google.com/> → create/select a project.
2. **Google Auth Platform → Branding / OAuth consent screen**: app name *Rep Ledger*, your support
   email, audience **External**. While in *Testing*, add your Gmail under **Test users** (or publish
   the app). Scopes: the defaults `openid`, `email`, `profile` are enough.
3. **Clients → Create client → Web application**:
   - Authorized JavaScript origins: `https://gymrepledger.vercel.app`, `http://localhost:3000`
   - Authorized redirect URI: **`https://xipmgknkvhnfbujlavbh.supabase.co/auth/v1/callback`**
   - Copy the **Client ID** and **Client secret**.
4. **Supabase dashboard → Authentication → Sign In / Providers → Google**: enable it, paste the
   Client ID and Client secret, save.
5. **Supabase → Authentication → URL Configuration** (required — otherwise Supabase sends you back to
   `http://localhost:3000` after Google): Site URL `https://gymrepledger.vercel.app`; Redirect URLs
   `https://gymrepledger.vercel.app/**` and `http://localhost:3000/**` (the wildcard is needed
   because the callback carries a `?next=` parameter).
6. Open the app → **Continue with Google** → pick `snehilrai678.sr@gmail.com`.

Flow: browser → Google → `https://<ref>.supabase.co/auth/v1/callback` → `/auth/callback?code=…`
(PKCE code exchange in `src/app/auth/callback/route.ts`) → dashboard. The owner seed matches on the
Google account's email, so sign in with the same Gmail address as `owner_email`. If an email/password
account with that address already exists, Supabase links the Google identity to it automatically.
The client secret lives only in Supabase — never in this repo or in Vercel.

## Initial data

`initialize_account()` runs once per account on first sign-in (and is safe to call any number of
times). Every account gets the exercise library and workout templates. **Only the owner account**
(the email in `private.app_config.owner_email`, which is not stored in this repository) also gets:

- 19Fitness membership from 29 Sep 2026, 3 months, ≈ ₹5,000 — price flagged approximate, payment
  *not confirmed*, confirmed end date empty (estimate: 28 Dec 2026)
- Trainer Soham; package ₹6,000 / 30 sessions (₹200 each) from 29 Sep 2026, Mon–Sat, Sundays excluded;
  **no payment recorded** (you confirm it)
- Ten confirmed gym absences (1, 3, 11, 12, 13, 15, 17, 19, 23, 24 Oct 2026). Their PT outcome is
  **unconfirmed**, except 11 Oct (a Sunday), which is *no PT scheduled*.

No workouts, attendance on other dates, or financial transactions are invented.

---

## Local development

Requirements: Node.js 20.9+ (tested on 24), npm. A Supabase project.

```bash
npm install
cp .env.example .env.local   # fill in your Supabase URL and publishable key
npm run dev                  # http://localhost:3000
```

### Environment variables

| Variable | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser + server | publishable/anon key — safe to expose; RLS protects data |
| `NEXT_PUBLIC_ALLOW_SIGNUP` | optional | `false` hides the sign-up tab |
| `SUPABASE_DB_URL` | your shell only | only for `npm run test:db`; never commit or deploy it |

The app never uses the `service_role` key.

### Supabase setup (new project)

1. Create a project (any region; this one uses `ap-south-1`, Mumbai).
2. Apply the migrations in order — SQL editor, `supabase db push`, or `psql`:
   `supabase/migrations/20261026000001_core_schema.sql`, `…0002_ledger_logic.sql`, `…0003_reporting_seed_restore.sql`, `20261027000004_fk_indexes.sql`, `20261027000005_client_cancelled.sql`, `20261027000006_onboarding_profile.sql`, `20261027000007_account_deletion.sql`, `20261027000008_ledger_trigger_account_delete.sql`, `20261027000009_photo_limit_40mb.sql`.
3. Set the owner email (who receives the personal seed):
   ```sql
   insert into private.app_config (key, value) values ('owner_email', 'you@example.com')
   on conflict (key) do update set value = excluded.value;
   ```
4. **Authentication → URL configuration:** set *Site URL* to your deployed URL and add
   `https://<your-domain>/**` (and `http://localhost:3000/**`) to *Redirect URLs*.
   Email + password is enabled by default; keep “Confirm email” on.

### Tests and checks

```bash
npm test            # 40 unit tests (money, dates/time zones, rules, finance, forecast, parser)
npm run check       # typecheck + lint + tests + build
npm run typecheck
npm run lint
npm run build
SUPABASE_DB_URL='postgresql://…' npm run test:db   # 72 database checks, all rolled back
```
`supabase/tests/integration.sql` can also be pasted into the Supabase SQL editor. A successful run
ends with the error message `ALL INTEGRATION TESTS PASSED (78 checks)` — the exception is
intentional: it rolls back everything the test created.

---

## Deploying to Vercel

Vercel project: `gym-tracker` (team "Snehil's projects", functions region `bom1` / Mumbai, close to
the Supabase project in `ap-south-1`). Project environment variables (Production, Preview,
Development): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

Deploy from this folder with the Vercel CLI:

```bash
npx vercel login          # once per machine
npx vercel link --project gym-tracker --yes
npx vercel deploy --prod
```

The project is connected to `snehil2804/gym-tracker`: every push to `main` deploys to production
(https://gymrepledger.vercel.app).

After the first deploy, update Supabase *Site URL* / *Redirect URLs* (setup step 4) to the Vercel domain.

## Backup and restore

- **Full archive (JSON)** — Settings → Export & backup. Contains every table with IDs and
  relationships: profile, memberships, trainers, packages, payments, attendance, the complete PT
  ledger (including voided entries), planned breaks, exercises, templates, workouts, exercises and
  sets, measurements, goals, photo metadata and the audit log. Amounts in paise, dates ISO.
- **CSV** — attendance, packages, payments, session ledger, workouts, memberships, measurements,
  and per-set exercise history.
- **Restore** — Settings → *Choose archive file*. The file is validated in the browser, then
  `restore_archive()` inserts it into *your* account in one transaction. It never overwrites; rows
  that already exist (same ID, same date, same exercise/trainer name) are skipped, so restoring twice
  creates no duplicates. Completed/missed ledger entries are rebuilt from attendance.

**Limitations:** progress-photo image files are not inside the archive (download them separately);
voided ledger entries and the audit log are exported for reference but not re-imported. For
disaster recovery of the whole database, use Supabase's own backups (daily on paid plans) or
`pg_dump` with your database URL.

## Security

- RLS on every user table: owners can read/write only their own rows; the ledger and audit log are
  read-only to clients. Composite foreign keys `(id, user_id)` make cross-user references impossible.
- Privileged functions validate `auth.uid()` ownership and run with an empty `search_path`.
  (Supabase's advisor flags the five intentionally callable RPCs — that is expected.)
- Photos are in a private bucket under `<user_id>/…`, read through 10-minute signed URLs.
- No secrets in the repository or the browser bundle; `.env*` is git-ignored.
- Every account starts empty except the configured owner, so other sign-ups never see personal data.

## Troubleshooting

| Problem | Fix |
|---|---|
| After Google (or an email link) you land on `localhost:3000/?code=…` | Set Supabase *Site URL* and *Redirect URLs* to the deployed domain (setup step 4). Your email is still confirmed — sign in on the deployed site. |
| “No active PT package covers …” | Add or renew a package whose start date is on/before that day, or allow expiry extension. |
| “Price and session count are locked” | Sessions are recorded; use a credit, refund or adjustment instead. |
| “This change would leave the package with -1 sessions” | The package is used up — renew or record a credit. |
| Dashboard shows nothing after sign-in | Check the two `NEXT_PUBLIC_*` variables and that migrations were applied. |
| Wrong “today” | Settings → Time zone. |

## Known limitations

- Reminders are shown in the app only; no email/push notifications or scheduled jobs (would need
  an email provider or Vercel Cron + a server key).
- One PT session per calendar day is assumed (a second one can be recorded as an adjustment).
- Natural-language logging is rule-based: it recognises common exercises, sets/reps/kg, durations
  and dates, and asks you to choose when it is unsure.
- Supabase's built-in email sender is rate-limited; configure custom SMTP for heavier use.
- Photos can be up to 40 MB each, but the Supabase free plan has **1 GB of file storage in total**
  (roughly 25 full-size 40 MB photos; far more for typical 3–6 MB phone photos).
