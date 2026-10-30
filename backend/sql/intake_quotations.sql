-- Procurement › Intake — Quotations and Comparison (CS).
--
-- After an intake is approved: vendors (only from the Vendor list) send
-- quotations; each one is entered against the intake's items; a
-- comparison picks a vendor per item (an intake can go to several
-- vendors), and goes for approval through Settings › Approval Flow
-- (module "comparison" — approval is required, there is no skip).
-- "Minimum quotations" is a setting (default 2), changeable in
-- Settings › Approval Flow › Comparison.
--
-- Run by hand in the Supabase SQL editor, on dev and on prod, BEFORE
-- deploying the matching code. Safe to re-run.

-- one quotation per vendor per intake
create table if not exists store.intake_quotations (
  id              uuid primary key default gen_random_uuid(),
  intake_id       uuid not null references store.intakes(id) on delete cascade,
  vendor_id       uuid not null references procurement.vendors(id),
  vendor_name     text not null default '',          -- as it was when entered
  quote_ref       text not null default '',          -- vendor's quotation no.
  quote_date      date,
  valid_till      date,
  delivery_days   integer,
  payment_terms   text not null default '',
  freight         numeric(14,2) not null default 0,  -- ₹, incl. GST
  other_charges   numeric(14,2) not null default 0,  -- ₹, incl. GST (loading, packing …)
  remarks         text not null default '',
  -- [{ item_id, rate, gst_pct, discount_pct, make, remarks }] — rate per unit, before GST;
  -- an item the vendor didn't quote is left out
  items           jsonb not null default '[]'::jsonb,
  attachments     jsonb not null default '[]'::jsonb,  -- [{ path, name, size, type }] in "Intake Docs"
  created_by_id   uuid,
  created_by_name text,
  created_at      timestamptz not null default now(),
  updated_by_name text,
  updated_at      timestamptz not null default now(),
  unique (intake_id, vendor_id)
);
create index if not exists intake_quotations_intake_idx on store.intake_quotations (intake_id);

-- the comparison of an intake: which vendor gets each item, and its approval
create table if not exists store.intake_comparisons (
  id               uuid primary key default gen_random_uuid(),
  intake_id        uuid not null unique references store.intakes(id) on delete cascade,
  status           text not null default 'draft' check (status in ('draft', 'pending', 'approved', 'rejected')),
  selections       jsonb not null default '[]'::jsonb,  -- [{ item_id, quotation_id }]
  reason           text not null default '',            -- why not the lowest (L1), when it isn't
  note             text not null default '',
  total            numeric(14,2) not null default 0,    -- chosen total incl. GST + charges
  snapshot         jsonb,                               -- quotations + items as they were when sent for approval
  history          jsonb not null default '[]'::jsonb,  -- [{ action, by, at, note }]
  submitted_by_id  uuid,
  submitted_by_name text,
  submitted_at     timestamptz,
  decided_by_name  text,
  decided_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table store.intake_quotations  enable row level security;  -- backend (service key) only
alter table store.intake_comparisons enable row level security;
grant all on store.intake_quotations  to service_role;
grant all on store.intake_comparisons to service_role;

-- app-wide settings (key → value)
create table if not exists public.app_settings (
  key             text primary key,
  value           jsonb not null,
  updated_by_name text,
  updated_at      timestamptz not null default now()
);
alter table public.app_settings enable row level security;
grant all on public.app_settings to service_role;

insert into public.app_settings (key, value) values ('min_quotations', '2'::jsonb)
on conflict (key) do nothing;
