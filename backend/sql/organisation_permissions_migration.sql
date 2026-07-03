-- ════════════════════════════════════════════════════════
-- Organisation Permissions Migration — New module keys
-- Run this in Supabase SQL Editor
-- ════════════════════════════════════════════════════════

INSERT INTO modules (module_key, module_name) VALUES
  ('departments',   'Departments'),
  ('teams',         'Teams'),
  ('divisions',     'Divisions'),
  ('grades',        'Grades'),
  ('designations',  'Designations'),
  ('employees',     'Employees'),
  ('locations',     'Locations'),
  ('policy',        'Policy')
ON CONFLICT DO NOTHING;
