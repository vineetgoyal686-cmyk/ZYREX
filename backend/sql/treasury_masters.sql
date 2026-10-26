-- Treasury › Masters. Treasury keeps its OWN lists of parties, our companies
-- and projects — separate from the ERP's vendors / companies / projects, so
-- management's data never mixes with procurement's. Things can be copied in
-- from the ERP ("Import from ERP"), but after that the two are independent.
--
--   treasury_parties        — who we pay / who pays us (+ opening balance)
--   treasury_companies      — our own companies
--   treasury_projects       — projects an entry belongs to
--   treasury_bank_accounts  — any number of bank accounts per party / company,
--                             one marked primary; closed ones are made
--                             inactive, never deleted
--
-- Entries (treasury_ledger_entries) keep storing names as text, exactly as
-- before, plus the IFSC of both accounts used — a snapshot, so editing a
-- master later never changes an old entry.
--
-- This file also fills the new lists from what already exists (the old
-- quick-add lists and the names used on entries). Nothing existing is
-- changed or deleted.
--
-- Run by hand in the Supabase SQL editor, on dev and on prod, BEFORE
-- deploying the matching code. Safe to re-run.

create table if not exists treasury_parties (
  id               uuid primary key default gen_random_uuid(),
  name             text        not null,
  -- not shown in the app (every party is entered as a firm); kept for later reports
  party_type       text        not null default 'Vendor' check (party_type in ('Vendor','Client','Bank','Person','Other')),
  mobile           text        not null default '',
  email            text        not null default '',
  pan              text        not null default '',
  gstin            text        not null default '',
  address          text        not null default '',
  -- same sign as the ledger balance (received − paid):
  -- positive = Payable (we have to pay them), negative = Receivable (they have to pay us)
  opening_balance  numeric     not null default 0,
  notes            text        not null default '',
  source           text        not null default '',   -- e.g. 'erp-vendor:<id>' when imported
  is_active        boolean     not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index if not exists treasury_parties_name_uq on treasury_parties (lower(btrim(name)));
-- added after the first version of this file — kept as ALTERs so re-running is safe
alter table treasury_parties add column if not exists contact_person text not null default '';
alter table treasury_parties add column if not exists city           text not null default '';
alter table treasury_parties add column if not exists state          text not null default '';
-- the first version put a quick-add vendor's contact name into notes as
-- "Contact: <name>" — move it to contact_person
update treasury_parties
   set contact_person = btrim(substring(notes from '^Contact: (.*)$')), notes = ''
 where contact_person = '' and notes ~ '^Contact: .+$';

create table if not exists treasury_companies (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null,
  code        text        not null default '',
  gstin       text        not null default '',
  address     text        not null default '',
  source      text        not null default '',
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists treasury_companies_name_uq on treasury_companies (lower(btrim(name)));
alter table treasury_companies add column if not exists pan text not null default '';

create table if not exists treasury_projects (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null,
  code        text        not null default '',
  city        text        not null default '',
  state       text        not null default '',
  address     text        not null default '',
  source      text        not null default '',
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists treasury_projects_name_uq on treasury_projects (lower(btrim(name)));

create table if not exists treasury_bank_accounts (
  id              uuid primary key default gen_random_uuid(),
  owner_type      text        not null check (owner_type in ('party','company')),
  owner_id        uuid        not null,
  bank_name       text        not null default '',
  account_number  text        not null,
  ifsc            text        not null default '',
  holder_name     text        not null default '',
  branch          text        not null default '',
  is_primary      boolean     not null default false,
  is_active       boolean     not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists treasury_bank_accounts_owner_idx on treasury_bank_accounts (owner_type, owner_id);
create unique index if not exists treasury_bank_accounts_uq on treasury_bank_accounts (owner_type, owner_id, btrim(account_number));

-- IFSC of the two accounts used on an entry (snapshot, like the numbers)
alter table treasury_ledger_entries add column if not exists ifsc_to   text not null default '';
alter table treasury_ledger_entries add column if not exists ifsc_from text not null default '';

-- ── Starter lists from what already exists ──────────────────────────────
-- Parties: the old quick-add vendors, then every party name used on entries
insert into treasury_parties (name, address, state, mobile, contact_person)
select distinct on (lower(btrim(v.name))) btrim(v.name), coalesce(v.address, ''), coalesce(v.state, ''),
       coalesce(v.contact_number, ''), coalesce(v.contact_name, '')
from treasury_ledger_quick_vendors v
where btrim(coalesce(v.name, '')) <> ''
  and not exists (select 1 from treasury_parties p where lower(btrim(p.name)) = lower(btrim(v.name)))
order by lower(btrim(v.name)), v.created_at;

insert into treasury_parties (name)
select distinct on (lower(btrim(e.party_name))) btrim(e.party_name)
from treasury_ledger_entries e
where e.deleted_at is null and btrim(coalesce(e.party_name, '')) <> ''
  and not exists (select 1 from treasury_parties p where lower(btrim(p.name)) = lower(btrim(e.party_name)))
order by lower(btrim(e.party_name)), e.created_at;

-- Our companies: old quick-add companies, then names used on entries
insert into treasury_companies (name, code, gstin, address)
select distinct on (lower(btrim(c.name))) btrim(c.name), coalesce(c.code, ''), coalesce(c.gstin, ''), coalesce(c.address, '')
from treasury_ledger_quick_companies c
where btrim(coalesce(c.name, '')) <> ''
  and not exists (select 1 from treasury_companies t where lower(btrim(t.name)) = lower(btrim(c.name)))
order by lower(btrim(c.name)), c.created_at;

insert into treasury_companies (name)
select distinct on (lower(btrim(e.company_name))) btrim(e.company_name)
from treasury_ledger_entries e
where e.deleted_at is null and btrim(coalesce(e.company_name, '')) <> ''
  and not exists (select 1 from treasury_companies t where lower(btrim(t.name)) = lower(btrim(e.company_name)))
order by lower(btrim(e.company_name)), e.created_at;

-- Projects: old quick-add sites, then names used on entries
insert into treasury_projects (name, code, state, address)
select distinct on (lower(btrim(s.name))) btrim(s.name), coalesce(s.code, ''), coalesce(s.state, ''), coalesce(s.address, '')
from treasury_ledger_quick_sites s
where btrim(coalesce(s.name, '')) <> ''
  and not exists (select 1 from treasury_projects t where lower(btrim(t.name)) = lower(btrim(s.name)))
order by lower(btrim(s.name)), s.created_at;

insert into treasury_projects (name)
select distinct on (lower(btrim(e.site_name))) btrim(e.site_name)
from treasury_ledger_entries e
where e.deleted_at is null and btrim(coalesce(e.site_name, '')) <> ''
  and not exists (select 1 from treasury_projects t where lower(btrim(t.name)) = lower(btrim(e.site_name)))
order by lower(btrim(e.site_name)), e.created_at;

-- Bank accounts already used on entries. Paid: money left OUR account
-- (account_no_from) and went to THEIR account (account_no_to); Received is the
-- other way round. The holder name on received entries is the party's.
insert into treasury_bank_accounts (owner_type, owner_id, account_number, holder_name)
select distinct on (p.id, btrim(x.acc)) 'party', p.id, btrim(x.acc), x.holder
from (
  select party_name, account_no_to   as acc, '' as holder, created_at from treasury_ledger_entries
   where deleted_at is null and entry_type = 'payment' and payment_mode <> 'cash'
  union all
  select party_name, account_no_from as acc, coalesce(account_holder_name, '') as holder, created_at from treasury_ledger_entries
   where deleted_at is null and entry_type = 'receipt' and payment_mode <> 'cash'
) x
join treasury_parties p on lower(btrim(p.name)) = lower(btrim(x.party_name))
where btrim(coalesce(x.acc, '')) <> ''
  and not exists (select 1 from treasury_bank_accounts b where b.owner_type = 'party' and b.owner_id = p.id and btrim(b.account_number) = btrim(x.acc))
order by p.id, btrim(x.acc), x.created_at;

insert into treasury_bank_accounts (owner_type, owner_id, account_number)
select distinct on (c.id, btrim(x.acc)) 'company', c.id, btrim(x.acc)
from (
  select company_name, account_no_from as acc, created_at from treasury_ledger_entries
   where deleted_at is null and entry_type = 'payment' and payment_mode <> 'cash'
  union all
  select company_name, account_no_to   as acc, created_at from treasury_ledger_entries
   where deleted_at is null and entry_type = 'receipt' and payment_mode <> 'cash'
) x
join treasury_companies c on lower(btrim(c.name)) = lower(btrim(x.company_name))
where btrim(coalesce(x.acc, '')) <> ''
  and not exists (select 1 from treasury_bank_accounts b where b.owner_type = 'company' and b.owner_id = c.id and btrim(b.account_number) = btrim(x.acc))
order by c.id, btrim(x.acc), x.created_at;

-- Every owner with accounts gets one primary (its oldest), unless it has one
update treasury_bank_accounts b set is_primary = true
where b.id in (
  select distinct on (owner_type, owner_id) id from treasury_bank_accounts
  where is_active order by owner_type, owner_id, created_at
)
and not exists (
  select 1 from treasury_bank_accounts o
  where o.owner_type = b.owner_type and o.owner_id = b.owner_id and o.is_primary
);
