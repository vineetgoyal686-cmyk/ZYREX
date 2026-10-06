-- Petty Cash expense extra charges — delivery, handling, platform fee,
-- discount and the like, on top of the item lines. Stored as a jsonb array
-- of { name, amount }; a discount has a negative amount. When an expense has
-- items, its amount = items total + charges total.
--
-- Run by hand in the Supabase SQL editor, on dev and on prod, BEFORE
-- deploying the matching code. Safe to re-run.

alter table petty_cash_entries add column if not exists charges jsonb not null default '[]'::jsonb;
