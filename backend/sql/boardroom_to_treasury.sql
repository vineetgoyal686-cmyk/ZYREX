-- Boardroom is now Treasury everywhere. Renames its tables, permission
-- keys and every stored reference to those keys. No data is copied or lost:
-- tables are renamed in place (their rows, indexes and policies move with
-- them), and saved permissions point at modules by id, which doesn't change.
--
-- Not renamed: the storage bucket "boardroom" (Supabase can't rename a
-- bucket; the code keeps using it).
--
-- Run by hand in the Supabase SQL editor, on dev and on prod, RIGHT WHEN
-- the matching code is deployed — old code needs the old names, new code
-- the new ones, so Treasury is unavailable in between. Safe to re-run.

-- 1. Tables
alter table if exists boardroom_finance_entries         rename to treasury_ledger_entries;
alter table if exists boardroom_finance_saved_values    rename to treasury_ledger_saved_values;
alter table if exists boardroom_finance_coded_values    rename to treasury_ledger_coded_values;
alter table if exists boardroom_finance_custom_columns  rename to treasury_ledger_custom_columns;
alter table if exists boardroom_finance_quick_sites     rename to treasury_ledger_quick_sites;
alter table if exists boardroom_finance_quick_companies rename to treasury_ledger_quick_companies;
alter table if exists boardroom_finance_quick_vendors   rename to treasury_ledger_quick_vendors;

-- 2. Permission keys (module_name too)
update modules set module_key = 'treasury_overview', module_name = 'Treasury Overview' where module_key = 'boardroom_dashboard';
update modules set module_key = 'treasury_ledger',   module_name = 'Party Ledger'      where module_key = 'boardroom_finance';

-- 3. Control Center owners
update module_owners set module_key = 'treasury_overview' where module_key = 'boardroom_dashboard';
update module_owners set module_key = 'treasury_ledger'   where module_key = 'boardroom_finance';

-- 4. Access Profiles keep a copy of each module's key in their JSON
update designations
set app_permissions = replace(replace(app_permissions::text,
      '"boardroom_dashboard"', '"treasury_overview"'),
      '"boardroom_finance"',   '"treasury_ledger"')::jsonb
where app_permissions::text like '%"boardroom_%';

-- 5. Change history (Log panel) of ledger entries
update procurement.audit_logs set entity_type = 'treasury_ledger_entry' where entity_type = 'boardroom_finance_entry';

-- 6. User Analytics screen time: the old Boardroom tab logged as "boardroom"
update screen_time_logs s set module_key = 'treasury_overview'
where s.module_key = 'boardroom'
  and not exists (select 1 from screen_time_logs t
                  where t.user_id = s.user_id and t.activity_date = s.activity_date and t.module_key = 'treasury_overview');
