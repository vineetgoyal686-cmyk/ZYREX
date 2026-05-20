-- ════════════════════════════════════════════════════════
-- Permissions Migration — New columns + New module keys
-- Run this in Supabase SQL Editor
-- ════════════════════════════════════════════════════════

-- 1. Add new permission columns to permissions table
ALTER TABLE permissions
  ADD COLUMN IF NOT EXISTS can_log         BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_trash       BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_take_action BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_submit      BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_approve     BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_request     BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_withdraw    BOOLEAN DEFAULT FALSE;

-- 2. Add new module entries (skip if already exists)
INSERT INTO modules (module_key, module_name) VALUES
  ('organisation',            'Organisation'),
  ('vendor_pool',             'Vendor Pool'),
  ('item_supply',             'Item - Supply'),
  ('item_sitc',               'Item - SITC'),
  ('inbox_orders',            'Inbox - Orders'),
  ('inbox_intakes',           'Inbox - Intakes'),
  ('inbox_payments',          'Inbox - Payments'),
  ('master_data_vendor',      'Vendor Master'),
  ('master_data_products',    'Products Master'),
  ('master_data_orders_tab',  'Orders Master'),
  ('master_data_intakes',     'Intakes Master'),
  ('master_data_clauses',     'Clauses Master')
ON CONFLICT DO NOTHING;
