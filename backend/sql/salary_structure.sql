-- Finance › Salary — Step 1: salary records (salary structure per employee).
--
-- One row per employee per revision: a raise is a new row with a later
-- "effective_from"; the row in force on a date is the latest one on or
-- before it. Payroll (next step) reads this + attendance paid days.
--
-- Amounts are monthly rupees (pay_type 'monthly'), or a day rate
-- (pay_type 'daily'). PF / ESI are worked out by the app from these
-- (PF 12% of Basic, capped at ₹15,000 Basic when pf_capped; ESI 0.75% /
-- 3.25% while gross ≤ ₹21,000); PT and TDS are monthly amounts typed in.
--
-- Also adds the "salary" permission module (Access Profiles / User
-- Management › Finance › Salary). Admin roles get it; everyone else needs
-- it granted.
--
-- Run by hand in the Supabase SQL editor, on dev and on prod, BEFORE
-- deploying the matching code. Safe to re-run.

create table if not exists organisation.salary_structures (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid references organisation.companies(id),
  employee_id       uuid not null references organisation.employees(id) on delete cascade,
  effective_from    date not null,

  pay_type          text not null default 'monthly' check (pay_type in ('monthly', 'daily')),
  day_basis         text not null default 'actual' check (day_basis in ('actual', '30', '26')),

  -- earnings, monthly ₹ (pay_type monthly)
  basic             numeric(12,2) not null default 0,
  hra               numeric(12,2) not null default 0,
  conveyance        numeric(12,2) not null default 0,
  medical           numeric(12,2) not null default 0,
  special_allowance numeric(12,2) not null default 0,
  other_allowance   numeric(12,2) not null default 0,
  -- pay_type daily
  daily_rate        numeric(12,2) not null default 0,
  -- overtime ₹ per hour (0 = no OT pay)
  ot_rate           numeric(12,2) not null default 0,

  -- deductions
  pf_applicable     boolean not null default false,
  pf_capped         boolean not null default true,   -- PF on Basic up to ₹15,000
  esi_applicable    boolean not null default false,
  pt_monthly        numeric(12,2) not null default 0,
  tds_monthly       numeric(12,2) not null default 0,

  -- payment + statutory numbers
  payment_mode      text not null default 'bank' check (payment_mode in ('bank', 'cash', 'cheque')),
  bank_name         text not null default '',
  account_holder    text not null default '',
  account_number    text not null default '',
  ifsc              text not null default '',
  pan               text not null default '',
  uan               text not null default '',
  esic_number       text not null default '',

  remarks           text not null default '',
  created_by_id     uuid,
  created_by_name   text,
  created_at        timestamptz not null default now(),
  updated_by_name   text,
  updated_at        timestamptz not null default now(),
  unique (employee_id, effective_from)
);

create index if not exists salary_structures_company_idx  on organisation.salary_structures (company_id);
create index if not exists salary_structures_employee_idx on organisation.salary_structures (employee_id, effective_from desc);

-- only the backend (service key) reads this — salary is private
alter table organisation.salary_structures enable row level security;
grant all on organisation.salary_structures to service_role;

-- permission module
select setval(pg_get_serial_sequence('modules', 'id'), (select max(id) from modules));
insert into modules (module_key, module_name)
select 'salary', 'Salary'
where not exists (select 1 from modules where module_key = 'salary');
