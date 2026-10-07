-- Row Level Security. See BUILD_PLAN.md §4 "Security (RLS)".
--
-- Helper functions are SECURITY DEFINER so checking membership doesn't recurse
-- into project_members' own RLS policy (which calls these same functions).

create function is_project_member(p_project_id uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (
    select 1 from project_members
    where project_id = p_project_id
      and profile_id = auth.uid()
      and is_active
  );
$$;

create function is_project_editor(p_project_id uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (
    select 1 from project_members
    where project_id = p_project_id
      and profile_id = auth.uid()
      and is_active
      and access_level in ('admin', 'editor')
  );
$$;

-- Used only by the project_members bootstrap insert policy below. It must be
-- SECURITY DEFINER too: a plain subquery against project_members inside that
-- policy would itself be filtered by project_members' own SELECT policy, so
-- a non-member would always see "zero existing rows" and could insert
-- themselves as admin into *any* project, not just a brand new one.
create function project_has_no_members(p_project_id uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select not exists (select 1 from project_members where project_id = p_project_id);
$$;

create function is_project_admin(p_project_id uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (
    select 1 from project_members
    where project_id = p_project_id
      and profile_id = auth.uid()
      and is_active
      and access_level = 'admin'
  );
$$;

alter table profiles enable row level security;
alter table projects enable row level security;
alter table project_members enable row level security;
alter table meeting_series enable row level security;
alter table series_default_attendees enable row level security;
alter table meetings enable row level security;
alter table meeting_attendees enable row level security;
alter table minute_items enable row level security;
alter table actions enable row level security;
alter table action_updates enable row level security;
alter table risks enable row level security;
alter table risk_updates enable row level security;

-- profiles: names/emails are visible to any logged-in user (needed to show
-- "created_by" etc.); a user can only edit their own row.
create policy profiles_select on profiles
  for select to authenticated using (true);
create policy profiles_update_own on profiles
  for update to authenticated using (id = auth.uid());

-- projects: visible to members; any logged-in user may create one (they must
-- then add themselves as its first admin member, see project_members below);
-- only admins may change or archive it.
create policy projects_select on projects
  for select to authenticated using (is_project_member(id));
create policy projects_insert on projects
  for insert to authenticated with check (true);
create policy projects_update on projects
  for update to authenticated using (is_project_admin(id));

-- project_members: visible to fellow members. Inserts are either an admin
-- adding someone, or a user adding themselves as the very first (admin)
-- member right after creating the project.
create policy project_members_select on project_members
  for select to authenticated using (is_project_member(project_id));
create policy project_members_insert on project_members
  for insert to authenticated with check (
    is_project_admin(project_id)
    or (
      profile_id = auth.uid()
      and access_level = 'admin'
      and project_has_no_members(project_id)
    )
  );
create policy project_members_update on project_members
  for update to authenticated using (is_project_admin(project_id));
create policy project_members_delete on project_members
  for delete to authenticated using (is_project_admin(project_id));

-- meeting_series: only admins manage series; all members can see them.
create policy meeting_series_select on meeting_series
  for select to authenticated using (is_project_member(project_id));
create policy meeting_series_write on meeting_series
  for all to authenticated using (is_project_admin(project_id)) with check (is_project_admin(project_id));

create policy series_default_attendees_select on series_default_attendees
  for select to authenticated using (
    is_project_member((select project_id from meeting_series where id = series_id))
  );
create policy series_default_attendees_write on series_default_attendees
  for all to authenticated using (
    is_project_admin((select project_id from meeting_series where id = series_id))
  ) with check (
    is_project_admin((select project_id from meeting_series where id = series_id))
  );

-- meetings: editors create/update while a meeting is still draft; once issued,
-- only an admin can touch it again (a logged re-open is a future feature).
create policy meetings_select on meetings
  for select to authenticated using (is_project_member(project_id));
create policy meetings_insert on meetings
  for insert to authenticated with check (is_project_editor(project_id));
create policy meetings_update on meetings
  for update to authenticated
  using (is_project_editor(project_id) and (status = 'draft' or is_project_admin(project_id)))
  with check (is_project_editor(project_id));
create policy meetings_delete on meetings
  for delete to authenticated using (is_project_admin(project_id));

create policy meeting_attendees_select on meeting_attendees
  for select to authenticated using (
    is_project_member((select project_id from meetings where id = meeting_id))
  );
-- Note: for INSERT, Postgres only evaluates WITH CHECK (not USING), so the
-- draft-or-admin gate has to be repeated there too, not just in USING.
create policy meeting_attendees_write on meeting_attendees
  for all to authenticated using (
    is_project_editor((select project_id from meetings where id = meeting_id))
    and (
      (select status from meetings where id = meeting_id) = 'draft'
      or is_project_admin((select project_id from meetings where id = meeting_id))
    )
  ) with check (
    is_project_editor((select project_id from meetings where id = meeting_id))
    and (
      (select status from meetings where id = meeting_id) = 'draft'
      or is_project_admin((select project_id from meetings where id = meeting_id))
    )
  );

-- minute_items: can only be added/edited while the parent meeting is draft
-- (or by an admin, who may have re-opened it).
create policy minute_items_select on minute_items
  for select to authenticated using (is_project_member(project_id));
create policy minute_items_insert on minute_items
  for insert to authenticated with check (
    is_project_editor(project_id)
    and (
      (select status from meetings where id = meeting_id) = 'draft'
      or is_project_admin(project_id)
    )
  );
create policy minute_items_update on minute_items
  for update to authenticated
  using (
    is_project_editor(project_id)
    and (
      (select status from meetings where id = meeting_id) = 'draft'
      or is_project_admin(project_id)
    )
  )
  with check (is_project_editor(project_id));
create policy minute_items_delete on minute_items
  for delete to authenticated using (is_project_admin(project_id));

-- actions / risks: created only by the trigger in 002_functions_triggers.sql
-- (no insert policy here, so direct client inserts are denied). Editors can
-- edit fields like title/owner/priority directly; status and due date are
-- normally changed through *_updates below. Only admins delete.
create policy actions_select on actions
  for select to authenticated using (is_project_member(project_id));
create policy actions_update on actions
  for update to authenticated using (is_project_editor(project_id)) with check (is_project_editor(project_id));
create policy actions_delete on actions
  for delete to authenticated using (is_project_admin(project_id));

-- action_updates: append-only audit trail -- no update/delete policies.
create policy action_updates_select on action_updates
  for select to authenticated using (
    is_project_member((select project_id from actions where id = action_id))
  );
create policy action_updates_insert on action_updates
  for insert to authenticated with check (
    is_project_editor((select project_id from actions where id = action_id))
  );

create policy risks_select on risks
  for select to authenticated using (is_project_member(project_id));
create policy risks_update on risks
  for update to authenticated using (is_project_editor(project_id)) with check (is_project_editor(project_id));
create policy risks_delete on risks
  for delete to authenticated using (is_project_admin(project_id));

-- risk_updates: append-only audit trail -- no update/delete policies.
create policy risk_updates_select on risk_updates
  for select to authenticated using (
    is_project_member((select project_id from risks where id = risk_id))
  );
create policy risk_updates_insert on risk_updates
  for insert to authenticated with check (
    is_project_editor((select project_id from risks where id = risk_id))
  );
