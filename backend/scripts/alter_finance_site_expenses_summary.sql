-- Site Expenses — move GST/discount/charges off the item table and into an
-- Order-style summary box (Subtotal → Discount → Charges → GST → Grand Total),
-- with a "Add Columns / Settings" panel controlling each mode. Mirrors the
-- Create Order page's totals settings, generalized to 4 named charge types
-- instead of just Freight.

ALTER TABLE public.finance_site_expenses
  ADD COLUMN IF NOT EXISTS subtotal              numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_mode          text DEFAULT 'none',   -- 'none' | 'total'
  ADD COLUMN IF NOT EXISTS discount_pct           numeric(5,2)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount        numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS labour_charge_enabled      boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS labour_charge              numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS freight_charge_enabled     boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS freight_charge             numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transport_charge_enabled   boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS transport_charge           numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS installation_charge_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS installation_charge         numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS charges_before_gst     boolean DEFAULT true,  -- are the 4 charges above part of the GST-taxable base?
  ADD COLUMN IF NOT EXISTS gst_mode               text DEFAULT 'none',   -- 'none' | 'total'
  ADD COLUMN IF NOT EXISTS gst_pct                numeric(5,2)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gst_amount             numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taxable_amount         numeric(14,2) DEFAULT 0;
-- gst_type ('intra'/'inter') already exists — reused as-is to decide
-- whether gst_pct becomes IGST or a CGST+SGST split.
