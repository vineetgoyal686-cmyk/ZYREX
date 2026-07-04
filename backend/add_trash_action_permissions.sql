-- Add granular Trash-tab permission columns (View / Log / Restore / Delete)
-- Run this in Supabase SQL Editor: https://app.supabase.com → SQL Editor

ALTER TABLE permissions
  ADD COLUMN IF NOT EXISTS can_trash_view    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_trash_log     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_trash_restore boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_trash_delete  boolean NOT NULL DEFAULT false;
