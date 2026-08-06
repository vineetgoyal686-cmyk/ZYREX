-- ════════════════════════════════════════════════════════════
-- Add business_description, firm_type, partner_type to procurement.vendor_pool
-- Run this once in Supabase SQL editor
-- ════════════════════════════════════════════════════════════

ALTER TABLE procurement.vendor_pool
  ADD COLUMN IF NOT EXISTS business_description text,
  ADD COLUMN IF NOT EXISTS firm_type text,
  ADD COLUMN IF NOT EXISTS partner_type text;
