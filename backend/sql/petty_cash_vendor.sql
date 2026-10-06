-- Petty Cash expense vendor — the shop / supplier the money was paid to.
-- Optional free text, only used on expense entries.
--
-- Run by hand in the Supabase SQL editor, on dev and on prod, BEFORE
-- deploying the matching code. Safe to re-run.

alter table petty_cash_entries add column if not exists vendor_name text not null default '';
