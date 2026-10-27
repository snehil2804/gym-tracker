# Roadmap

Ordered by value to the owner. Anything that touches session accounting or money must keep the
rules in `ARCHITECTURE.md` (database-enforced, ledger-derived, integer paise) and add tests in both
`tests/unit` and `supabase/tests/integration.sql`.

## Now — finish going live
- [ ] Set Supabase Auth Site URL / Redirect URLs to the Vercel domain.
- [ ] Owner signs up on production; confirm the seed appears exactly once.
- [ ] Confirm membership end date and record PT / gym payments.
- [ ] Work through the review queue (29 Sep → today).
- [ ] Connect `snehil2804/gym-tracker` to the Vercel project for auto-deploys on push.
- [ ] Decide whether to close sign-ups (`NEXT_PUBLIC_ALLOW_SIGNUP=false`).

## Next — reliability & verification
- [ ] Playwright end-to-end suite against a Supabase branch or local stack (sign-in, quick log,
      renewal, restore, mobile viewport) and a CI workflow running `npm run check` + `test:db`.
- [ ] Click-through test of archive restore and photo upload in the UI.
- [ ] Custom SMTP for Supabase Auth emails.
- [ ] Error reporting (e.g. Vercel log drain or Sentry) for client errors.
- [ ] Generated Supabase TypeScript types instead of hand-written `src/lib/types.ts`.

## Later — features
- [ ] Notifications: daily "log today" and renewal emails via Vercel Cron + a server-only key, or Web Push.
- [ ] Offline logging (queue quick-log actions while offline, sync later).
- [ ] Multiple PT sessions per day (needs a `slot` in the attendance/ledger uniqueness rules).
- [ ] Public holiday calendar import for forecasts.
- [ ] Rest timer and in-workout "live" mode with previous-set hints.
- [ ] Progress photo side-by-side compare.
- [ ] Membership payments as their own table (instalments, like PT payments).
- [ ] Optional AI parsing (server-side only, key never in the browser) as a fallback when the
      rule-based parser is unsure.
- [ ] Multi-currency formatting beyond INR.

## Won't do (by design)
- Auto-deducting PT sessions from gym absences or ambiguous text.
- Filling charts or history with estimated/fabricated records.
- Storing balances as counters that can drift from the ledger.
