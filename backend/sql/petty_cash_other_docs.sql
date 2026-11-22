-- Petty Cash: "Other Docs" attachment section — anything extra that is not a
-- bill, voucher, payment proof or material image.
-- Run in the Supabase SQL editor (dev and prod) before deploying the code.

ALTER TABLE public.petty_cash_entries
  ADD COLUMN IF NOT EXISTS other_docs text[] NOT NULL DEFAULT '{}';

NOTIFY pgrst, 'reload schema';
