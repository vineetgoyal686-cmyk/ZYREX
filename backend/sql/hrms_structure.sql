-- HRMS structure (Oct 2026):
--   • Divisions are gone completely — companies already play that part.
--     Drops organisation.divisions, departments.division_id and
--     employees.division.
--   • "Hierarchy" (division → department tree) is gone with it — the
--     permission module "structure" is removed.
--   Departments, Teams, Grades and Designations now live under
--   Settings › Organisation (their permission modules stay the same).
--   • Employees get user_id — the app login (public.users) that person
--     uses. Linked by matching email for everyone it fits; the rest are
--     linked from the employee form (Work › App login).
--
-- Run by hand in the Supabase SQL editor, on dev and on prod, BEFORE
-- deploying the matching code. Safe to re-run.

alter table organisation.departments drop column if exists division_id;
alter table organisation.employees   drop column if exists division;
drop table if exists organisation.divisions cascade;

-- the "divisions" and "structure" permission modules
update designations d
set app_permissions = coalesce((
  select jsonb_agg(e)
  from jsonb_array_elements(d.app_permissions) e
  where coalesce(e->>'module_key', '') not in ('divisions', 'structure')
    and coalesce(e->>'module_id', '') not in (select id::text from modules where module_key in ('divisions', 'structure'))
), '[]'::jsonb)
where jsonb_typeof(d.app_permissions) = 'array';

delete from permissions      where module_id in (select id from modules where module_key in ('divisions', 'structure'));
delete from module_owners    where module_key in ('divisions', 'structure');
delete from request_handlers where module_key in ('divisions', 'structure');
delete from screen_time_logs where module_key in ('divisions', 'structure');
delete from modules          where module_key in ('divisions', 'structure');

-- ── employee ↔ app login ──
alter table organisation.employees add column if not exists user_id uuid references public.users(id) on delete set null;
create unique index if not exists employees_user_id_key on organisation.employees (user_id) where user_id is not null;

-- link by email where exactly one employee has that user's email
update organisation.employees e
set user_id = u.id
from public.users u
where e.user_id is null
  and nullif(trim(e.email), '') is not null
  and lower(trim(e.email)) = lower(trim(u.email))
  and not exists (select 1 from organisation.employees x where x.user_id = u.id)
  and (select count(*) from organisation.employees y where lower(trim(y.email)) = lower(trim(u.email))) = 1;
