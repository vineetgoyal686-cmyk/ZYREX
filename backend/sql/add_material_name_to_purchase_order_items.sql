-- Add material_name column to purchase_order_items
-- Required for bulk-imported orders that don't have an item_id FK

ALTER TABLE procurement.purchase_order_items
  ADD COLUMN IF NOT EXISTS material_name text;
