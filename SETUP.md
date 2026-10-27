# Setup

Step-by-step instructions to run Rep Ledger locally, recreate the backend from scratch, and deploy.

## 1. Requirements
- Node.js **20.9+** (developed on 24.x) and npm
- A Supabase account (free plan is enough)
- A Vercel account (Hobby is enough)
- Optional: `psql` for running the database test suite from a terminal

## 2. Run locally against the existing project

```bash
cd /Users/snehilrai/Desktop/Project/gym-tracker
npm install
```

Create `.env.local` (git-ignored):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xipmgknkvhnfbujlavbh.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...   # Supabase → Project Settings → API keys
```

```bash
npm run dev     # http://localhost:3000
```

Make sure `http://localhost:3000/auth/callback` is in Supabase → Authentication → URL Configuration
→ Redirect URLs if you use email links locally.

## 3. Create a new Supabase backend (from scratch)

1. **Create a project** in Supabase (any region; the live one is `ap-south-1`).
2. **Apply migrations in order** (SQL editor, `supabase db push`, or `psql -f`):
   1. `supabase/migrations/20261026000001_core_schema.sql`
   2. `supabase/migrations/20261026000002_ledger_logic.sql`
   3. `supabase/migrations/20261026000003_reporting_seed_restore.sql`
   4. `supabase/migrations/20261027000004_fk_indexes.sql`
3. **Set the owner email** (only this account gets the initial personal records):
   ```sql
   insert into private.app_config (key, value) values ('owner_email', 'you@example.com')
   on conflict (key) do update set value = excluded.value;
   ```
4. **Authentication → URL Configuration**
   - Site URL: your production URL (e.g. `https://gym-tracker-nine-roan.vercel.app`)
   - Redirect URLs: `https://<prod-domain>/auth/callback`, `http://localhost:3000/auth/callback`
   - Keep Email provider enabled with "Confirm email" on.
5. **Optional:** custom SMTP (Authentication → Emails) if confirmation emails don't arrive.
6. **Check:** Advisors → Security should show only the 5 intended "security definer executable" warnings.

## 4. Verify the backend

```bash
npm test                         # 36 unit tests
SUPABASE_DB_URL='postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres' npm run test:db
```

Or paste `supabase/tests/integration.sql` into the SQL editor. Expected output is an *error* reading
`ALL INTEGRATION TESTS PASSED (72 checks)` — that intentional exception rolls back all test data.
Any other message starting with `FAIL:` names the broken rule.

## 5. Deploy to Vercel

### Existing project (`gym-tracker`)
Environment variables are already set for Production, Preview and Development.

```bash
npx vercel login
npx vercel link --project gym-tracker --yes
npx vercel deploy --prod
```

Or connect `snehil2804/gym-tracker` under Vercel → Project → Settings → Git to deploy on every push to `main`.

### New project
1. Import the repository in Vercel (framework: Next.js; Node 24.x).
2. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   (optional `NEXT_PUBLIC_ALLOW_SIGNUP=false`).
3. Set the functions region near your database (e.g. `bom1` for `ap-south-1`).
4. Deploy, then update Supabase Site URL / Redirect URLs to the new domain.

## 6. First sign-in
1. Open the production URL → Sign up with the owner email → confirm via email → sign in.
2. The app calls `initialize_account()` once: exercise library, templates and (owner only) the
   membership, Soham's package and the 10 confirmed absences appear.
3. Follow the "Owner's next steps" in `PROJECT_STATUS.md`.

## 7. Useful commands

| Command | Does |
|---|---|
| `npm run dev` | dev server (Turbopack) |
| `npm run build` / `npm start` | production build / serve |
| `npm test` | unit tests |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run check` | typecheck + lint + tests + build |
| `npm run test:db` | database suite via `psql` (`SUPABASE_DB_URL` required) |

## 8. Resetting a user's data
Deleting the user in Supabase → Authentication → Users cascades to every table (audit rows
included). To re-run the seed for the owner, delete and re-create the account, or clear
`profiles.seeded_at` **and** delete the seeded rows first (the seed skips existing natural keys).
