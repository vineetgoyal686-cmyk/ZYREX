-- Finance › Cheque Register — every cheque the company gives (Issued) or gets
-- (Received), with its status (Pending → Handed Over / Deposited → Cleared,
-- or Bounced / Cancelled / Stopped), a status history, and attachments
-- (cheque photo, receipt …) in the private "cheques" storage bucket.
--
-- Permission module "expenses_cheque_record" already exists; its name
-- becomes "Cheque Register" (was "Cheque Record"). The key stays, so
-- permissions already given keep working.
--
-- Run by hand in the Supabase SQL editor, on dev and on prod, BEFORE
-- deploying the matching code. Safe to re-run.

create table if not exists public.cheque_records (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references organisation.companies(id),
  place_kind       text check (place_kind in ('project', 'office')),  -- optional: which project / office it's for
  place_id         uuid,
  place_code       text not null default '',

  direction        text not null default 'issued' check (direction in ('issued', 'received')),
  cheque_no        text not null,
  cheque_date      date not null,
  amount           numeric(14,2) not null check (amount > 0),
  party_name       text not null,                 -- paid to (issued) / received from (received)
  bank_name        text not null default '',      -- our bank (issued) / drawn on (received)
  account_no       text not null default '',
  cheque_type      text not null default 'account_payee' check (cheque_type in ('account_payee', 'bearer', 'self')),
  purpose          text not null default '',
  reference        text not null default '',      -- bill / PO / invoice no.

  status           text not null default 'Pending'
                   check (status in ('Pending', 'Handed Over', 'Deposited', 'Cleared', 'Bounced', 'Cancelled', 'Stopped')),
  status_date      date,
  handed_to        text not null default '',      -- who took it (issued) / who received it from the party
  bounce_reason    text not null default '',
  remarks          text not null default '',
  status_history   jsonb not null default '[]'::jsonb,  -- [{ status, date, note, by, at }]
  attachments      jsonb not null default '[]'::jsonb,  -- [{ path, name, size, type }]

  created_by_id    uuid,
  created_by_name  text,
  created_at       timestamptz not null default now(),
  updated_by_name  text,
  updated_at       timestamptz not null default now()
);

create index if not exists cheque_records_company_idx on public.cheque_records (company_id, cheque_date desc);
-- one cheque number per bank, per direction, per company
create unique index if not exists cheque_records_unique_no
  on public.cheque_records (company_id, direction, lower(bank_name), cheque_no);

alter table public.cheque_records enable row level security;  -- only the backend (service key) reads it
grant all on public.cheque_records to service_role;

-- private bucket for the attachments
insert into storage.buckets (id, name, public)
values ('cheques', 'cheques', false)
on conflict (id) do nothing;

-- the tab's new name (Access Profiles / User Management, logs)
update modules set module_name = 'Cheque Register' where module_key = 'expenses_cheque_record';
