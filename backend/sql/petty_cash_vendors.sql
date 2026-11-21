-- Petty Cash › Directory: vendors added by hand (or from Excel) before any
-- expense uses them. The Directory lists these together with the vendor
-- names typed on expense entries; the entry form's Vendor list offers both.
-- One name per project / office (any case / spacing).
--
-- Run by hand in the Supabase SQL editor, on dev and on prod, BEFORE
-- deploying the matching code. Safe to re-run.

create table if not exists public.petty_cash_vendors (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references organisation.companies(id),
  project_id      uuid,                       -- public.projects.id (a project) …
  branch_id       uuid,                       -- … or organisation.branches.id (an office)
  name            text not null,
  created_at      timestamptz not null default now(),
  created_by_name text not null default '',
  check ((project_id is null) <> (branch_id is null)),
  check (length(trim(name)) > 0)
);

create unique index if not exists petty_cash_vendors_scope_name_uq
  on public.petty_cash_vendors (coalesce(project_id, branch_id), lower(regexp_replace(trim(name), '\s+', ' ', 'g')));

create index if not exists petty_cash_vendors_company_idx on public.petty_cash_vendors (company_id);

alter table public.petty_cash_vendors enable row level security;  -- only the backend (service key) reads it
grant all on public.petty_cash_vendors to service_role;
