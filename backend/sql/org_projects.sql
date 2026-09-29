-- Organisation > Projects: each organisation (company) keeps its own list of
-- projects with basic details. Separate from the global Project Management
-- list (public.projects). Petty Cash is scoped by organisation + project.
--
-- Run by hand in the Supabase SQL editor, on dev and on prod, BEFORE
-- deploying the matching code. Safe to re-run.

create table if not exists organisation.org_projects (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references organisation.companies (id) on delete cascade,
  project_code  text not null default '',
  project_name  text not null,
  client_name   text not null default '',
  city          text not null default '',
  state         text not null default '',
  address       text not null default '',
  start_date    date,
  end_date      date,
  status        text not null default 'active' check (status in ('active', 'on_hold', 'completed')),
  remarks       text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz
);
create index if not exists org_projects_company_id_idx on organisation.org_projects (company_id);
create unique index if not exists org_projects_company_name_idx on organisation.org_projects (company_id, lower(project_name));

grant all on organisation.org_projects to service_role;

-- Permission module (Settings > Permissions > Organisation > Projects).
select setval(pg_get_serial_sequence('modules', 'id'), (select max(id) from modules));

insert into modules (module_key, module_name)
select 'org_projects', 'Projects'
where not exists (select 1 from modules where module_key = 'org_projects');
