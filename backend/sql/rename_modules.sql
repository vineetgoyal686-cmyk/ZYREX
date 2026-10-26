-- Tab names shown in the app, kept in step with the new sidebar.
-- Only module_name (the display name) changes; module_key stays the same,
-- so every saved permission (per-user, Access Profiles, Control Center)
-- keeps working untouched.
--
-- Run by hand in the Supabase SQL editor, on dev and on prod. Safe to re-run.

-- "Global Dashboard" → "Dashboard"
update modules set module_name = 'Dashboard' where module_key = 'global_dashboard';

-- "Historical Data" → "Archive" (records from before Zyhawk)
update modules set module_name = 'Archive' where module_key = 'historical_data';

-- Treasury (was Boardroom) — keys are renamed in boardroom_to_treasury.sql
update modules set module_name = 'Treasury Overview' where module_key = 'treasury_overview';
update modules set module_name = 'Party Ledger'      where module_key = 'treasury_ledger';
