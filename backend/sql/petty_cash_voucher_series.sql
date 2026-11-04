-- Petty Cash › Expense voucher numbers per project / office and financial
-- year: <PREFIX>-<FY>-VH-<seq>, e.g. BVPL-WAV-2026-27-VH-001.
--
-- * voucher_fy / voucher_seq on each entry hold the number; the next number
--   is the highest seq used in that project / office and FY, plus one, so a
--   cancelled voucher never uses one up. The FY comes from the entry date
--   (April–March).
-- * petty_cash_voucher_series keeps each project's / office's prefix and
--   digit count (default: company code + project / office code, 3 digits).
-- * Old vouchers (BVPL-VH-<n>, from the per-entity counter) keep their
--   number until their month is renumbered from Voucher Numbering.
--
-- Run by hand in the Supabase SQL editor, on dev and on prod, BEFORE
-- deploying the matching code. Safe to re-run.

alter table public.petty_cash_entries
  add column if not exists voucher_fy  text,
  add column if not exists voucher_seq integer;

-- One number per project / office and FY among live entries.
create unique index if not exists petty_cash_entries_voucher_seq_uq
  on public.petty_cash_entries (coalesce(project_id, branch_id), voucher_fy, voucher_seq)
  where deleted_at is null and voucher_seq is not null;

create table if not exists public.petty_cash_voucher_series (
  scope_id        uuid primary key,            -- public.projects.id or organisation.branches.id
  company_id      uuid not null references organisation.companies(id),
  prefix          text not null,
  digits          integer not null default 3 check (digits between 1 and 6),
  updated_at      timestamptz not null default now(),
  updated_by_name text not null default ''
);

alter table public.petty_cash_voucher_series enable row level security;  -- only the backend (service key) reads it
grant all on public.petty_cash_voucher_series to service_role;
