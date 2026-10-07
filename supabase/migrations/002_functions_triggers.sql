-- Functions and triggers implementing the follow-up logic in BUILD_PLAN.md §3.5
-- and §6 (refs, numbering, auto-created actions/risks).
--
-- These run as SECURITY DEFINER so they can read sibling tables (meeting_series,
-- meetings, actions, risks) regardless of the calling user's row-level SELECT
-- policies -- the trigger logic is trusted, it isn't a way around RLS on writes.

-- 1. Keep profiles in sync with auth.users.
create function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into profiles (id, full_name, email)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- 2. Meetings: auto-number within the series, copy attendees from the previous meeting.
create function meetings_set_number()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.number is null then
    select coalesce(max(number), 0) + 1 into new.number
    from meetings
    where series_id = new.series_id;
  end if;
  return new;
end;
$$;

create trigger meetings_before_insert
  before insert on meetings
  for each row execute function meetings_set_number();

create function meetings_copy_attendees()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  previous_meeting_id uuid;
begin
  select id into previous_meeting_id
  from meetings
  where series_id = new.series_id
    and number < new.number
  order by number desc
  limit 1;

  if previous_meeting_id is not null then
    insert into meeting_attendees (meeting_id, member_id, attendance)
    select new.id, member_id, 'present'
    from meeting_attendees
    where meeting_id = previous_meeting_id
    on conflict do nothing;
  else
    insert into meeting_attendees (meeting_id, member_id, attendance)
    select new.id, member_id, 'present'
    from series_default_attendees
    where series_id = new.series_id
    on conflict do nothing;
  end if;

  return new;
end;
$$;

create trigger meetings_after_insert
  after insert on meetings
  for each row execute function meetings_copy_attendees();

-- 3. Minute items: auto-number within the meeting, build the fixed ref, and
--    auto-create the linked action/risk row for 'action'/'risk' items.
create function minute_items_set_ref()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  series_code text;
  meeting_number int;
begin
  if new.item_no is null then
    select coalesce(max(item_no), 0) + 1 into new.item_no
    from minute_items
    where meeting_id = new.meeting_id;
  end if;

  -- Derive project_id from the meeting rather than trusting the client's
  -- value: the RLS policies on this table check project_id directly, so a
  -- mismatched value would let a write ride on the wrong project's access.
  select ms.code, m.number, m.project_id into series_code, meeting_number, new.project_id
  from meetings m
  join meeting_series ms on ms.id = m.series_id
  where m.id = new.meeting_id;

  new.ref := series_code || '-' || lpad(meeting_number::text, 2, '0')
    || '-' || lpad(new.item_no::text, 2, '0');

  return new;
end;
$$;

create trigger minute_items_before_insert
  before insert on minute_items
  for each row execute function minute_items_set_ref();

create function minute_items_create_linked_rows()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  next_risk_no int;
begin
  if new.type = 'action' then
    insert into actions (project_id, origin_item_id, ref, title)
    values (new.project_id, new.id, new.ref, new.title);

  elsif new.type = 'risk' then
    select coalesce(max(substring(ref from 3)::int), 0) + 1 into next_risk_no
    from risks
    where project_id = new.project_id;

    insert into risks (project_id, ref, title, probability, impact, origin_item_id)
    values (
      new.project_id,
      'R-' || lpad(next_risk_no::text, 3, '0'),
      new.title,
      1, 1, -- placeholder probability/impact; the risk is refined on the register page
      new.id
    );
  end if;

  return new;
end;
$$;

create trigger minute_items_after_insert
  after insert on minute_items
  for each row execute function minute_items_create_linked_rows();

-- 4. Action updates: the single place that moves an action's status/due date and
--    stamps closed_in_meeting_id / closed_on, so issued minutes stay a frozen
--    snapshot (they read action_updates, not actions, for historical status).
create function action_updates_apply()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update actions
  set
    status = new.status_after,
    due_date = coalesce(new.due_after, due_date),
    closed_in_meeting_id = case
      when new.status_after in ('done', 'cancelled') then new.meeting_id
      else null
    end,
    closed_on = case
      when new.status_after in ('done', 'cancelled') then current_date
      else null
    end
  where id = new.action_id;

  return new;
end;
$$;

create trigger action_updates_after_insert
  after insert on action_updates
  for each row execute function action_updates_apply();

-- 5. Risk updates: same pattern for the risk register.
create function risk_updates_apply()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update risks
  set
    status = new.status_after,
    probability = coalesce(new.probability_after, probability),
    impact = coalesce(new.impact_after, impact)
  where id = new.risk_id;

  return new;
end;
$$;

create trigger risk_updates_after_insert
  after insert on risk_updates
  for each row execute function risk_updates_apply();
