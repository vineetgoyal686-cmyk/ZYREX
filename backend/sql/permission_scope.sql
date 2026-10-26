-- Per-tab project access: next to a tab's permissions, which projects it
-- covers — e.g. Orders for B47 + NLV, Intake for B47 only.
--
--   permissions.scope (per user)                 and
--   designations.app_permissions[].scope (Access Profile, same jsonb entries)
-- hold  {"all": true}  or  {"projects": ["<project id>", …]}.
-- NULL = not set yet: the tab keeps the old rule (Project Access list;
-- empty list = every project), so nobody's access changes until it is set.
--
-- Run by hand in the Supabase SQL editor, on dev and on prod, BEFORE
-- deploying the matching code. Safe to re-run.

alter table permissions add column if not exists scope jsonb;
