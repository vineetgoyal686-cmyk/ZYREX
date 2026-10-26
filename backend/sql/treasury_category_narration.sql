-- Treasury › Party Ledger: "Purpose" is now called Category and "Expense
-- Detail / Description" is now called Narration — everywhere, the database
-- included.
--
--   treasury_ledger_entries.purpose      → category
--   treasury_ledger_entries.description  → narration
--   treasury_ledger_coded_values.field_key 'purpose' → 'category'
--
-- Only names change; every value stays exactly as it is.
--
-- Run by hand in the Supabase SQL editor, on dev and on prod, together with
-- deploying the matching code (the old code reads the old names). On prod run
-- it after boardroom_to_treasury.sql. Safe to re-run.

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'treasury_ledger_entries' and column_name = 'purpose') then
    alter table treasury_ledger_entries rename column purpose to category;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'treasury_ledger_entries' and column_name = 'description') then
    alter table treasury_ledger_entries rename column description to narration;
  end if;
end $$;

update treasury_ledger_coded_values set field_key = 'category' where field_key = 'purpose';
