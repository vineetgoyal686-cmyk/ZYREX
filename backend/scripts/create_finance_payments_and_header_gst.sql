-- Finance module — Payments Track: simplified Add Bill + real payment tracking
-- Nothing needs to be dropped — this is purely additive on top of the two
-- scripts already run (create_finance_bills.sql, create_finance_bill_items.sql).
-- Run by hand in the Supabase SQL editor.

-- Header-level GST fields — used when a bill is entered in "Simple" mode
-- (no item-wise breakup). has_items marks whether the item grid was used,
-- so the UI/reports know which of the two the bill's numbers came from.
ALTER TABLE public.finance_bills
  ADD COLUMN IF NOT EXISTS has_items       boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS taxable_amount  numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gst_type        text DEFAULT 'intra',   -- 'intra' (CGST+SGST) or 'inter' (IGST)
  ADD COLUMN IF NOT EXISTS igst_pct        numeric(5,2)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igst_amount     numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cgst_pct        numeric(5,2)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cgst_amount     numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst_pct        numeric(5,2)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst_amount     numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gst_amount      numeric(14,2) DEFAULT 0;

-- Real payment tracking — a bill can be paid in multiple parts (advance,
-- balance, etc). "Paid" and "Outstanding" are derived from this, not typed in.
CREATE TABLE IF NOT EXISTS public.finance_bill_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    bill_id uuid NOT NULL REFERENCES public.finance_bills(id) ON DELETE CASCADE,
    amount numeric(14,2) NOT NULL DEFAULT 0,
    payment_date date,
    payment_mode text DEFAULT ''::text,     -- Bank Transfer / UPI / Cheque / Cash
    reference_no text DEFAULT ''::text,     -- UTR / cheque no.
    remarks text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    created_by_id uuid,
    created_by_name text
);

CREATE INDEX IF NOT EXISTS finance_bill_payments_bill_id_idx ON public.finance_bill_payments (bill_id);
