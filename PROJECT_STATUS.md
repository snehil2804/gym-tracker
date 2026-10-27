# Project status

_Last updated: 27 Oct 2026_

**Rep Ledger** (repo `gym-tracker`) is a personal gym membership, PT package, attendance, workout
and finance tracker. It is **built, tested and deployed**, but **not yet signed into on production
by its owner**.

| | |
|---|---|
| Production URL | https://gym-tracker-nine-roan.vercel.app |
| Vercel project | `gym-tracker` (`prj_N87my63Ng6m7CkwBAkCfXkgYqW81`), team "Snehil's projects", functions region `bom1` |
| Supabase project | `gym-tracker` (`xipmgknkvhnfbujlavbh`), org "Snehil Personal Projects", region `ap-south-1`, free plan ($0/month) |
| Source | private GitHub repo `snehil2804/gym-tracker`, branch `main` |
| Local folder | `/Users/snehilrai/Desktop/Project/gym-tracker` |
| Owner account (receives the seed) | `snehilrai678.sr@gmail.com` (stored in `private.app_config`, not in git) |

---

## Overall state

| Area | State | Notes |
|---|---|---|
| Database schema, RLS, triggers, RPCs | ✅ Done, applied | 4 migrations applied to the live project |
| Session ledger & financial integrity | ✅ Done, tested | 72 database checks pass against the live DB |
| Domain logic (money, dates, rules, forecast, parser) | ✅ Done, tested | 36 unit tests pass |
| Auth (email + password, reset, sign-out, protected routes) | ✅ Done | Verified locally; production sign-in not yet done by owner |
| Initial seed (owner only, idempotent) | ✅ Done, tested | Verified end-to-end locally with a test owner account |
| UI: all 8 sections + review queue | ✅ Done | Verified in the browser on desktop and 375 px mobile |
| Export / restore | ✅ Done | Restore tested in SQL (idempotent, isolation-safe) |
| Production deployment | ✅ Ready | Build READY; routes, headers and anonymous access checked |
| Supabase Auth URL configuration | ⚠️ Manual step pending | Site URL / redirect URLs must point at the Vercel domain |
| Auto-deploy on git push | ⚠️ Not connected | Deployed via the Vercel API from `main`; connect the repo in Vercel settings |
| Email / push notifications | ❌ Not built | Reminders are in-app only |

---

## What works (verified)

### Verified in a real browser (local dev server → live Supabase database)
- Redirect to `/login` when signed out; sign-in; session persists across reloads.
- First sign-in of the owner account seeds: 19Fitness membership (≈₹5,000, estimated end
  28 Dec 2026, unconfirmed), trainer Soham, ₹6,000 / 30-session package, 10 confirmed gym absences.
- Dashboard: reminders, PT balance, prepaid value, missed value, membership, week strip, money, insights.
- Day editor: marking 12 Oct as a chargeable absence → balance 29, missed value ₹200, remaining
  possible misses 8 (≤ ₹1,600).
- Quick log "I went → PT done" → balance 28, next session moves to tomorrow, Undo offered.
- Workout from a sentence ("…Soham trained me for one hour. Did bench press 3x10 at 30kg…") →
  3 exercises, 9 sets, 60 min, volume 1,980 kg, saved and reloaded.
- Renewal: new ₹8,000 / 24 package (₹333.33 per session) created as *Upcoming*; the original
  ₹6,000 package's price, rate and history were unchanged.
- All pages render without runtime errors: dashboard, calendar, review, packages (list/detail/new),
  workouts (list/new/detail/library), progress, money, history, settings.
- Mobile layout (375 × 812): bottom navigation, calendar cells ≥ 44 px, sheets as bottom sheets.

### Verified by automated tests
- **Unit (Vitest, 36 tests):** money formatting/parsing/allocation, date maths (month/year
  boundaries, Sundays, time zones incl. IST midnight and New Year), attendance classification,
  seeded absences, finance reconciliation, renewal rates, pending payments, forecasting (Sundays,
  vacations, pauses, expiry, future start, year boundary), streaks, PRs, insights, CSV, parser.
- **Database (`supabase/tests/integration.sql`, 72 checks, run as role `authenticated`, rolled back):**
  test scenarios 1–7, 9, 11–17 from the original brief, plus corrections, credits, balance floor,
  closure/rollover, restore idempotency and isolation.

### Verified on production
- `/` and `/packages` → 307 to `/login`; `/login` 200 with correct title; manifest and icon 200.
- Security headers present (`X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`); no `service_role` in the bundle.
- Supabase REST with the publishable key and no session: read, write and RPC calls all return 401.

### Not verified
- Signing in / signing up on the **production** URL (left to the owner; test credentials were not
  used against production).
- Delivery of Supabase confirmation / reset emails.
- Restore of a downloaded archive through the UI (the database function is tested; the UI flow was not clicked through).
- Progress-photo upload through the UI (storage policies are applied; not exercised in the browser).

---

## Data currently in the database

Empty. The two throwaway test accounts used for local verification (`rl-owner-test@test.local`,
`rl-other-test@test.local`) were deleted along with all their data, and `owner_email` was set back
to the owner's address. The owner's records are created on their first sign-in.

---

## Owner's next steps

1. Supabase → Authentication → URL Configuration: Site URL `https://gym-tracker-nine-roan.vercel.app`;
   add `https://gym-tracker-nine-roan.vercel.app/auth/callback` (and `http://localhost:3000/auth/callback`) to Redirect URLs.
2. Sign up on the production site with `snehilrai678.sr@gmail.com`, confirm the email, sign in.
3. Settings → Gym membership: enter the **confirmed** contract end date; set payment status/price.
4. PT Packages → Soham → Record payment for the ₹6,000 package (if paid).
5. Review days: confirm the PT outcome of the nine seeded weekday absences and the other past
   training days since 29 Sep.
6. Optional: set `NEXT_PUBLIC_ALLOW_SIGNUP=false` in Vercel and redeploy to hide sign-up.
7. Optional: connect the GitHub repo in Vercel for auto-deploys.

---

## Known issues / risks

- Supabase's built-in email sender is rate-limited and may only deliver to project team members;
  configure custom SMTP if confirmation emails don't arrive.
- Supabase advisor shows 5 WARN "security definer function executable by authenticated" — intentional
  (each function checks `auth.uid()` ownership).
- Next 16 dev overlay may show "instant navigation" validation notices from older sessions; Cache
  Components is disabled in `next.config.ts`, so they no longer apply.
