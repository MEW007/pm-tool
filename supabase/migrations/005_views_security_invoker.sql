-- Fixes a real data leak confirmed live: the 4 views in 004_views.sql were
-- created without security_invoker, so Postgres ran them with the view
-- owner's privileges instead of the querying user's, bypassing every RLS
-- policy on the underlying tables. An anonymous, unauthenticated request
-- could read v_dashboard_counts, v_open_actions and v_action_timeline for
-- any project. 004_views.sql is fixed for future from-scratch rebuilds;
-- this migration patches the views that already exist on the live project.

alter view v_open_actions set (security_invoker = true);
alter view v_action_timeline set (security_invoker = true);
alter view v_decision_log set (security_invoker = true);
alter view v_dashboard_counts set (security_invoker = true);
