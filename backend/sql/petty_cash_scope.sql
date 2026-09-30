-- Petty Cash scoped by Entity (organisation.companies) + Project
-- (organisation.org_projects). Every entry belongs to one entity and one of
-- its projects; the Petty Cash header picks which ones are shown.
-- Voucher numbers become per entity: <COMPANY_CODE>-VH-<n>.
--
-- Run by hand in the Supabase SQL editor, on dev and on prod, AFTER
-- org_projects.sql and BEFORE deploying the matching code. Safe to re-run.

alter table petty_cash_entries add column if not exists company_id uuid references organisation.companies (id);
alter table petty_cash_entries add column if not exists org_project_id uuid references organisation.org_projects (id);
create index if not exists idx_petty_cash_entries_company on petty_cash_entries (company_id);
create index if not exists idx_petty_cash_entries_project on petty_cash_entries (org_project_id);

-- Existing entries → Bharat Volt (BVPL) / Wave One.
update petty_cash_entries e
set    company_id = c.id, org_project_id = p.id, project = p.project_name
from   organisation.companies c
join   organisation.org_projects p on p.company_id = c.id and lower(p.project_name) = 'wave one'
where  c.company_code = 'BVPL' and e.company_id is null;

-- One voucher counter per entity (replaces the single petty_cash_voucher_seq).
create table if not exists petty_cash_voucher_counters (
  company_id uuid primary key references organisation.companies (id) on delete cascade,
  last_no    bigint not null default 0
);

-- BVPL continues from the numbers already handed out (BVPL-VH-1, 2, 3 …).
insert into petty_cash_voucher_counters (company_id, last_no)
select c.id, (select case when is_called then last_value else 0 end from petty_cash_voucher_seq)
from   organisation.companies c
where  c.company_code = 'BVPL'
on conflict (company_id) do nothing;

-- Takes the entity's next number.
create or replace function next_petty_cash_voucher_no(p_company uuid)
returns bigint language sql volatile as $$
  insert into petty_cash_voucher_counters as vc (company_id, last_no) values (p_company, 1)
  on conflict (company_id) do update set last_no = vc.last_no + 1
  returning last_no;
$$;

-- Shows the entity's next number without using it up.
create or replace function peek_petty_cash_voucher_no(p_company uuid)
returns bigint language sql stable as $$
  select coalesce((select last_no from petty_cash_voucher_counters where company_id = p_company), 0) + 1;
$$;
