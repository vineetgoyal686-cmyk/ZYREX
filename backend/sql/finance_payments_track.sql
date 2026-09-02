-- Payments Track (v2): Orders are their own entity now — a vendor's order is
-- entered once, then any number of invoices/bills can be raised against it
-- without repeating the vendor/order info. Each invoice still carries its own
-- repeatable payments and its own attachments.
-- Run once by hand in the Supabase SQL editor. Safe to re-run: finance_invoices
-- had 0 rows at the time this was written, so it's dropped and recreated clean
-- rather than migrated column-by-column.

drop table if exists finance_invoice_payments;
drop table if exists finance_invoices;
drop table if exists finance_orders;

create table finance_orders (
  id              uuid primary key default gen_random_uuid(),
  site_id         uuid,
  vendor_id       uuid,
  vendor_name     text,
  msme_number     text,
  company_id      uuid,
  company_name    text,
  order_no        text,
  order_date      date,
  order_value     numeric not null default 0,
  created_by_id   uuid,
  created_by_name text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz,
  deleted_at      timestamptz,
  deleted_by_id   uuid,
  deleted_by_name text
);

create table finance_invoices (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references finance_orders(id) on delete cascade,
  site_id           uuid,
  invoice_no        text not null,
  invoice_date      date,
  invoice_amount    numeric not null default 0,
  expense_category  text,
  expense_info      text,
  tally_status      text not null default 'No' check (tally_status in ('Yes', 'No')),
  bill_status       text not null default 'Pending' check (bill_status in ('Pending', 'Approved', 'Rejected', 'Hold')),
  document_urls     text[] not null default '{}',
  created_by_id     uuid,
  created_by_name   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz,
  deleted_at        timestamptz,
  deleted_by_id     uuid,
  deleted_by_name   text
);

create table finance_invoice_payments (
  id              uuid primary key default gen_random_uuid(),
  invoice_id      uuid not null references finance_invoices(id) on delete cascade,
  paid_amount     numeric not null default 0,
  paid_date       date,
  mode            text,
  reference_no    text,
  remarks         text,
  created_by_name text,
  created_at      timestamptz not null default now()
);

create index idx_finance_orders_site              on finance_orders(site_id);
create index idx_finance_orders_vendor             on finance_orders(vendor_id);
create index idx_finance_orders_active             on finance_orders(deleted_at);
create index idx_finance_invoices_order            on finance_invoices(order_id);
create index idx_finance_invoices_site             on finance_invoices(site_id);
create index idx_finance_invoices_active           on finance_invoices(deleted_at);
create index idx_finance_invoice_payments_invoice  on finance_invoice_payments(invoice_id);

-- Registers the module so it shows up in Settings > Permissions (Finance group).
insert into modules (module_key, module_name)
select 'payments_track', 'Payments Track'
where not exists (select 1 from modules where module_key = 'payments_track');
