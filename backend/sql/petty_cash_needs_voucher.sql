-- Petty Cash: "Voucher needed" tick on an expense.
-- Bill Type stays one choice (Tax Invoice / Local Bill / Voucher); this flag
-- marks a Local Bill / Tax Invoice expense that also gets a company voucher.
-- Run in the Supabase SQL editor (dev and prod) before deploying the code.

ALTER TABLE public.petty_cash_entries
  ADD COLUMN IF NOT EXISTS needs_voucher boolean NOT NULL DEFAULT false;

-- Existing rows: Voucher bills and entries that already have a voucher
UPDATE public.petty_cash_entries
   SET needs_voucher = true
 WHERE entry_type = 'expense'
   AND needs_voucher = false
   AND (proof_type = 'voucher' OR coalesce(voucher_data->>'voucherNo', '') <> '');

NOTIFY pgrst, 'reload schema';
