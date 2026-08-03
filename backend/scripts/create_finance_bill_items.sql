-- Finance module — Payments Track: v2 refinements
-- Safe to run even though create_finance_bills.sql / the first version of this
-- file already ran — no real bills exist yet, this is still the build phase.
-- Run by hand in the Supabase SQL editor.

ALTER TABLE public.finance_bills
  ADD COLUMN IF NOT EXISTS bill_status text DEFAULT 'Pending',
  ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'Unpaid',
  ADD COLUMN IF NOT EXISTS company_id uuid;

-- One shared item grid for every bill (simple bills just use one row) — no
-- more separate "Simple mode" header GST fields, so the six IGST/CGST/SGST
-- columns and cartage/labour/freight only ever live at the item level.
CREATE TABLE IF NOT EXISTS public.finance_bill_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    bill_id uuid NOT NULL REFERENCES public.finance_bills(id) ON DELETE CASCADE,
    item_date date,
    in_no text DEFAULT ''::text,
    dc_no text DEFAULT ''::text,
    category text DEFAULT ''::text,
    item_type text DEFAULT 'goods',          -- 'goods' (HSN) or 'service' (SAC)
    item_name text DEFAULT ''::text,
    hsn_code text DEFAULT ''::text,          -- holds HSN or SAC, per item_type
    unit text DEFAULT ''::text,
    qty numeric(14,3) DEFAULT 0,
    basic_rate numeric(14,2) DEFAULT 0,
    amount numeric(14,2) DEFAULT 0,          -- qty * basic_rate
    other_charges numeric(14,2) DEFAULT 0,   -- cartage + labour + freight, combined
    total_amount numeric(14,2) DEFAULT 0,    -- amount + other_charges (taxable value)
    igst_pct numeric(5,2) DEFAULT 0,
    igst_amount numeric(14,2) DEFAULT 0,
    cgst_pct numeric(5,2) DEFAULT 0,
    cgst_amount numeric(14,2) DEFAULT 0,
    sgst_pct numeric(5,2) DEFAULT 0,
    sgst_amount numeric(14,2) DEFAULT 0,
    gst_amount numeric(14,2) DEFAULT 0,
    net_amount numeric(14,2) DEFAULT 0,
    remarks text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);
-- Drop the old two-stage charge columns if this table already exists from the
-- earlier version of this script.
ALTER TABLE public.finance_bill_items
  DROP COLUMN IF EXISTS cartage,
  DROP COLUMN IF EXISTS labour_charge,
  DROP COLUMN IF EXISTS freight,
  DROP COLUMN IF EXISTS total_a,
  DROP COLUMN IF EXISTS total_f,
  ADD COLUMN IF NOT EXISTS other_charges numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_amount  numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS item_type     text DEFAULT 'goods';

CREATE INDEX IF NOT EXISTS finance_bill_items_bill_id_idx ON public.finance_bill_items (bill_id);

-- Real payment tracking — a bill can be paid in multiple parts (advance,
-- balance, etc). "Paid" and "Outstanding" are derived from this, not typed in.
CREATE TABLE IF NOT EXISTS public.finance_bill_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    bill_id uuid NOT NULL REFERENCES public.finance_bills(id) ON DELETE CASCADE,
    amount numeric(14,2) NOT NULL DEFAULT 0,
    payment_date date,
    payment_mode text DEFAULT ''::text,     -- Bank Transfer / UPI / Cheque / Cash
    reference_no text DEFAULT ''::text,     -- UTR / cheque no.
    document_url text DEFAULT ''::text,     -- proof of payment (cheque photo, UPI screenshot, receipt)
    remarks text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    created_by_id uuid,
    created_by_name text
);
ALTER TABLE public.finance_bill_payments
  ADD COLUMN IF NOT EXISTS document_url text DEFAULT ''::text;

CREATE INDEX IF NOT EXISTS finance_bill_payments_bill_id_idx ON public.finance_bill_payments (bill_id);
