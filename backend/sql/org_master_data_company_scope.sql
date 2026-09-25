-- Separate Organisation master data per company.
-- Divisions, departments, teams, grades, designations, branches and employees
-- were global, so every organisation showed the same rows. This adds
-- company_id to each table and assigns existing rows to a company.
--
-- Run once in the Supabase SQL editor BEFORE deploying the backend change.
-- Safe to re-run.

begin;

-- 1. Add company_id + index to each table
do $$
declare t text;
begin
  foreach t in array array['divisions','departments','teams','grades','designations','branches','employees'] loop
    execute format(
      'alter table organisation.%I add column if not exists company_id uuid
         references organisation.companies(id) on delete cascade', t);
    execute format(
      'create index if not exists %I on organisation.%I (company_id)', t || '_company_id_idx', t);
  end loop;
end $$;

-- 2. Employees: match their existing free-text `company` to a company name / code
update organisation.employees e
set    company_id = c.id
from   organisation.companies c
where  e.company_id is null
  and  coalesce(trim(e.company), '') <> ''
  and  (lower(trim(e.company)) = lower(trim(c.company_name))
     or lower(trim(e.company)) = lower(trim(c.company_code)));

-- 3. Everything still unassigned goes to ONE default company.
--    Change 'BITL' to the right company_code if needed.
do $$
declare
  default_company uuid;
  t text;
begin
  select id into default_company from organisation.companies where company_code = 'BITL' limit 1;
  if default_company is null then
    raise exception 'Default company not found - edit the company_code in step 3';
  end if;
  foreach t in array array['divisions','departments','teams','grades','designations','branches','employees'] loop
    execute format('update organisation.%I set company_id = $1 where company_id is null', t)
      using default_company;
  end loop;
end $$;

commit;

-- Check: rows per company per table
-- select 'employees' t, company_id, count(*) from organisation.employees group by 2
-- union all select 'divisions', company_id, count(*) from organisation.divisions group by 2
-- union all select 'departments', company_id, count(*) from organisation.departments group by 2;
