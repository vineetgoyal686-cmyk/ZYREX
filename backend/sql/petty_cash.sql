-- Expenses > Petty Cash: one ledger of expenses, money received from
-- Accounts, and person-to-person hand-overs. The Staff tab shows who holds
-- how much; the Accounts tab only ever sees totals (received vs. expense)
-- and the accounts-format Excel export.
--
-- Run this once by hand in the Supabase SQL editor, on dev and on prod
-- (this project has no migration runner — see backend .env.local note).
-- Safe to re-run.

-- People who hold / spend petty cash. Either a login user (user_id set) or
-- a plain name for someone with no login.
create table if not exists petty_cash_people (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  user_id     uuid,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create unique index if not exists idx_petty_cash_people_name on petty_cash_people (lower(name));

-- entry_type:
--   expense  — person_id spent `amount` (counts as Expense for Accounts)
--   received — person_id got `amount` from Accounts (counts as Received)
--   transfer — from_person_id handed `amount` to person_id (internal only)
create table if not exists petty_cash_entries (
  id               uuid primary key default gen_random_uuid(),
  entry_type       text not null check (entry_type in ('expense', 'received', 'transfer')),
  entry_date       date not null,
  amount           numeric not null check (amount > 0),
  person_id        uuid not null references petty_cash_people (id),
  from_person_id   uuid references petty_cash_people (id),
  particular       text not null default '',
  category         text not null default '',
  proof_type       text not null default '',   -- tax_invoice | local_bill | voucher
  payment_mode     text not null default '',   -- cash | online | credit_card
  project          text not null default '',
  location         text not null default '',
  remarks          text not null default '',
  document_urls    text[] not null default '{}',
  created_by_id    uuid,
  created_by_name  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz,
  deleted_at       timestamptz,
  deleted_by_id    uuid,
  deleted_by_name  text
);
create index if not exists idx_petty_cash_entries_date   on petty_cash_entries (entry_date);
create index if not exists idx_petty_cash_entries_active on petty_cash_entries (deleted_at);

-- Locations typed on an expense are remembered here so they come back as
-- dropdown options next time.
create table if not exists petty_cash_locations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);
create unique index if not exists idx_petty_cash_locations_name on petty_cash_locations (lower(name));

-- Private bucket for bill / voucher attachments.
insert into storage.buckets (id, name, public)
values ('petty_cash', 'petty_cash', false)
on conflict (id) do nothing;

-- Petty Cash is split into two separately-permissioned tabs (Staff /
-- Accounts), replacing the single expenses_petty_cash module.
select setval(pg_get_serial_sequence('modules', 'id'), (select max(id) from modules));

insert into modules (module_key, module_name)
select 'petty_cash_staff', 'Petty Cash — Staff'
where not exists (select 1 from modules where module_key = 'petty_cash_staff');

insert into modules (module_key, module_name)
select 'petty_cash_accounts', 'Petty Cash — Accounts'
where not exists (select 1 from modules where module_key = 'petty_cash_accounts');

update modules set is_active = false where module_key = 'expenses_petty_cash';
