-- Global Dashboard → Order sub-permissions (designation + user permissions)
-- Run in Supabase SQL Editor if these columns are not already present.

ALTER TABLE permissions
  ADD COLUMN IF NOT EXISTS order_overview_aging BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS order_intake         BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS order_payment        BOOLEAN DEFAULT FALSE;
