-- Control Center — tab owners. A module (tab / sub-tab) with at least one
-- row here is "controlled": only its owners (and Global Admin) can grant,
-- change or remove its permissions, and no role gets it automatically —
-- super_admin/admin need it granted by an owner like anyone else. Owners
-- themselves get full access to it. Modules with no rows work as before.
--
-- Run by hand in the Supabase SQL editor, on dev and on prod, BEFORE
-- deploying the matching code. Safe to re-run.

create table if not exists module_owners (
  module_key  text        not null,
  user_id     uuid        not null references users(id) on delete cascade,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  primary key (module_key, user_id)
);

create index if not exists module_owners_user_idx on module_owners (user_id);
