-- Employees: Staff Type — Permanent / Probation / Temporary / Support / Resigned.
-- Existing employees are left blank; fill them in from the Employee form.
--
-- Run by hand in the Supabase SQL editor, on dev and on prod, BEFORE
-- deploying the matching code. Safe to re-run.

alter table organisation.employees add column if not exists staff_type text;
