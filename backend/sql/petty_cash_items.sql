-- Petty Cash expense line items — optional per-item detail (name, qty,
-- unit, rate, amount) behind an expense's total. Stored as a jsonb array
-- on the entry; when present, the items add up to the entry's amount.
--
-- Run by hand in the Supabase SQL editor, on dev and on prod, BEFORE
-- deploying the matching code. Safe to re-run.

alter table petty_cash_entries add column if not exists items jsonb not null default '[]'::jsonb;
