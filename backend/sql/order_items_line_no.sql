-- Keep order items in the order they were entered.
-- Without this, item rows come back from the DB in arbitrary order, so
-- chapters/points jump up and down on the order view and PDF.

ALTER TABLE procurement.purchase_order_items
  ADD COLUMN IF NOT EXISTS line_no integer;

-- Backfill existing orders using physical row order (closest to original entry order).
UPDATE procurement.purchase_order_items poi
SET line_no = x.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY ctid) AS rn
  FROM procurement.purchase_order_items
) x
WHERE poi.id = x.id AND poi.line_no IS NULL;

CREATE INDEX IF NOT EXISTS purchase_order_items_order_line_idx
  ON procurement.purchase_order_items (order_id, line_no);
