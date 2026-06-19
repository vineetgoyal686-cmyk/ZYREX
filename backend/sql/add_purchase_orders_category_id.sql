-- ════════════════════════════════════════════════════════════
-- Add category_id to purchase_orders (links to procurement.categories)
-- Run once in Supabase → SQL Editor
-- ════════════════════════════════════════════════════════════

-- 1. Column (nullable — existing orders stay valid)
ALTER TABLE procurement.purchase_orders
  ADD COLUMN IF NOT EXISTS category_id uuid;

-- 2. Foreign key to categories master
ALTER TABLE procurement.purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_category_id_fkey;

ALTER TABLE procurement.purchase_orders
  ADD CONSTRAINT purchase_orders_category_id_fkey
  FOREIGN KEY (category_id)
  REFERENCES procurement.categories (id)
  ON DELETE SET NULL;

-- 3. Index for filters / joins
CREATE INDEX IF NOT EXISTS purchase_orders_category_id_idx
  ON procurement.purchase_orders (category_id);

-- 4. Optional: backfill from snapshot (orders saved before this column existed)
UPDATE procurement.purchase_orders
SET category_id = (snapshot->>'categoryId')::uuid
WHERE category_id IS NULL
  AND snapshot ? 'categoryId'
  AND (snapshot->>'categoryId') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

COMMENT ON COLUMN procurement.purchase_orders.category_id IS 'Procurement category (FK procurement.categories)';
