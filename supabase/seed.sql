-- Demo project for testing. Safe to run on the live project: it creates no
-- auth.users rows, only a project with free-text team members (no linked
-- login), so it can't be used to sign in as anyone.
--
-- Also doubles as a smoke test for the triggers in 002_functions_triggers.sql:
-- inserting the minute items below should auto-create one action and one
-- risk, auto-number the meeting and items, and build their refs.

insert into projects (id, code, name, description)
values ('00000000-0000-0000-0000-000000000001', 'DEMO', 'Demo Project', 'Seed data for local testing')
on conflict (code) do nothing;

insert into project_members (id, project_id, name, email, role, company, access_level)
values
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'Alex Admin', 'alex@example.com', 'Project Manager', 'Delaport', 'admin'),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'Eve Editor', 'eve@example.com', 'Site Lead', 'Delaport', 'editor'),
  ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000001', 'Chris Contractor', 'chris@example.com', 'Electrical Lead', 'Contractor Co', null)
on conflict (id) do nothing;

insert into meeting_series (id, project_id, code, subject, default_location)
values ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000001', 'WPM', 'Weekly progress meeting', 'Site office')
on conflict (project_id, code) do nothing;

insert into series_default_attendees (series_id, member_id)
values
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000011'),
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000012'),
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000013')
on conflict do nothing;

-- Meeting 1: number is auto-assigned (1), attendees copied from the series defaults.
insert into meetings (id, project_id, series_id, meeting_date, status)
values ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000021', current_date - 7, 'issued')
on conflict do nothing;

-- Minute items: item_no and ref are auto-assigned; the 'action' and 'risk'
-- items each auto-create a linked row in actions / risks.
insert into minute_items (project_id, meeting_id, type, title, body)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000031', 'info', 'Kickoff', 'Project kicked off on site.'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000031', 'action', 'Order site cabin', 'Chris to order the site cabin.'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000031', 'risk', 'Permit delay', 'Building permit may be delayed past the planned start.')
on conflict do nothing;

-- Meeting 2: auto-numbered (2), attendees copied from meeting 1.
insert into meetings (id, project_id, series_id, meeting_date, status)
values ('00000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000021', current_date, 'draft')
on conflict do nothing;

-- Review the "Order site cabin" action in meeting 2: update it via
-- action_updates (never by writing to actions directly) so the change is
-- traceable to this meeting.
insert into action_updates (action_id, meeting_id, comment, status_before, status_after, due_after)
select a.id, '00000000-0000-0000-0000-000000000032', 'Ordered, awaiting delivery date', 'open', 'in_progress', current_date + 14
from actions a
where a.title = 'Order site cabin';
