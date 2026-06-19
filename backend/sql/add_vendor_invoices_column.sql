-- Add vendor_invoices JSONB column to purchase_orders
-- Each entry: { id, invoice_no, invoice_date, items: [{sno, item, hsn, unit, qty, rate, gst_pct, gst_amount, net_amount}], created_at }

ALTER TABLE procurement.purchase_orders
  ADD COLUMN IF NOT EXISTS vendor_invoices JSONB NOT NULL DEFAULT '[]'::jsonb;
