-- Core tables and constraints. See BUILD_PLAN.md §4 for the data model.

create extension if not exists pgcrypto;

create table projects (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now()
);

-- One row per auth.users row (see 002_functions_triggers.sql for the sync trigger).
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  email text not null
);

create table project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  profile_id uuid references profiles (id) on delete set null,
  name text not null,
  email text,
  role text,
  company text,
  access_level text check (access_level in ('admin', 'editor')),
  is_active boolean not null default true
);

-- A linked login can only back one membership per project.
create unique index project_members_project_profile_key
  on project_members (project_id, profile_id)
  where profile_id is not null;

create table meeting_series (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  code text not null,
  subject text not null,
  default_location text,
  is_active boolean not null default true,
  unique (project_id, code)
);

create table series_default_attendees (
  series_id uuid not null references meeting_series (id) on delete cascade,
  member_id uuid not null references project_members (id) on delete cascade,
  primary key (series_id, member_id)
);

create table meetings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  series_id uuid not null references meeting_series (id) on delete cascade,
  number int not null,
  meeting_date date not null,
  start_time time,
  end_time time,
  location text,
  status text not null default 'draft' check (status in ('draft', 'issued')),
  issued_at timestamptz,
  issued_by uuid references profiles (id),
  unique (series_id, number)
);

create table meeting_attendees (
  meeting_id uuid not null references meetings (id) on delete cascade,
  member_id uuid not null references project_members (id) on delete cascade,
  attendance text not null check (attendance in ('present', 'excused', 'absent', 'distribution')),
  primary key (meeting_id, member_id)
);

-- related_action_id -> actions is added as a deferred FK below, once actions exists.
create table minute_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  meeting_id uuid not null references meetings (id) on delete cascade,
  item_no int not null,
  ref text not null,
  type text not null check (type in ('info', 'action', 'decision', 'risk')),
  title text not null,
  body text,
  related_action_id uuid,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  unique (meeting_id, item_no)
);

create table actions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  origin_item_id uuid not null references minute_items (id) on delete cascade,
  ref text not null,
  title text not null,
  owner_member_id uuid references project_members (id),
  due_date date,
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'done', 'cancelled')),
  closed_in_meeting_id uuid references meetings (id),
  closed_on date,
  created_at timestamptz not null default now()
);

alter table minute_items
  add constraint minute_items_related_action_id_fkey
  foreign key (related_action_id) references actions (id) on delete set null;

create table action_updates (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references actions (id) on delete cascade,
  meeting_id uuid references meetings (id),
  comment text,
  status_before text,
  status_after text not null check (status_after in ('open', 'in_progress', 'done', 'cancelled')),
  due_before date,
  due_after date,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

create table risks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  ref text not null,
  title text not null,
  description text,
  cause text,
  consequence text,
  probability int not null check (probability between 1 and 5),
  impact int not null check (impact between 1 and 5),
  score int generated always as (probability * impact) stored,
  owner_member_id uuid references project_members (id),
  mitigation text,
  due_date date,
  status text not null default 'open' check (status in ('open', 'mitigating', 'closed', 'occurred')),
  origin_item_id uuid references minute_items (id),
  created_at timestamptz not null default now(),
  unique (project_id, ref)
);

create table risk_updates (
  id uuid primary key default gen_random_uuid(),
  risk_id uuid not null references risks (id) on delete cascade,
  meeting_id uuid references meetings (id),
  comment text,
  status_before text,
  status_after text not null check (status_after in ('open', 'mitigating', 'closed', 'occurred')),
  probability_after int check (probability_after between 1 and 5),
  impact_after int check (impact_after between 1 and 5),
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

create index on project_members (project_id);
create index on meeting_series (project_id);
create index on meetings (project_id);
create index on meetings (series_id);
create index on minute_items (project_id);
create index on minute_items (meeting_id);
create index on actions (project_id);
create index on actions (owner_member_id);
create index on action_updates (action_id);
create index on risks (project_id);
create index on risk_updates (risk_id);
