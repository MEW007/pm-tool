# PM Tool

Online project management tool for running projects through meetings, minutes, actions, decisions and risks. See [`BUILD_PLAN.md`](BUILD_PLAN.md) for the full plan, data model and progress log.

- **Frontend:** Vite + React + TypeScript, hosted on GitHub Pages
- **Backend:** Supabase (Postgres, EU region), Supabase Auth, Row Level Security

## Development

```bash
npm install
cp .env.local.example .env.local   # fill in your Supabase project's URL + anon key
npm run dev
```

## Deployment

Pushing to `main` builds the app and deploys it to GitHub Pages via `.github/workflows/deploy.yml`. The build needs these repo variables (Settings → Secrets and variables → Actions → Variables):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

These are safe as public variables, not secrets: access to real data is enforced by Supabase Auth + Row Level Security, not by hiding the anon key.

`.github/workflows/keepalive.yml` and `backup.yml` keep the free-tier Supabase project alive and back up the database nightly (`backup.yml` needs a `SUPABASE_DB_URL` **secret** — the direct Postgres connection string, kept secret).
