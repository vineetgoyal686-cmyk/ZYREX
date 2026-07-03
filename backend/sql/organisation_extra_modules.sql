-- Adds the three Organisation tabs that never had their own permission module:
-- Structure, Org Chart, SOP (currently always-visible, ungated). Also gives
-- Export + Bulk Upload columns to the Organisation Master Data / People modules
-- that already have those buttons in the UI but no permission controlling them.
-- Run in Supabase SQL Editor if these modules are not already present.

INSERT INTO modules (module_key, module_name) VALUES
  ('structure', 'Organisation - Structure'),
  ('org_chart', 'Organisation - Org Chart'),
  ('sop',       'Organisation - SOP')
ON CONFLICT DO NOTHING;

-- can_export / can_bulk_upload columns already exist on `permissions` (used by
-- vendor_list, category_list, etc.) — no schema change needed, just enabling
-- them in the Settings UI for these module keys (done in application code).
