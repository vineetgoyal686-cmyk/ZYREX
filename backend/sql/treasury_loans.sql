-- Treasury › Loans & EMI. A loan has a fixed EMI on a monthly due date;
-- the schedule is worked out from start_date + tenure_months, so only paid
-- EMIs are stored. Paying an EMI also writes a "Paid" (payment) entry into
-- the Party Ledger (treasury_ledger_entries) — entry_id links the two.
--
-- Penalty on an unpaid EMI, per full or part month overdue:
--   none    — no penalty
--   fixed   — penalty_fixed rupees
--   percent — penalty_percent % of the EMI
--   both    — fixed + percent
--
-- Run by hand in the Supabase SQL editor, on dev and on prod, BEFORE
-- deploying the matching code. Safe to re-run.

create table if not exists treasury_loans (
  id               uuid primary key default gen_random_uuid(),
  name             text        not null,
  lender           text        not null,
  company_name     text        not null default '',
  principal        numeric     not null default 0,
  interest_rate    numeric     not null default 0,   -- yearly %
  tenure_months    int         not null,
  emi_amount       numeric     not null,
  start_date       date        not null,             -- first EMI due date
  penalty_type     text        not null default 'none' check (penalty_type in ('none','fixed','percent','both')),
  penalty_fixed    numeric     not null default 0,
  penalty_percent  numeric     not null default 0,
  remarks          text        not null default '',
  is_closed        boolean     not null default false,
  created_by_id    uuid,
  created_by_name  text        not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists treasury_loan_payments (
  id          uuid primary key default gen_random_uuid(),
  loan_id     uuid        not null references treasury_loans(id) on delete cascade,
  emi_no      int         not null,
  paid_on     date        not null,
  amount      numeric     not null,                  -- EMI part
  penalty     numeric     not null default 0,
  mode        text        not null default 'account', -- account | cash (as in the Party Ledger)
  reference   text        not null default '',
  entry_id    uuid,                                  -- Party Ledger entry made for it
  created_by_name text    not null default '',
  created_at  timestamptz not null default now(),
  unique (loan_id, emi_no)
);

create index if not exists treasury_loan_payments_loan_idx on treasury_loan_payments (loan_id);
