ALTER TABLE procurement.purchase_orders
ADD COLUMN IF NOT EXISTS invoice_audit_log JSONB DEFAULT '[]'::jsonb;
