-- Settings › Organisation › Departments — Dept IDs per company (Nov 2026).
-- Until now DEPT-xxx was one running number across all companies, given in
-- the order departments were created, so a company's list (sorted by name)
-- showed DEPT-013, DEPT-003, DEPT-008 …
-- Now: unique within a company, and every company's departments are
-- renumbered DEPT-001, DEPT-002 … in name order. New ones take the next
-- number of their company (routes/departments.js). Departments are linked
-- by their id (uuid), never by DEPT-xxx, so renumbering breaks nothing.
--
-- Run by hand in the Supabase SQL editor, on dev and on prod, BEFORE
-- deploying the matching code. Safe to re-run (renumbers again by name).

alter table organisation.departments drop constraint if exists departments_dept_id_key;
create unique index if not exists departments_company_dept_id_key
  on organisation.departments (company_id, dept_id);

-- step aside first so the renumbering never collides with itself
update organisation.departments set dept_id = 'TMP-' || id::text;

with r as (
  select id,
         'DEPT-' || lpad(row_number() over (partition by company_id order by lower(name), created_at)::text, 3, '0') as code
  from organisation.departments
)
update organisation.departments d
set dept_id = r.code
from r
where r.id = d.id;
