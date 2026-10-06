# PM Tool – Build Plan

Online project management tool for running projects through meetings, minutes, actions, decisions and risks.

- **Owner:** Ward Mertens
- **Started:** 2026-10-06
- **Status:** Phase 0 – Planning

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
- [ ] Create GitHub repo (Q1/Q2)
- [ ] Create Supabase project, EU region
- [ ] Configure Auth: magic link, sign-up disabled, redirect URL = GitHub Pages URL
- [ ] Scaffold Vite + React + TypeScript
- [ ] GitHub Actions deploy to Pages, Supabase URL and anon key as repo secrets/vars
- [ ] "Hello world" live online and able to read from Supabase

### Phase 2 – Database
- [ ] Migration 001: tables + constraints
- [ ] Migration 002: RLS policies
- [ ] Migration 003: views
- [ ] Triggers: refs (`WPM-03-02`, `R-001`), follow-up numbering, auto-create action/risk from minute item, close fields
- [ ] Seed demo project
- [ ] Test RLS with two users in two projects

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

---

## 8. Resume here (next session)

Phase 0 is complete. Start **Phase 1 – Setup**:
1. Create GitHub repo `pm-tool` (public)
2. Create Supabase project, EU region
3. Configure Auth: magic link, sign-up disabled
4. Scaffold Vite + React + TypeScript
5. GitHub Actions deploy to Pages, Supabase URL/anon key as repo secrets
6. "Hello world" live online and able to read from Supabase
