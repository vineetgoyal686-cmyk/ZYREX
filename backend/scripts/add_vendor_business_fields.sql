-- ════════════════════════════════════════════════════════════
-- Add business_description, firm_type, partner_type to procurement.vendors
-- Run this once in Supabase SQL editor
-- ════════════════════════════════════════════════════════════

ALTER TABLE procurement.vendors
  ADD COLUMN IF NOT EXISTS business_description text DEFAULT ''::text,
  ADD COLUMN IF NOT EXISTS firm_type text DEFAULT ''::text,
  ADD COLUMN IF NOT EXISTS partner_type text DEFAULT ''::text;
