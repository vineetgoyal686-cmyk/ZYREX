-- Add missing columns to permissions table
-- Run this in Supabase SQL Editor: https://app.supabase.com → SQL Editor

ALTER TABLE permissions
  ADD COLUMN IF NOT EXISTS can_approve           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_submit            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_request           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_withdraw          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_recall            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_cancel            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_reject            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_revert            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_issue             boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_amend      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_trash             boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_log               boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_download_document boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_bulk_upload       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_export            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_take_action       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS order_overview_aging  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS order_intake          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS order_payment         boolean NOT NULL DEFAULT false;
