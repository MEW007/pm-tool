# PM Tool – Build Plan

Online project management tool for running projects through meetings, minutes, actions, decisions and risks.

- **Owner:** Ward Mertens
- **Started:** 2026-10-06
- **Status:** Phase 3 – Login and project selection

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
- [ ] Login page (magic link)
- [ ] Project selector
- [ ] Project shell with navigation
- [ ] Create project (admin)

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
- [ ] Nightly backup job
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

---

## 8. Resume here (next session)

Phase 0–2 are all complete and confirmed live (Pages deployed, Supabase schema + RLS + views applied, the view-security leak found and fixed and re-verified live). Next up is **Phase 3 – Login and project selection**:

- [ ] Login page (magic link)
- [ ] Project selector
- [ ] Project shell with navigation
- [ ] Create project (admin)
- [ ] Once the login page exists: disable Supabase sign-up, set the site/redirect URL to the Pages URL, and do the still-open "two users in two projects" RLS sanity check with real logins

Note for later, not blocking: a local Postgres 16 is now installed on this machine (via Homebrew) purely as a dev/test tool — it's not part of the app and nothing deploys from it. Useful for testing future migrations the same way before they touch the live project.
