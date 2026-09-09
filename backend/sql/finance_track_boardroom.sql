-- Boardroom > Finance: a fully separate, executive-only ledger — its own
-- table, its own "boardroom" storage bucket, no foreign keys into the
-- global projects/companies/vendors tables. Any Site/Company/Vendor/Paid To/
-- Purpose value typed here only ever comes back as a suggestion inside this
-- same tab — it never appears in Procurement, Orders, or the plain
-- Master Data > Finance page, and vice versa.
--
-- Run this once by hand in the Supabase SQL editor (this project has no
-- migration runner — see backend .env.local note).

create table if not exists boardroom_finance_entries (
  id                    uuid primary key default gen_random_uuid(),
  entry_type            text not null check (entry_type in ('payment', 'receipt')),
  entry_date            date,
  site_name             text,
  company_name          text,
  party_name            text,
  description           text,
  amount                numeric not null default 0,
  account_no_to         text,
  account_no_from       text,
  account_holder_name   text,
  purpose               text,
  remarks               text,
  custom_field_1        text,
  custom_field_2        text,
  custom_field_3        text,
  custom_field_4        text,
  custom_field_5        text,
  document_urls         text[] not null default '{}',
  created_by_id         uuid,
  created_by_name       text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz,
  deleted_at            timestamptz,
  deleted_by_id         uuid,
  deleted_by_name       text
);

-- Safe to re-run: adds the column if the table was already created before
-- Remarks existed.
alter table boardroom_finance_entries add column if not exists remarks text;

create index if not exists idx_boardroom_finance_entries_type   on boardroom_finance_entries(entry_type);
create index if not exists idx_boardroom_finance_entries_active on boardroom_finance_entries(deleted_at);

-- The 5 optional user-defined columns — always 5 rows, "Add Column" just
-- claims an inactive slot and names it, "Delete Column" clears it back out.
create table if not exists boardroom_finance_custom_columns (
  slot        int primary key check (slot between 1 and 5),
  label       text,
  is_active   boolean not null default false,
  updated_at  timestamptz not null default now()
);
insert into boardroom_finance_custom_columns (slot, is_active)
select s, false from generate_series(1, 5) s
where not exists (select 1 from boardroom_finance_custom_columns where slot = s);

-- Save-and-recall history for the smart fields (Site/Company/Vendor/Paid To/
-- Purpose) — isolated to this tab. field_key is one of:
-- 'site_name' | 'company_name' | 'party_name' | 'account_no_to' | 'purpose'
create table if not exists boardroom_finance_saved_values (
  id          uuid primary key default gen_random_uuid(),
  field_key   text not null,
  value       text not null,
  created_at  timestamptz not null default now(),
  unique (field_key, value)
);

-- Board-member-added sites (via the "+ Add New Site" popup) — isolated to
-- this tab, never written to the real `projects` table.
create table if not exists boardroom_finance_quick_sites (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  code        text,
  state       text,
  address     text,
  created_at  timestamptz not null default now()
);

-- Board-member-added companies (via the "+ Add New Company" popup) —
-- isolated to this tab, never written to the real `companies` table.
create table if not exists boardroom_finance_quick_companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  code        text,
  gstin       text,
  address     text,
  created_at  timestamptz not null default now()
);

-- Board-member-added vendors (via the "+ Add New Vendor" popup) — isolated
-- to this tab, never written to the real `vendors` table.
create table if not exists boardroom_finance_quick_vendors (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  state           text,
  address         text,
  contact_name    text,
  contact_number  text,
  created_at      timestamptz not null default now()
);

-- System-numbered values for Purpose / Paid To / Paid From account numbers —
-- each field_key gets its own independent 1,2,3… sequence (see
-- CODED_FIELD_KEYS in boardroomFinance.js for the PUR-/ACC- prefixes).
create table if not exists boardroom_finance_coded_values (
  id          uuid primary key default gen_random_uuid(),
  field_key   text not null,
  code        int not null,
  value       text not null,
  created_at  timestamptz not null default now(),
  unique (field_key, code)
);

-- Registers the module so it shows up in Settings > Permissions.
insert into modules (module_key, module_name)
select 'boardroom', 'Boardroom'
where not exists (select 1 from modules where module_key = 'boardroom');
