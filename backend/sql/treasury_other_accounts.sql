-- Treasury › Masters › Other Accounts: bank accounts that belong to no
-- company — a director's personal account, a site imprest account… Money can
-- be paid from (or received into) these, whichever company the entry is for.
--
-- They live in the same treasury_bank_accounts table with owner_type 'other'
-- and no owner; `label` says whose account it is.
-- Nothing existing changes.
--
-- Run by hand in the Supabase SQL editor, on dev and on prod (after
-- treasury_masters.sql), before deploying the matching code. Safe to re-run.

alter table treasury_bank_accounts drop constraint if exists treasury_bank_accounts_owner_type_check;
alter table treasury_bank_accounts add constraint treasury_bank_accounts_owner_type_check
  check (owner_type in ('party', 'company', 'other'));
alter table treasury_bank_accounts alter column owner_id drop not null;

alter table treasury_bank_accounts add column if not exists label text not null default '';  -- whose account, e.g. "Rajesh Kumar (Director)"

-- one row per account number among the other accounts
create unique index if not exists treasury_bank_accounts_other_uq
  on treasury_bank_accounts (btrim(account_number)) where owner_type = 'other';
