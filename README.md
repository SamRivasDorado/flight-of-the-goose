# Goose

A planning and tracking app for technical and consulting work: goals, projects, tasks and the people behind them.
It grew out of a prototype (in `public/prototype/`) and is now being built as a real web app.

- **Strategy → Projects → Tasks**: goals and sub-goals, fixed-term and ongoing projects, tasks with assignees.
- **Timeline** of every project as a lane, **Review** for any date range, **Insights** charts.
- **Teams and access levels**: Admin, Manager, Member, Guest. Each person sees only what they are part of.
- **Workspaces**: sign up and work on your own, or be invited into a colleague's workspace.

## How it is built

| Part | Choice | Why |
|---|---|---|
| Web app | React + TypeScript (Vite) | Standard, fast, easy to host anywhere |
| Database, logins, files | [Supabase](https://supabase.com) (Postgres, EU region) | Email sign-in and invitations built in; row-level security enforces who sees what |
| Hosting | Cloudflare Pages | Free for commercial use, global CDN |

The visibility rules live in the database (`supabase/migrations`), not in the page: the browser never receives data a person may not see. See [docs/architecture.md](docs/architecture.md) and [docs/teams-and-access.md](docs/teams-and-access.md).

## Status

Phase 1 (foundation) is under way. Working now: sign-in by email link, personal workspaces, accepting invitations, Projects, Tasks and Team (invite) screens. Timeline, Strategy, Review and Insights are being moved over from the prototype. See [docs/roadmap.md](docs/roadmap.md).

## Setting it up

You need Node.js 20 or newer and a free Supabase account.

1. **Create the Supabase project.** At supabase.com create a new project; pick the **Frankfurt (eu-central-1)** region.
2. **Create the database.** In the project's **SQL Editor**, paste the contents of `supabase/migrations/20261023000000_init.sql` and run it.
3. **Allow sign-in links back to the app.** In **Authentication → URL Configuration**, set the Site URL to `http://localhost:5173` while developing (later, your real domain).
4. **Connect the app.** Copy `.env.example` to `.env.local` and fill in the Project URL and the `anon` public key from **Project Settings → API**.
5. **Run it.**
   ```bash
   npm install
   npm run dev
   ```
   Open http://localhost:5173, enter your email, and click the link you receive. Your personal workspace is created on first sign-in.

## Testing the security rules

`supabase/tests/access_rules.sql` signs in as an admin, a member, a guest, a manager and an outsider, and checks what each can see and change. It runs automatically on every push (GitHub Actions, see `.github/workflows/ci.yml`). To run it locally against a plain Postgres 16:

```bash
psql -f supabase/tests/stub_supabase.sql
psql -f supabase/migrations/20261023000000_init.sql
psql -f supabase/tests/access_rules.sql   # ends with "ALL ACCESS TESTS PASSED"
```

## Name and look

The app is called **Goose** (`APP_NAME` in `src/config.ts`, `<title>` in `index.html`). The default palette is **Goose feather**: near-black top bars, warm white content, beak-orange actions and yolk-yellow highlights. The other palettes (Golden meadow, Forest calm, Evening glow, Coastal breeze) are in `src/styles.css`. The preliminary logo is the goose in `public/` (`goose.png` on its own, `goose-tile-*.png` on a warm white square for the dark top bar and app icons), used through `src/components/Logo.tsx`.
