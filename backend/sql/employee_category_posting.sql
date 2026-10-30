-- Everyone in Employees — office staff, site staff, guards, labour, drivers,
-- cooks — so Attendance can take its people from there instead of its own
-- per-project contact lists.
--
--   category          Office Staff / Site Staff / Guard / Labour / Driver / Cook
--                     (what they do; Staff Type stays Permanent / Probation …)
--   posted_kind/_id   where they normally work: a project (public.projects)
--                     or an office (organisation.branches)
--   employed_through  direct = company payroll, agency = through a contractor
--   agency_vendor_id  the agency (procurement.vendors) when employed_through = agency
--
-- Employee ID and email stay optional (guards and many site staff have
-- neither); the system code CON-xxx is what keeps every person unique.
--
-- Then:
--   - Attendance contacts (attendance.staff_contacts / guard_contacts) are
--     copied into Employees — matched by Employee ID, else by name, so no
--     duplicates are made.
--   - Attendance rows get employee_id, matched by name within the project's
--     company. Names still unmatched get a new employee (Site Staff / Guard,
--     posted at that project) — listed in the NOTICE output; check those for
--     spelling twins (e.g. "Abdur Rahman" vs "Abdur Rehman").
--   - Employees with no category yet become Office Staff.
--
-- Run by hand in the Supabase SQL editor, on dev and on prod, BEFORE
-- deploying the matching code. Safe to re-run.

-- 1. New employee fields
alter table organisation.employees add column if not exists category text;
alter table organisation.employees add column if not exists posted_kind text;      -- 'project' | 'office'
alter table organisation.employees add column if not exists posted_id uuid;
alter table organisation.employees add column if not exists employed_through text default 'direct';
alter table organisation.employees add column if not exists agency_vendor_id uuid;
create index if not exists idx_employees_posted on organisation.employees (posted_id);
create index if not exists idx_employees_category on organisation.employees (category);

-- 2. Attendance rows point at the employee
alter table attendance.attendance       add column if not exists employee_id uuid references organisation.employees (id) on delete set null;
alter table attendance.guard_attendance add column if not exists employee_id uuid references organisation.employees (id) on delete set null;
create index if not exists idx_attendance_employee on attendance.attendance (employee_id);
create index if not exists idx_guard_attendance_employee on attendance.guard_attendance (employee_id);

-- 3. Copy contacts, link attendance
do $$
declare
  r record;
  prj record;
  emp_id uuid;
  next_no int;
  made int := 0;
  linked int := 0;
begin
  select coalesce(max(nullif(regexp_replace(contact_code, '\D', '', 'g'), '')::int), 0)
    into next_no from organisation.employees where contact_code like 'CON-%';

  -- 3a. Staff contacts → Site Staff
  for r in select * from attendance.staff_contacts order by created_at loop
    select id, company_id into prj from public.projects
      where lower(regexp_replace(project_code, '[^A-Za-z0-9]', '', 'g')) = lower(regexp_replace(r.project_id, '[^A-Za-z0-9]', '', 'g'))
      limit 1;
    emp_id := null;
    if coalesce(trim(r.emp_id), '') <> '' then
      select id into emp_id from organisation.employees
        where company_id is not distinct from prj.company_id and lower(trim(employee_id)) = lower(trim(r.emp_id)) limit 1;
    end if;
    if emp_id is null then
      select id into emp_id from organisation.employees
        where company_id is not distinct from prj.company_id
          and lower(regexp_replace(trim(person_name), '\s+', ' ', 'g')) = lower(regexp_replace(trim(r.name), '\s+', ' ', 'g'))
        limit 1;
    end if;
    if emp_id is null then
      next_no := next_no + 1;
      insert into organisation.employees (contact_code, person_name, employee_id, email, designation, department,
             reporting_to, contact_number, joining_date, status, category, posted_kind, posted_id, employed_through,
             company_id, created_by_id, created_by_name)
      values ('CON-' || lpad(next_no::text, greatest(3, length(next_no::text)), '0'), trim(r.name), coalesce(r.emp_id, ''),
             coalesce(r.email, ''), coalesce(r.designation, ''), coalesce(r.department, ''), coalesce(r.manager, ''),
             coalesce(r.contact_no, ''), r.joining_date, 'active', 'Site Staff', 'project', prj.id, 'direct',
             prj.company_id, null, 'Attendance contacts');
      made := made + 1;
      raise notice 'New Site Staff from contacts: % (%)', r.name, r.project_id;
    else
      update organisation.employees set
        category       = coalesce(category, 'Site Staff'),
        posted_kind    = coalesce(posted_kind, case when prj.id is not null then 'project' end),
        posted_id      = coalesce(posted_id, prj.id),
        contact_number = coalesce(nullif(contact_number, ''), r.contact_no, ''),
        employee_id    = coalesce(nullif(employee_id, ''), r.emp_id, '')
      where id = emp_id;
    end if;
  end loop;

  -- 3b. Guard contacts → Guard (matched only against guards)
  for r in select * from attendance.guard_contacts order by created_at loop
    select id, company_id into prj from public.projects
      where lower(regexp_replace(project_code, '[^A-Za-z0-9]', '', 'g')) = lower(regexp_replace(r.project_id, '[^A-Za-z0-9]', '', 'g'))
      limit 1;
    select id into emp_id from organisation.employees
      where company_id is not distinct from prj.company_id and category = 'Guard'
        and lower(regexp_replace(trim(person_name), '\s+', ' ', 'g')) = lower(regexp_replace(trim(r.name), '\s+', ' ', 'g'))
      limit 1;
    if emp_id is null then
      next_no := next_no + 1;
      insert into organisation.employees (contact_code, person_name, employee_id, designation, contact_number,
             joining_date, status, category, posted_kind, posted_id, employed_through, company_id, created_by_name)
      values ('CON-' || lpad(next_no::text, greatest(3, length(next_no::text)), '0'), trim(r.name), '',
             coalesce(nullif(r.designation, ''), 'Security Guard'), coalesce(r.contact_no, ''), r.joining_date,
             case when lower(coalesce(r.status, '')) = 'active' then 'active' else 'inactive' end,
             'Guard', 'project', prj.id, 'direct', prj.company_id, 'Attendance contacts');
      made := made + 1;
      raise notice 'New Guard from contacts: % (%)', r.name, r.project_id;
    end if;
  end loop;

  -- 3c. Staff attendance rows → employee (same company, any category but Guard)
  for r in select distinct a.project_id, trim(a.name) as name from attendance.attendance a
           where a.employee_id is null and coalesce(trim(a.name), '') <> '' loop
    select id, company_id into prj from public.projects
      where lower(regexp_replace(project_code, '[^A-Za-z0-9]', '', 'g')) = lower(regexp_replace(r.project_id, '[^A-Za-z0-9]', '', 'g'))
      limit 1;
    select id into emp_id from organisation.employees
      where company_id is not distinct from prj.company_id and coalesce(category, '') <> 'Guard'
        and lower(regexp_replace(trim(person_name), '\s+', ' ', 'g')) = lower(regexp_replace(r.name, '\s+', ' ', 'g'))
      limit 1;
    if emp_id is null then
      next_no := next_no + 1;
      insert into organisation.employees (contact_code, person_name, employee_id, status, category,
             posted_kind, posted_id, employed_through, company_id, created_by_name)
      values ('CON-' || lpad(next_no::text, greatest(3, length(next_no::text)), '0'), r.name, '', 'active', 'Site Staff',
             'project', prj.id, 'direct', prj.company_id, 'Attendance records')
      returning id into emp_id;
      made := made + 1;
      raise notice 'New Site Staff from attendance (check spelling): % (%)', r.name, r.project_id;
    end if;
    update attendance.attendance set employee_id = emp_id
      where employee_id is null and project_id = r.project_id and trim(name) = r.name;
    linked := linked + 1;
  end loop;

  -- 3d. Guard attendance rows → Guard employee
  for r in select distinct a.project_id, trim(a.name) as name from attendance.guard_attendance a
           where a.employee_id is null and coalesce(trim(a.name), '') <> '' loop
    select id, company_id into prj from public.projects
      where lower(regexp_replace(project_code, '[^A-Za-z0-9]', '', 'g')) = lower(regexp_replace(r.project_id, '[^A-Za-z0-9]', '', 'g'))
      limit 1;
    select id into emp_id from organisation.employees
      where company_id is not distinct from prj.company_id and category = 'Guard'
        and lower(regexp_replace(trim(person_name), '\s+', ' ', 'g')) = lower(regexp_replace(r.name, '\s+', ' ', 'g'))
      limit 1;
    if emp_id is null then
      next_no := next_no + 1;
      insert into organisation.employees (contact_code, person_name, employee_id, designation, status, category,
             posted_kind, posted_id, employed_through, company_id, created_by_name)
      values ('CON-' || lpad(next_no::text, greatest(3, length(next_no::text)), '0'), r.name, '', 'Security Guard', 'active', 'Guard',
             'project', prj.id, 'direct', prj.company_id, 'Attendance records')
      returning id into emp_id;
      made := made + 1;
      raise notice 'New Guard from attendance: % (%)', r.name, r.project_id;
    end if;
    update attendance.guard_attendance set employee_id = emp_id
      where employee_id is null and project_id = r.project_id and trim(name) = r.name;
    linked := linked + 1;
  end loop;

  raise notice 'Employees created: %, attendance names linked: %', made, linked;
end $$;

-- 4. Everyone else is office staff until changed
update organisation.employees set category = 'Office Staff' where category is null;
update organisation.employees set employed_through = 'direct' where employed_through is null;
