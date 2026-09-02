-- Master Data → Finance → Track: general payment/receipt ledger with bank
-- account details. Run this once by hand in the Supabase SQL editor
-- (this project has no migration runner — see backend .env.local note).

create table if not exists finance_track_entries (
  id                    uuid primary key default gen_random_uuid(),
  entry_type            text not null check (entry_type in ('payment', 'receipt')),
  entry_date            date,
  site_id               uuid,
  site_name             text,
  company_id            uuid,
  company_name          text,
  party_name            text,          -- Vendor Name (payment) / Received From (receipt)
  description           text,          -- Expense Info (payment) / Received For (receipt)
  amount                numeric not null default 0,
  account_no_to         text,          -- Paid To Account No (payment) / Received In Account No (receipt)
  account_no_from       text,          -- Paid From Account No (payment) / Received From Account No (receipt)
  account_holder_name   text,
  remarks               text,
  document_urls         text[] not null default '{}',
  created_by_id         uuid,
  created_by_name       text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz,
  deleted_at            timestamptz,
  deleted_by_id         uuid,
  deleted_by_name       text
);

create index if not exists idx_finance_track_entries_type   on finance_track_entries(entry_type);
create index if not exists idx_finance_track_entries_site   on finance_track_entries(site_id);
create index if not exists idx_finance_track_entries_active on finance_track_entries(deleted_at);

-- Registers the module so it shows up in Settings > Permissions (Master Data group).
insert into modules (module_key, module_name)
select 'master_data_finance', 'Finance Master'
where not exists (select 1 from modules where module_key = 'master_data_finance');
