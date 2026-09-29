-- Petty Cash expense voucher numbers: BVPL-VH-1, BVPL-VH-2, ... drawn from
-- one sequence so two people creating vouchers at once never get the same
-- number. A number is used up only when a voucher is actually created
-- (Done), not when the voucher form is opened.
--
-- Run by hand in the Supabase SQL editor, on dev and on prod, BEFORE
-- deploying the matching code. Safe to re-run.

create sequence if not exists petty_cash_voucher_seq start 1;

-- Takes the next number.
create or replace function next_petty_cash_voucher_no()
returns bigint language sql volatile as $$
  select nextval('petty_cash_voucher_seq');
$$;

-- Shows the number the next voucher will get, without using it up.
create or replace function peek_petty_cash_voucher_no()
returns bigint language sql stable as $$
  select case when is_called then last_value + 1 else last_value end from petty_cash_voucher_seq;
$$;

-- Create-Voucher details saved with the expense, so the voucher can be
-- reopened and edited (keeps its number).
alter table petty_cash_entries add column if not exists voucher_data jsonb;
