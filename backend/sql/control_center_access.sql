-- Control Center access — lets Global Admin hand the Control Center tab to
-- another user (User Management > Edit > "Control Center Access"). Only
-- Global Admin can turn it on or off.
--
-- Run by hand in the Supabase SQL editor, on dev and on prod, BEFORE
-- deploying the matching code. Safe to re-run.

alter table users add column if not exists can_manage_control_center boolean not null default false;
