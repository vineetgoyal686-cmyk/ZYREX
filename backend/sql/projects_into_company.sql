-- Projects live inside a company (Settings › Organisation › Company › Projects).
--
-- Until now there were two project lists:
--   public.projects            — the main list (Orders, Intake, Attendance …)
--   organisation.org_projects  — a per-company list that only Petty Cash used
-- This keeps the main list, gives each project a company, moves the
-- per-company projects into it and removes organisation.org_projects.
-- Petty Cash entries are re-pointed to the same project in the main list,
-- so no entry loses its project.
--
-- Run by hand in the Supabase SQL editor, on dev and on prod, BEFORE
-- deploying the matching code. Safe to re-run.

-- 1. Every project can belong to one company
alter table public.projects
  add column if not exists company_id uuid references organisation.companies (id) on delete set null;
create index if not exists idx_projects_company on public.projects (company_id);

-- 2. Petty Cash points at the main list
alter table petty_cash_entries add column if not exists project_id uuid references public.projects (id);
create index if not exists idx_petty_cash_entries_project_id on petty_cash_entries (project_id);

-- 3. Move organisation.org_projects into public.projects (only while it exists)
do $$
declare
  op record;
  pid uuid;
begin
  if to_regclass('organisation.org_projects') is null then return; end if;

  for op in execute 'select * from organisation.org_projects' loop
    -- same project already in the main list? (same code, or same name)
    select id into pid from public.projects p
    where  (p.company_id is null or p.company_id = op.company_id)
      and  ((op.project_code <> '' and lower(p.project_code) = lower(op.project_code))
            or lower(p.project_name) = lower(op.project_name))
    order  by (p.company_id = op.company_id) desc nulls last, p.created_at
    limit  1;

    if pid is null then
      insert into public.projects (project_name, project_code, city, state, address, is_active, company_id, created_by_name)
      values (op.project_name, op.project_code, op.city, op.state, op.address, op.status <> 'completed', op.company_id, 'Moved from company projects')
      returning id into pid;
    else
      update public.projects set company_id = op.company_id where id = pid and company_id is null;
    end if;

    execute 'update petty_cash_entries set project_id = $1 where org_project_id = $2 and project_id is null'
      using pid, op.id;
  end loop;
end $$;

-- 4. Remove the old per-company list
alter table petty_cash_entries drop column if exists org_project_id;
drop table if exists organisation.org_projects;

-- its permission module (Organisation › Projects); Project Management stays
update designations d
set    app_permissions = coalesce((
         select jsonb_agg(x) from jsonb_array_elements(d.app_permissions) x
         where  coalesce(x->>'module_key', '') <> 'org_projects'
           and  coalesce(x->>'module_id', '') not in (select id::text from modules where module_key = 'org_projects')
       ), '[]'::jsonb)
where  jsonb_typeof(d.app_permissions) = 'array'
  and  exists (select 1 from modules where module_key = 'org_projects');
delete from permissions      where module_id in (select id from modules where module_key = 'org_projects');
delete from module_owners    where module_key = 'org_projects';
delete from request_handlers where module_key = 'org_projects';
delete from screen_time_logs where module_key = 'org_projects';
delete from modules          where module_key = 'org_projects';
