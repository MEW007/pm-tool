-- Read views backing the Dashboard, Actions and Decisions pages (BUILD_PLAN.md §3.7).
--
-- security_invoker = true is required on every one of these: by default a
-- Postgres view runs with the privileges of its OWNER (the role that ran
-- this migration), not the querying user, which silently bypasses the RLS
-- policies from 003_rls.sql on every underlying table. Without this, any
-- anon/authenticated caller can read every project's data through the view
-- regardless of membership -- confirmed and fixed live, see BUILD_PLAN.md
-- progress log.

create view v_open_actions
with (security_invoker = true)
as
select
  a.*,
  m.name as owner_name,
  (a.due_date is not null and a.due_date < current_date) as is_overdue,
  (a.due_date is not null and a.due_date between current_date and current_date + 7) as due_soon
from actions a
left join project_members m on m.id = a.owner_member_id
where a.status not in ('done', 'cancelled');

-- One row per event in an action's life: the meeting it was raised in, plus
-- every later action_update. Issued minutes read this view filtered to their
-- own meeting_id to show the status "as of" that meeting, never today's status.
create view v_action_timeline
with (security_invoker = true)
as
select
  a.id as action_id,
  mi.meeting_id,
  ms.code as series_code,
  m.number as meeting_number,
  m.meeting_date,
  'raised' as event_type,
  null::text as comment,
  null::text as status_before,
  'open' as status_after,
  null::date as due_before,
  a.due_date as due_after,
  mi.created_by,
  mi.created_at
from actions a
join minute_items mi on mi.id = a.origin_item_id
join meetings m on m.id = mi.meeting_id
join meeting_series ms on ms.id = m.series_id

union all

select
  au.action_id,
  au.meeting_id,
  ms.code,
  m.number,
  m.meeting_date,
  'update',
  au.comment,
  au.status_before,
  au.status_after,
  au.due_before,
  au.due_after,
  au.created_by,
  au.created_at
from action_updates au
left join meetings m on m.id = au.meeting_id
left join meeting_series ms on ms.id = m.series_id

order by action_id, created_at;

create view v_decision_log
with (security_invoker = true)
as
select
  mi.id as minute_item_id,
  mi.project_id,
  mi.ref,
  mi.title,
  mi.body,
  mi.related_action_id,
  ms.code as series_code,
  m.number as meeting_number,
  m.meeting_date,
  mi.created_by,
  mi.created_at
from minute_items mi
join meetings m on m.id = mi.meeting_id
join meeting_series ms on ms.id = m.series_id
where mi.type = 'decision'
order by mi.created_at desc;

create view v_dashboard_counts
with (security_invoker = true)
as
select
  p.id as project_id,
  (select count(*) from actions a where a.project_id = p.id and a.status not in ('done', 'cancelled')) as actions_open,
  (select count(*) from actions a where a.project_id = p.id and a.status not in ('done', 'cancelled') and a.due_date < current_date) as actions_overdue,
  (select count(*) from actions a where a.project_id = p.id and a.status not in ('done', 'cancelled') and a.due_date between current_date and current_date + 7) as actions_due_soon,
  (select count(*) from actions a where a.project_id = p.id and a.status in ('done', 'cancelled') and a.closed_on >= current_date - 30) as actions_closed_last_30d,
  (select count(*) from risks r where r.project_id = p.id and r.status = 'open') as risks_open,
  (select count(*) from risks r where r.project_id = p.id and r.status = 'mitigating') as risks_mitigating,
  (select count(*) from risks r where r.project_id = p.id and r.status = 'occurred') as risks_occurred,
  (select count(*) from meetings m where m.project_id = p.id and m.status = 'draft') as meetings_draft
from projects p;
