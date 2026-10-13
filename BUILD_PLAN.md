# PM Tool – Build Plan

Online project management tool for running projects through meetings, minutes, actions, decisions and risks.

- **Owner:** Ward Mertens
- **Started:** 2026-10-06
- **Status:** Phase 4 – Team

---

## 1. Decisions taken

| Date | Topic | Decision |
|------|-------|----------|
| 2026-10-06 | Hosting | Static web app on **GitHub Pages**, deployed by GitHub Actions |
| 2026-10-06 | Database | **Supabase** (Postgres, EU region), relational tables with Row Level Security (RLS) |
| 2026-10-06 | Users | **Small team editing**: every user logs in, access is granted per project |
| 2026-10-06 | Risks | **Both**: a risk register maintained directly, plus a `Risk` minute type that creates a linked register entry |
| 2026-10-06 | UI language | **English** |
| 2026-10-06 | Frontend | Vite + React + TypeScript + `supabase-js` (proposed default, see open questions) |
| 2026-10-06 | Repo | New separate repo `pm-tool`, **public** on GitHub |
| 2026-10-06 | Supabase tier | **Free tier** to start, mitigated with keep-alive job (Phase 9); revisit Pro later if needed |
| 2026-10-06 | Data scope | Not a PSA/client tool — this is a **private tool for Delaport ventures**; no third-party employer data-policy constraint |

---

## 2. Open questions

| # | Question | Why it matters | Answer |
|---|----------|----------------|--------|
| Q1 | Separate GitHub repo for the tool (e.g. `pm-tool`)? | The current VSStudio repo only tracks `Projects/PSA`. GitHub Pages works best with one repo per app. | **Yes**, new repo `pm-tool` |
| Q2 | Public or private repo? | GitHub Pages on a **private** repo needs a paid GitHub plan (Pro/Team). A public repo is safe because there are no secrets in the code: data is protected by login + RLS. | **Public** |
| Q3 | Is storing project data on Supabase allowed by company policy? | Data sits on a third-party cloud (EU region). | **N/A** — this is not a PSA/client or employer project, it's a private tool for Delaport ventures. No employer data-policy constraint applies. |
| Q4 | Supabase free tier or Pro (~25 USD/month)? | Free projects **pause after 7 days without activity** and have no automatic backups. Mitigated by a keep-alive and nightly backup job (Phase 9), Pro removes the issue. | **Free**, start with keep-alive job; revisit Pro later |
| Q5 | In a follow-up meeting, show open actions of **that meeting series only**, or **all open project actions**? | Default proposal: series only, with a toggle "show all project actions". | Proposed default accepted |
| Q6 | Can action owners be people outside the team (e.g. contractor contacts without login)? | Proposal: yes, team members do not need a login. Only members with a login can edit. | Proposed default accepted |
| Q7 | Minutes output: printable/PDF view needed? Distribution by email? | Proposal: print-friendly view (browser → PDF) in Phase 8. Email distribution later. | Proposed default accepted |

---

## 3. Functional scope

### 3.1 Start screen
- Login (email magic link via Supabase Auth, sign-up disabled, users are invited).
- Project selector: shows only projects the user is a member of.
- Admin can create a new project.

### 3.2 Project environment
Left navigation inside a project:
1. **Dashboard**
2. **Meetings**
3. **Actions**
4. **Decisions**
5. **Risks**
6. **Team**
7. **Settings** (project admin only)

### 3.3 Team
- Team member: name, email, role (free text, e.g. "Project Manager", "Electrical Lead"), company, active yes/no.
- Optional link to a login account. Access level for linked users: `admin` or `editor`.

### 3.4 Meetings
- **Meeting series** = subject, e.g. "Weekly progress meeting", with a short code (e.g. `WPM`) and default attendees.
- **Meeting** = one occurrence in a series, with **follow-up number** (1, 2, 3 …), date, time, location/link, status `Draft` → `Issued`.
- **Attendees** per meeting with attendance: `Present`, `Excused`, `Absent`, `Distribution only`.
- **Minute items**, each with a type:
  - `Info` – minute only, no follow-up
  - `Action` – creates an action (owner, due date, priority)
  - `Decision` – recorded in the decision log
  - `Risk` – creates a linked entry in the risk register
- Item reference: `<series code>-<meeting no>-<item no>`, e.g. `WPM-03-02`. Stays fixed for life.

### 3.5 Follow-up logic (core feature)
When a new meeting is created in a series:
1. Follow-up number = previous number + 1. Attendees are copied from the previous meeting.
2. Section **"Review of open actions"** lists every action that is not `Done` or `Cancelled`.
3. Per action the user records an **update in this meeting**: comment, new status, new due date (optional).
   Each update is stored in `action_updates` with the `meeting_id`, so it is always clear **in which meeting and on which date** the action was updated or closed.
4. A decision about an earlier action is entered as a `Decision` minute item that references the action (`related_action_id`).
5. When an action is closed, `closed_in_meeting_id` and `closed_on` are stored.
6. Every action has a **timeline**: raised in WPM-03, updated in WPM-04, re-planned in WPM-05, closed in WPM-06.
7. Issued minutes are frozen as they were: the minutes of meeting N show the status of each action **as recorded in meeting N** (taken from `action_updates`), not today's status.

Actions can also be updated outside a meeting (e.g. owner marks done). Those updates have `meeting_id = null` and show as "updated outside meeting" in the next review.

### 3.6 Risks
- Register fields: reference (`R-001`), title, description, cause, consequence, probability (1–5), impact (1–5), score (P×I), owner, mitigation, due date, status (`Open`, `Mitigating`, `Closed`, `Occurred`).
- Created directly in the register, or from a `Risk` minute item (linked both ways).
- Risk updates follow the same pattern as actions (`risk_updates`, with optional `meeting_id`).

### 3.7 Dashboard
- **Actions:** open / overdue / due in next 7 days / closed last 30 days; overdue list per owner; filter by owner, series, priority.
- **Risks:** 5×5 heat map, top 5 by score, count per status.
- **Meetings:** last and next meeting per series, number of open actions per series, draft minutes not yet issued.
- **Decisions:** latest 10 decisions.

---

## 4. Data model (Supabase / Postgres)

```
projects            id, code, name, description, status, created_at
profiles            id (= auth.users.id), full_name, email
project_members     id, project_id, profile_id (nullable), name, email, role, company,
                    access_level (admin|editor|null), is_active
meeting_series      id, project_id, code, subject, default_location, is_active
series_default_attendees   series_id, member_id
meetings            id, project_id, series_id, number, meeting_date, start_time, end_time,
                    location, status (draft|issued), issued_at, issued_by
meeting_attendees   meeting_id, member_id, attendance (present|excused|absent|distribution)
minute_items        id, project_id, meeting_id, item_no, ref, type (info|action|decision|risk),
                    title, body, related_action_id (nullable), created_by, created_at
actions             id, project_id, origin_item_id → minute_items, ref, title, owner_member_id,
                    due_date, priority (high|medium|low), status (open|in_progress|done|cancelled),
                    closed_in_meeting_id (nullable), closed_on (nullable)
action_updates      id, action_id, meeting_id (nullable), comment, status_before, status_after,
                    due_before, due_after, created_by, created_at
risks               id, project_id, ref, title, description, cause, consequence,
                    probability, impact, score (generated), owner_member_id, mitigation,
                    due_date, status, origin_item_id (nullable)
risk_updates        id, risk_id, meeting_id (nullable), comment, status_before, status_after,
                    probability_after, impact_after, created_by, created_at
```

Decisions are `minute_items` with `type = 'decision'`, so there is no separate table. The decision log is a view.

**Views:** `v_open_actions`, `v_action_timeline`, `v_decision_log`, `v_dashboard_counts`.

**Security (RLS):** a user can only read/write rows where `project_id` belongs to a project in which they are a member with an `access_level`. Only `admin` can manage team, series and settings. Issued meetings are read-only, except for admins who can re-open them (logged).

All schema changes are SQL migration files in the repo (`supabase/migrations/`), so the database can be rebuilt from scratch.

---

## 5. Repository structure (proposed)

```
pm-tool/
├── .github/workflows/
│   ├── deploy.yml          build + deploy to GitHub Pages
│   ├── keepalive.yml       ping Supabase (free tier)
│   └── backup.yml          nightly pg_dump to a private location
├── supabase/
│   ├── migrations/         numbered SQL files
│   └── seed.sql            demo project for testing
├── src/
│   ├── lib/supabase.ts     client (URL + anon key from env)
│   ├── pages/              Login, ProjectSelect, Dashboard, Meetings, MeetingDetail,
│   │                       Actions, Decisions, Risks, Team, Settings
│   ├── components/
│   └── types/              generated DB types
├── BUILD_PLAN.md
└── README.md
```

---

## 6. Build phases

Status values: `To Do`, `In Progress`, `Done`.

### Phase 0 – Planning
- [x] Requirements captured
- [x] Stack decided (GitHub Pages + Supabase)
- [x] Open questions Q1–Q7 answered

### Phase 1 – Setup
- [x] Create GitHub repo (Q1/Q2) — `github.com/MEW007/pm-tool`, public, local commits pushed
- [x] Create Supabase project, EU region — `lnnitcjuhzxcjdqfxhpy.supabase.co`, anon key confirmed working (`/auth/v1/settings` → 200)
- [ ] Configure Auth: magic link, sign-up disabled, redirect URL = GitHub Pages URL — deferred to Phase 3 (needs the login page to exist first); sign-up left enabled until then
- [x] Scaffold Vite + React + TypeScript
- [x] GitHub Actions workflows written (`deploy.yml`, `keepalive.yml`, `backup.yml`) — `keepalive.yml` fixed to hit `/auth/v1/settings` (the `/rest/v1/` root now requires the service_role key on current Supabase gateways, confirmed by testing)
- [x] "Hello world" live online and able to read from Supabase — confirmed green, page shows "✅ connected"

### Phase 2 – Database
Written as 4 migration files instead of the original 3 (triggers need the tables
to exist and RLS's helper functions are easiest to read next to the policies
that use them, so they got their own file rather than being folded into 001/003):
- [x] `001_tables.sql` — tables + constraints
- [x] `002_functions_triggers.sql` — refs (`WPM-03-02`, `R-001`), follow-up numbering, auto-create action/risk from minute item, close fields, `auth.users` → `profiles` sync
- [x] `003_rls.sql` — RLS policies + helper functions (`is_project_member/editor/admin`)
- [x] `004_views.sql` — `v_open_actions`, `v_action_timeline`, `v_decision_log`, `v_dashboard_counts`. All 4 declared `with (security_invoker = true)` — see `005` below for why this is load-bearing, not cosmetic.
- [x] `005_views_security_invoker.sql` — patches the 4 views already live on the project (see progress log: this fixes a confirmed live data leak)
- [x] `seed.sql` — demo project, 3 members, a series, 2 meetings, 3 minute items (exercises the triggers)
- [x] Verified against a real local Postgres 16 (installed via `brew install postgresql@16`, left installed for future migration testing — not part of the app, just a dev tool). Stubbed `auth.users`/`auth.uid()` and the `anon`/`authenticated` roles to approximate what Supabase provides, then ran all migrations + seed and checked the results by hand (see progress log for what was tested and the bugs this caught).
- [x] Applied `001`–`005` + seed to the live Supabase project (Ward, via SQL Editor)
- [x] Confirmed live via curl with the anon key: all 4 views now correctly return nothing to an unauthenticated request. **Phase 2 complete.**
- [ ] Test RLS with two users in two projects on the **live** project — the local test covered the policy logic and the view-security fix, but worth a real sanity check with real magic-link logins once Phase 3's login page exists

### Phase 3 – Login and project selection
- [x] Login page (magic link) — `src/pages/Login.tsx`
- [x] Project selector — `src/pages/ProjectSelect.tsx`, lists projects via plain `select * from projects` (RLS does the member-filtering, no explicit WHERE needed)
- [x] Project shell with navigation — `src/pages/ProjectShell.tsx`, left nav per §3.2 (Settings link hidden unless `is_project_admin`); Meetings/Actions/Decisions/Risks/Team/Settings are `ComingSoon` placeholders until their own phase
- [x] Create project (admin) — in `ProjectSelect.tsx`: inserts the project, then bootstraps the creator as its first `admin` member (relies on the `project_has_no_members` RLS fix from Phase 2)
- [x] Switched router from the planned default to `HashRouter`, and Supabase client to `flowType: 'pkce'` — see progress log, this is load-bearing for GitHub Pages + magic-link auth working together, not a style choice
- [x] Magic-link login tested live and working, after setting the Supabase Site URL/Redirect URLs (was still the `localhost:3000` default) — see progress log
- [x] Fixed "create project" (`new row violates row-level security policy for table "projects"`) — see progress log for the full root-cause story. Fix: `ProjectSelect.tsx` now generates the project's `id` client-side (`crypto.randomUUID()`) and inserts without `.select()`, instead of reading the id back via `RETURNING`.
- [x] Confirmed live by Ward: login, create project, and the project shell all work end-to-end. **Phase 3 complete.**
- [ ] Still open, not blocking further phases: drop the leftover `rls_test` diagnostic table (`drop table if exists rls_test;`); the two-user/two-project RLS sanity check; the sign-up-disable decision for `project_members` rows with no linked login yet (§3.3) — see §8

### Phase 4 – Team
- [ ] Team list, add/edit/deactivate member
- [ ] Invite member as user (link login + access level)

### Phase 5 – Meetings and minutes
- [ ] Meeting series management
- [ ] Create meeting (auto number, copy attendees)
- [ ] Attendance editor
- [ ] Minutes editor with item types Info / Action / Decision / Risk
- [ ] Issue minutes (lock)

### Phase 6 – Action follow-up
- [ ] "Review of open actions" section in a follow-up meeting
- [ ] Record update per action (comment, status, due date) linked to the meeting
- [ ] Decision on an existing action
- [ ] Action list page with filters
- [ ] Action timeline (history across meetings)
- [ ] Minutes of meeting N show action status as of meeting N

### Phase 7 – Risks and decisions
- [ ] Risk register (CRUD, score, status)
- [ ] Risk from minute item, linked both ways
- [ ] Risk updates linked to meetings
- [ ] Decision log page

### Phase 8 – Dashboard and output
- [ ] Dashboard: actions, risks (heat map), meetings, decisions
- [ ] Print-friendly minutes view (PDF via browser)
- [ ] Export actions/risks to CSV/Excel

### Phase 9 – Hardening
- [ ] Keep-alive job (free tier)
- [ ] Nightly backup job — `backup.yml` exists but its schedule is **paused** (commented out) because it was failing every night with no `SUPABASE_DB_URL` secret configured, emailing Ward. To finish: add that secret (Supabase Settings → Database → Connection string → the URI one, as a GitHub repo **secret**, not variable), then uncomment the `schedule:` block in `.github/workflows/backup.yml`.
- [ ] Audit: created_by / updated_by on all tables
- [ ] Test with real project data (after Q3)
- [ ] Short user guide in README

---

## 7. Progress log

| Date | Phase | Update |
|------|-------|--------|
| 2026-10-06 | 0 | Requirements and stack decided, build plan created, `.instructions.md` rewritten for the tool |
| 2026-10-06 | 0 | Open questions Q1–Q7 answered: new public repo `pm-tool`, Supabase free tier, Vite+React+TS confirmed, Q3 N/A (private Delaport tool, not a client/employer project) |
| 2026-10-06 | 1 | Local scaffold done in this folder: `git init` (own repo, separate from VSStudio), Vite+React+TS, `@supabase/supabase-js` client (`src/lib/supabase.ts`, reads `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`), minimal Hello World page with a Supabase connection check, `.github/workflows/deploy.yml` + `keepalive.yml` + `backup.yml`. `npm run build` passes. First commit made locally. No `gh`/`supabase` CLI available in this environment — GitHub repo creation and Supabase project creation need to be done by Ward. |
| 2026-10-07 | 1 | Ward created `github.com/MEW007/pm-tool` (public) and a Supabase project (`lnnitcjuhzxcjdqfxhpy.supabase.co`, EU). Pushed local commits to the new remote. Added `.env.local` for local dev (gitignored). Verified the anon key against the live project via curl (`/auth/v1/settings` → 200). Found `/rest/v1/` root now needs the service_role key on current Supabase gateways, not anon — fixed `keepalive.yml` to ping `/auth/v1/settings` instead. |
| 2026-10-07 | 1 | Ward enabled GitHub Pages and added the repo variables. Deploy workflow went green, Hello World confirmed "✅ connected". **Phase 1 complete.** |
| 2026-10-07 | 2 | Wrote `001_tables.sql`, `002_functions_triggers.sql`, `003_rls.sql`, `004_views.sql`, `seed.sql`. Installed Postgres 16 locally (`brew install postgresql@16`) to test before touching the live project: stubbed `auth.users`/`auth.uid()`/`anon`/`authenticated` to approximate Supabase, ran all 4 migrations + seed, then checked results by hand. Caught and fixed 2 real bugs this way: (1) `meeting_attendees`'s combined `for all` RLS policy only had the "issued meeting" gate in `USING`, which Postgres doesn't consult for INSERT — fixed by repeating the gate in `WITH CHECK` too. (2) the `project_members` bootstrap-insert policy ("first member of a new project can self-admin") used a raw `NOT EXISTS` subquery against `project_members`, which is itself RLS-protected — a non-member would see zero rows regardless of whether the project already had members, so **anyone could have added themselves as admin to any existing project**. Fixed with a dedicated `SECURITY DEFINER` helper (`project_has_no_members`) that bypasses RLS for that specific check. Re-tested after each fix: confirmed an outsider is denied joining the existing demo project but can bootstrap a brand new one; confirmed editors are blocked from editing an issued meeting while admins can override; confirmed admin-only series-management and delete policies hold; confirmed the `auth.users` → `profiles` sync trigger, meeting auto-numbering, attendee copy-forward, ref generation (`WPM-01-02`, `R-001`), and the action/risk auto-creation from minute items all produce correct data. |
| 2026-10-08 | 2 | Ward applied `001`–`004` + `seed.sql` to the live project via the SQL Editor (a confusing first pass where 001 needed re-running, then 004 briefly errored "already exists" because an earlier attempt had already succeeded — resolved by a diagnostic query confirming 16 tables/views, 11 functions, 33 policies, all matching expectations exactly). As a live sanity check, queried the project with the anon key via curl and found a real, **live, unauthenticated data leak**: `v_dashboard_counts`, `v_open_actions` and `v_action_timeline` returned real seed data to a request with no login at all (`v_decision_log` only looked safe because it had no rows yet — same bug). Root cause: a Postgres view runs with its **owner's** privileges by default, not the querying user's, so a view created by a privileged migration role silently bypasses RLS on its underlying tables unless declared `security_invoker`. Fixed `004_views.sql` for future from-scratch rebuilds and wrote `005_views_security_invoker.sql` to patch the views that already exist live. Re-ran the full local test (fresh cluster, stub, 001→004, grants, seed) to confirm: anon now gets 0 rows from all 4 views, while a real member (`set app.uid` to a linked profile) still sees their project's data correctly through them. |
| 2026-10-08 | 2 | Ward applied `005` to the live project. Re-verified live via curl with the anon key: all 4 views now correctly return `[]` to an unauthenticated request. **Phase 2 complete.** |
| 2026-10-09 | 3 | Built `Login.tsx` (magic link via `signInWithOtp`), `AuthContext.tsx` (session tracking), `ProjectSelect.tsx` (list + create project), `ProjectContext.tsx` + `ProjectShell.tsx` (per-project nav, admin-gated Settings link), and `ComingSoon.tsx` placeholders for the nav items that belong to later phases. Wired up in `App.tsx` with `react-router-dom`. `npm run build` passes. Caught two real issues through reasoning about the deployment target rather than just compiling: (1) the plan's default `BrowserRouter` would 404 on refresh/deep-link on GitHub Pages, which has no server-side rewrite to `index.html` — switched to `HashRouter`. (2) `HashRouter` and Supabase's default implicit-flow magic link both use the URL **hash fragment**, which would collide (React Router would try to route to the literal token string) — switched the Supabase client to `flowType: 'pkce'`, which delivers the token as a `?code=` query param instead, sidestepping the conflict entirely. No real browser-automation tool was available in this environment (`WebFetch` explicitly doesn't support `localhost`), so verification was: `tsc -b` + `vite build` clean, dev server serves all routes/assets with no console errors in the log, and the redirect/routing logic was checked by reading the code rather than clicking through it. **The actual magic-link email round trip has not been tested against the live deploy.** |
| 2026-10-10/11 | 3 | Ward's magic link redirected to `localhost:3000` — the Supabase project's Site URL/Redirect URLs were still the default placeholder, never updated to the Pages URL, so Supabase ignored the app's `emailRedirectTo` and fell back to the default. Ward fixed it in Supabase Auth → URL Configuration. Login then worked. |
| 2026-10-11/13 | 3 | **Long debugging session**: "create project" failed with `new row violates row-level security policy for table "projects"`. Ruled out, in order, with live evidence each time: the RLS policy itself (confirmed via `pg_policies`: correct, permissive, `with_check=true`, role `authenticated`); table-level grants (confirmed `authenticated` has INSERT via `information_schema.table_privileges`); the client not really being authenticated (confirmed via the Network tab: a real `Bearer` JWT was sent, and Supabase's own `sb-jwt-*` response headers confirmed the gateway validated it with `role: authenticated`); the `authenticator`→`authenticated` role-switch permission (confirmed via `pg_auth_members`); and reproduced the exact failure directly in the SQL Editor via `set role authenticated; insert ...` (ruling out the API/network layer entirely) — even on a **brand-new, minimal test table** (`rls_test`) with nothing but a trivial `with check (true)` policy, on a completely fresh local Postgres 17.11 instance with zero Supabase involved. Isolated the actual trigger empirically: the failure only happens when the INSERT uses `RETURNING` (i.e. `.insert().select()` in supabase-js) — a plain `INSERT` with no `RETURNING` succeeds every time. **Root cause**: Postgres requires a row to also satisfy a `SELECT` RLS policy before it can be handed back via `RETURNING`, not just the `INSERT` policy's `WITH CHECK`. `projects_select` requires project membership (`is_project_member`), and a brand-new project has no `project_members` row yet — that gets inserted in a *second*, later call. So the create-project flow was asking Postgres to return a row the user wasn't yet "visible" enough to see, even though they were unconditionally allowed to insert it. This is genuine, correct (if easy to miss) Postgres RLS behavior, not a bug in Postgres, Supabase, or our RLS policies. **Fix**: `ProjectSelect.tsx` now generates the project's `id` client-side with `crypto.randomUUID()` and inserts without `.select()`, so there's no `RETURNING` to trip over; the id is already known so no read-back is needed. `project_members`'s insert was already written without `.select()`, so it was never affected. Left behind on the live project from this debugging: a throwaway `rls_test` table (no data, no policy worth keeping) — still needs dropping. |
| 2026-10-13 | 3 | Ward confirmed live: sign-in, create project, and the project shell all work end-to-end. **Phase 3 complete.** |

---

## 8. Resume here (next session)

Phase 0–3 are complete and confirmed live. Small cleanup + two decisions still open from Phase 3 (not blocking, but shouldn't be forgotten):

1. Drop the diagnostic leftover on the live project: in the Supabase SQL Editor, `drop table if exists rls_test;`.
2. The two-user/two-project RLS sanity check (create a second real login, confirm each user only sees their own project) — nice to have before real data goes in, not urgent with only Ward using it so far.
3. In Supabase Auth settings: disable sign-up, and decide how magic-link should behave for a `project_members` row with no linked login yet (see BUILD_PLAN §3.3 — needs an actual decision, not just a toggle, since `project_members` rows can exist for people without logins).
4. Keep an eye out for the same `RETURNING`-requires-a-SELECT-policy pattern in later phases — anywhere code does `.insert(...).select()` or `.update(...).select()` on a row the user might not yet have SELECT-visibility into. Same fix shape every time: either don't ask for the row back, or make sure visibility exists first.

Then start **Phase 4 – Team**: team list, add/edit/deactivate member, invite member as a user (link a login + access level).

Note for later, not blocking: local Postgres 16 **and** 17 are now installed on this machine (via Homebrew) purely as dev/test tools — not part of the app, nothing deploys from them. Useful for testing future migrations/RLS changes against the matching major version before they touch the live project (the live project is on PG 17.11).
