-- Adds a real "division" column to organisation.employees so an employee can
-- actually be linked to a division (previously the Division dropdown existed
-- in the UI but had nowhere to save to, so it silently got mixed up with the
-- company field instead).
--
-- Stored as free text (matching how department/team/role already work on this
-- table) rather than a foreign key to organisation.divisions.id, since the
-- existing Division dropdown already sends the division's name, not its id.

ALTER TABLE organisation.employees
  ADD COLUMN IF NOT EXISTS division text DEFAULT '';

NOTIFY pgrst, 'reload schema';
