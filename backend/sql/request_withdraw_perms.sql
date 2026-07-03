-- Order → Request/Withdraw fine-grained sub-permissions (per-user overrides)
-- Run in Supabase SQL Editor if these columns are not already present.
-- Access profiles (designations.app_permissions) already store these as free-form
-- JSON, but per-user rows in `permissions` need real columns to persist them.

ALTER TABLE permissions
  ADD COLUMN IF NOT EXISTS can_request_recall     BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_request_amend      BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_request_cancel     BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_withdraw_recall    BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_withdraw_amend     BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_withdraw_cancel    BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_withdraw_submission BOOLEAN DEFAULT FALSE;
