-- Zyhawk prod release (Oct 2026) — all 13 SQL files, in order, in one go.
-- Run ONCE in the prod Supabase SQL editor (take a backup first).
-- Every part is safe to re-run: if it stops on an error, note the part
-- number shown above the failing line, get it fixed, and run the whole
-- file again — parts that already ran just skip.


-- ════════════════════════════════════════════════════════════════════
-- 1 / 13 — boardroom_to_treasury.sql
-- ════════════════════════════════════════════════════════════════════
-- Boardroom is now Treasury everywhere. Renames its tables, permission
-- keys and every stored reference to those keys. No data is copied or lost:
-- tables are renamed in place (their rows, indexes and policies move with
-- them), and saved permissions point at modules by id, which doesn't change.
--
-- Not renamed: the storage bucket "boardroom" (Supabase can't rename a
-- bucket; the code keeps using it).
--
-- Run by hand in the Supabase SQL editor, on dev and on prod, RIGHT WHEN
-- the matching code is deployed — old code needs the old names, new code
-- the new ones, so Treasury is unavailable in between. Safe to re-run.

-- 1. Tables
alter table if exists boardroom_finance_entries         rename to treasury_ledger_entries;
alter table if exists boardroom_finance_saved_values    rename to treasury_ledger_saved_values;
alter table if exists boardroom_finance_coded_values    rename to treasury_ledger_coded_values;
alter table if exists boardroom_finance_custom_columns  rename to treasury_ledger_custom_columns;
alter table if exists boardroom_finance_quick_sites     rename to treasury_ledger_quick_sites;
alter table if exists boardroom_finance_quick_companies rename to treasury_ledger_quick_companies;
alter table if exists boardroom_finance_quick_vendors   rename to treasury_ledger_quick_vendors;

-- 2. Permission keys (module_name too)
update modules set module_key = 'treasury_overview', module_name = 'Treasury Overview' where module_key = 'boardroom_dashboard';
update modules set module_key = 'treasury_ledger',   module_name = 'Party Ledger'      where module_key = 'boardroom_finance';

-- 3. Control Center owners
update module_owners set module_key = 'treasury_overview' where module_key = 'boardroom_dashboard';
update module_owners set module_key = 'treasury_ledger'   where module_key = 'boardroom_finance';

-- 4. Access Profiles keep a copy of each module's key in their JSON
update designations
set app_permissions = replace(replace(app_permissions::text,
      '"boardroom_dashboard"', '"treasury_overview"'),
      '"boardroom_finance"',   '"treasury_ledger"')::jsonb
where app_permissions::text like '%"boardroom_%';

-- 5. Change history (Log panel) of ledger entries
update procurement.audit_logs set entity_type = 'treasury_ledger_entry' where entity_type = 'boardroom_finance_entry';

-- 6. User Analytics screen time: the old Boardroom tab logged as "boardroom"
update screen_time_logs s set module_key = 'treasury_overview'
where s.module_key = 'boardroom'
  and not exists (select 1 from screen_time_logs t
                  where t.user_id = s.user_id and t.activity_date = s.activity_date and t.module_key = 'treasury_overview');


-- ════════════════════════════════════════════════════════════════════
-- 2 / 13 — rename_modules.sql
-- ════════════════════════════════════════════════════════════════════
-- Tab names shown in the app, kept in step with the new sidebar.
-- Only module_name (the display name) changes; module_key stays the same,
-- so every saved permission (per-user, Access Profiles, Control Center)
-- keeps working untouched.
--
-- Run by hand in the Supabase SQL editor, on dev and on prod. Safe to re-run.

-- "Global Dashboard" → "Dashboard"
update modules set module_name = 'Dashboard' where module_key = 'global_dashboard';

-- "Historical Data" → "Archive" (records from before Zyhawk)
update modules set module_name = 'Archive' where module_key = 'historical_data';

-- Treasury (was Boardroom) — keys are renamed in boardroom_to_treasury.sql
update modules set module_name = 'Treasury Overview' where module_key = 'treasury_overview';
update modules set module_name = 'Party Ledger'      where module_key = 'treasury_ledger';


-- ════════════════════════════════════════════════════════════════════
-- 3 / 13 — treasury_loans.sql
-- ════════════════════════════════════════════════════════════════════
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


-- ════════════════════════════════════════════════════════════════════
-- 4 / 13 — treasury_masters.sql
-- ════════════════════════════════════════════════════════════════════
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


-- ════════════════════════════════════════════════════════════════════
-- 5 / 13 — treasury_other_accounts.sql
-- ════════════════════════════════════════════════════════════════════
-- Treasury › Masters › Other Accounts: bank accounts that belong to no
-- company — a director's personal account, a site imprest account… Money can
-- be paid from (or received into) these, whichever company the entry is for.
--
-- They live in the same treasury_bank_accounts table with owner_type 'other'
-- and no owner; `label` says whose account it is.
-- Nothing existing changes.
--
-- Run by hand in the Supabase SQL editor, on dev and on prod (after
-- treasury_masters.sql), before deploying the matching code. Safe to re-run.

alter table treasury_bank_accounts drop constraint if exists treasury_bank_accounts_owner_type_check;
alter table treasury_bank_accounts add constraint treasury_bank_accounts_owner_type_check
  check (owner_type in ('party', 'company', 'other'));
alter table treasury_bank_accounts alter column owner_id drop not null;

alter table treasury_bank_accounts add column if not exists label text not null default '';  -- whose account, e.g. "Rajesh Kumar (Director)"

-- one row per account number among the other accounts
create unique index if not exists treasury_bank_accounts_other_uq
  on treasury_bank_accounts (btrim(account_number)) where owner_type = 'other';


-- ════════════════════════════════════════════════════════════════════
-- 6 / 13 — treasury_category_narration.sql
-- ════════════════════════════════════════════════════════════════════
-- Treasury › Party Ledger: "Purpose" is now called Category and "Expense
-- Detail / Description" is now called Narration — everywhere, the database
-- included.
--
--   treasury_ledger_entries.purpose      → category
--   treasury_ledger_entries.description  → narration
--   treasury_ledger_coded_values.field_key 'purpose' → 'category'
--
-- Only names change; every value stays exactly as it is.
--
-- Run by hand in the Supabase SQL editor, on dev and on prod, together with
-- deploying the matching code (the old code reads the old names). On prod run
-- it after boardroom_to_treasury.sql. Safe to re-run.

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'treasury_ledger_entries' and column_name = 'purpose') then
    alter table treasury_ledger_entries rename column purpose to category;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'treasury_ledger_entries' and column_name = 'description') then
    alter table treasury_ledger_entries rename column description to narration;
  end if;
end $$;

update treasury_ledger_coded_values set field_key = 'category' where field_key = 'purpose';


-- ════════════════════════════════════════════════════════════════════
-- 7 / 13 — zyhawk_ai.sql
-- ════════════════════════════════════════════════════════════════════
-- ZyAI — saved chats. One conversation per thread, its messages in
-- order. Each user only ever reads their own conversations (enforced in the
-- API). Only the visible text is stored, not the model's internal tool calls.
--
-- Run by hand in the Supabase SQL editor, on dev and on prod, BEFORE
-- deploying the matching code. Safe to re-run.

create table if not exists ai_conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid        not null references users(id) on delete cascade,
  title       text        not null default 'New chat',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists ai_conversations_user_idx on ai_conversations (user_id, updated_at desc);

create table if not exists ai_messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid        not null references ai_conversations(id) on delete cascade,
  role             text        not null check (role in ('user', 'assistant')),
  content          text        not null default '',
  sources          jsonb       not null default '[]'::jsonb,  -- web links used in the answer
  created_at       timestamptz not null default now()
);

create index if not exists ai_messages_conversation_idx on ai_messages (conversation_id, created_at);

-- Names / types / sizes of files attached to a message (the files themselves aren't stored)
alter table ai_messages add column if not exists attachments jsonb not null default '[]'::jsonb;

-- Which mode answered an assistant message: 'fast' or 'smart' (null on user messages)
alter table ai_messages add column if not exists mode text check (mode in ('fast', 'smart'));


-- ════════════════════════════════════════════════════════════════════
-- 8 / 13 — expense_book.sql
-- ════════════════════════════════════════════════════════════════════
-- Finance clean-up:
--   1. "Payments Track" is now "Expense Book" — module key payments_track →
--      expense_book everywhere it is stored (Access Profiles, Control Center,
--      request handlers, screen-time logs). Per-user permissions point at the
--      module's id, so they carry over untouched. Its tables (finance_orders,
--      finance_invoices, finance_invoice_payments) and files stay as they are.
--   2. "Finance Track" is removed for good — Treasury › Party Ledger replaced
--      it. Its table, module, permissions and logs are deleted.
--      ⚠ This permanently deletes every Finance Track entry. Export anything
--      you want to keep before running it. Its uploaded files stay in the
--      "finance-docs" bucket (shared with Expense Book) under finance-track/.
--
-- Run by hand in the Supabase SQL editor, on dev and on prod, together with
-- deploying the matching code. Safe to re-run.

-- ── 1. Payments Track → Expense Book ───────────────────────────────────
update modules set module_key = 'expense_book', module_name = 'Expense Book' where module_key = 'payments_track';
update modules set module_name = 'Expense Book' where module_key = 'expense_book';

update module_owners    set module_key = 'expense_book' where module_key = 'payments_track';
update request_handlers set module_key = 'expense_book' where module_key = 'payments_track';

update designations
set app_permissions = replace(app_permissions::text, '"payments_track"', '"expense_book"')::jsonb
where app_permissions::text like '%"payments_track"%';

update screen_time_logs s set module_key = 'expense_book'
where s.module_key = 'payments_track'
  and not exists (select 1 from screen_time_logs t
                  where t.user_id = s.user_id and t.activity_date = s.activity_date and t.module_key = 'expense_book');
delete from screen_time_logs where module_key = 'payments_track';

-- ── 2. Finance Track: gone ──────────────────────────────────────────────
-- Access Profiles: drop its entry from each profile's permission list
update designations d
set app_permissions = coalesce((
  select jsonb_agg(e)
  from jsonb_array_elements(d.app_permissions) e
  where e->>'module_key' is distinct from 'master_data_finance'
    and (e->>'module_id') is distinct from (select id::text from modules where module_key = 'master_data_finance')
), '[]'::jsonb)
where jsonb_typeof(d.app_permissions) = 'array'
  and (d.app_permissions::text like '%"master_data_finance"%'
       or exists (select 1 from jsonb_array_elements(d.app_permissions) e
                  where (e->>'module_id') = (select id::text from modules where module_key = 'master_data_finance')));

delete from permissions      where module_id = (select id from modules where module_key = 'master_data_finance');
delete from module_owners    where module_key = 'master_data_finance';
delete from request_handlers where module_key = 'master_data_finance';
delete from screen_time_logs where module_key = 'master_data_finance';
delete from modules          where module_key = 'master_data_finance';

drop table if exists finance_track_entries;


-- ════════════════════════════════════════════════════════════════════
-- 9 / 13 — projects_into_company.sql
-- ════════════════════════════════════════════════════════════════════
-- Projects live inside a company (Settings › Organisation › Company › Projects).
--
-- Until now there were two project lists:
--   public.projects            — the main list (Orders, Intake, Attendance …)
--   organisation.org_projects  — a per-company list that only Petty Cash used
-- This keeps the main list, gives each project a company, moves the
-- per-company projects into it and removes organisation.org_projects.
-- Petty Cash entries are re-pointed to the same project in the main list,
-- so no entry loses its project.
--
-- Run by hand in the Supabase SQL editor, on dev and on prod, BEFORE
-- deploying the matching code. Safe to re-run.

-- 1. Every project can belong to one company
alter table public.projects
  add column if not exists company_id uuid references organisation.companies (id) on delete set null;
create index if not exists idx_projects_company on public.projects (company_id);

-- 2. Petty Cash points at the main list
alter table petty_cash_entries add column if not exists project_id uuid references public.projects (id);
create index if not exists idx_petty_cash_entries_project_id on petty_cash_entries (project_id);

-- 3. Move organisation.org_projects into public.projects (only while it exists)
do $$
declare
  op record;
  pid uuid;
begin
  if to_regclass('organisation.org_projects') is null then return; end if;

  for op in execute 'select * from organisation.org_projects' loop
    -- same project already in the main list? (same code, or same name)
    select id into pid from public.projects p
    where  (p.company_id is null or p.company_id = op.company_id)
      and  ((op.project_code <> '' and lower(p.project_code) = lower(op.project_code))
            or lower(p.project_name) = lower(op.project_name))
    order  by (p.company_id = op.company_id) desc nulls last, p.created_at
    limit  1;

    if pid is null then
      insert into public.projects (project_name, project_code, city, state, address, is_active, company_id, created_by_name)
      values (op.project_name, op.project_code, op.city, op.state, op.address, op.status <> 'completed', op.company_id, 'Moved from company projects')
      returning id into pid;
    else
      update public.projects set company_id = op.company_id where id = pid and company_id is null;
    end if;

    execute 'update petty_cash_entries set project_id = $1 where org_project_id = $2 and project_id is null'
      using pid, op.id;
  end loop;
end $$;

-- 4. Remove the old per-company list
alter table petty_cash_entries drop column if exists org_project_id;
drop table if exists organisation.org_projects;

-- its permission module (Organisation › Projects); Project Management stays
update designations d
set    app_permissions = coalesce((
         select jsonb_agg(x) from jsonb_array_elements(d.app_permissions) x
         where  coalesce(x->>'module_key', '') <> 'org_projects'
           and  coalesce(x->>'module_id', '') not in (select id::text from modules where module_key = 'org_projects')
       ), '[]'::jsonb)
where  jsonb_typeof(d.app_permissions) = 'array'
  and  exists (select 1 from modules where module_key = 'org_projects');
delete from permissions      where module_id in (select id from modules where module_key = 'org_projects');
delete from module_owners    where module_key = 'org_projects';
delete from request_handlers where module_key = 'org_projects';
delete from screen_time_logs where module_key = 'org_projects';
delete from modules          where module_key = 'org_projects';


-- ════════════════════════════════════════════════════════════════════
-- 10 / 13 — project_company_links.sql
-- ════════════════════════════════════════════════════════════════════
-- Which company each project belongs to — as linked on dev (Oct 2026) in
-- Settings › Organisation › company › Projects.
--
-- Matches by project code and company code (ids differ between dev and
-- prod). A project already linked is left alone; a code missing on prod is
-- skipped and listed in a NOTICE, so it can be linked by hand there.
--
-- Run by hand in the Supabase SQL editor, AFTER projects_into_company.sql.
-- Safe to re-run.

do $$
declare
  l record;
  n int;
begin
  for l in select * from (values
    ('B47',  'BITL'),   -- B-47 IAS House Noida
    ('BHA',  'BITL'),   -- Bootes Heights Alwar
    ('JYO',  'UBILLP'), -- GEETA MEUSEUM HR
    ('HIH',  'UBILLP'), -- Haryana Habitat Centre Panchkula
    ('HKD',  'BITL'),   -- Hotel Kapasheda
    ('JE',   'BITL'),   -- Janpura Extension
    ('JEX',  'UBILLP'), -- JHANSI EXHIBITION CENTRE
    ('SLH',  'UBILLP'), -- Lete Hunuman Mandir
    ('NLV',  'BVPL'),   -- Noida LEISURE VALLEY Phase -3
    ('NUR',  'BITL'),   -- Noida Urbs
    ('RSTF', 'BITL'),   -- Rashmi Sharma Tele Films
    ('RWH',  'NSSPL'),  -- Rewari Ware House
    ('GDLV', 'UBILLP'), -- Varanasi Library
    ('VRI',  'BVPL')    -- Vrindavan Residence
  ) as t(project_code, company_code) loop
    update public.projects p
    set    company_id = c.id
    from   organisation.companies c
    where  lower(c.company_code) = lower(l.company_code)
      and  lower(p.project_code) = lower(l.project_code)
      and  p.company_id is null;
    get diagnostics n = row_count;
    if n = 0 and not exists (select 1 from public.projects where lower(project_code) = lower(l.project_code) and company_id is not null) then
      raise notice 'Not linked: project % or company % not found', l.project_code, l.company_code;
    end if;
  end loop;
end $$;


-- ════════════════════════════════════════════════════════════════════
-- 11 / 13 — projects_to_offices.sql
-- ════════════════════════════════════════════════════════════════════
-- Offices are not projects. A company's offices live in its Branch list
-- (organisation.branches, type 'Office'); Petty Cash can be booked to a
-- project OR an office of the entity.
--
-- Moves these entries of the project list into Branch, as offices of the
-- company they are linked to:
--   Wav / "Wave One" / Wave-One — Wave One (BVPL); on prod the same office
--                                 was also listed as "Wave One Noida Office"
--   HO-GU                       — Gurugram HO (BITL)
-- (a project with no company yet gets the one named here)
-- A project with no company yet is skipped — link it first (Organisation ›
-- company › Projects), then run this again.
--
-- Nothing that uses a project breaks: the project row is deleted only when
-- no order, intake, attendance or project-access list points at it;
-- otherwise it stays in the project list, active and unchanged, and a
-- NOTICE says so (the office is added either way).
--
-- Run by hand in the Supabase SQL editor, on dev and on prod, AFTER
-- projects_into_company.sql and BEFORE deploying the matching code.
-- Safe to re-run.

-- Branch form saves contact people (routes/organisation.js) — column was missing
alter table organisation.branches add column if not exists contacts jsonb not null default '[]'::jsonb;

alter table petty_cash_entries add column if not exists branch_id uuid references organisation.branches (id);
create index if not exists idx_petty_cash_entries_branch on petty_cash_entries (branch_id);

do $$
declare
  p   record;
  bid uuid;
  used boolean;
  n   bigint;
begin
  -- whose office each one is
  update public.projects set company_id = (select id from organisation.companies where company_code = 'BITL')
  where  lower(project_code) = 'ho-gu' and company_id is null;
  update public.projects set company_id = (select id from organisation.companies where company_code = 'BVPL')
  where  lower(project_code) in ('wav', 'wave one', 'wave-one') and company_id is null;

  for p in select pr.*,
                  -- one office per place: every Wave One variant goes to "Wave One"
                  case when lower(pr.project_code) = 'ho-gu' then pr.project_name else 'Wave One' end as office_name
           from public.projects pr
           where lower(pr.project_code) in ('wav', 'wave one', 'wave-one', 'ho-gu') loop
    if p.company_id is null then
      raise notice 'Skipped "%": link it to a company first', p.project_name;
      continue;
    end if;

    -- the office in that company's Branch list (reuse one with the same name)
    select id into bid from organisation.branches
    where  company_id = p.company_id and lower(label) = lower(p.office_name) limit 1;
    if bid is null then
      insert into organisation.branches (code, label, type, status, is_main, state, city, pincode, address, company_id)
      values (coalesce(p.project_code, ''), p.office_name, 'Office', 'active', false,
              coalesce(p.state, ''), coalesce(p.city, ''), coalesce(p.pincode, ''), coalesce(p.address, ''), p.company_id)
      returning id into bid;
    end if;

    -- Petty Cash entries move from the project to the office
    update petty_cash_entries set branch_id = bid, project_id = null, project = p.office_name
    where  project_id = p.id;

    -- Used for real work (orders, intake, attendance)? Then it stays a
    -- normal, ACTIVE project exactly as it is — nothing that uses it changes,
    -- and nobody's project access is touched. Only the office is added.
    used := false;
    if to_regclass('procurement.purchase_orders') is not null then
      execute 'select count(*) from procurement.purchase_orders where site_id::text = $1' into n using p.id::text; used := used or n > 0;
    end if;
    if to_regclass('store.intakes') is not null then
      execute 'select count(*) from store.intakes where site_id::text = $1' into n using p.id::text; used := used or n > 0;
    end if;
    if to_regclass('attendance.attendance') is not null then
      -- attendance keeps the project code (e.g. B47), older rows may keep the id
      execute 'select count(*) from attendance.attendance where project_id::text in ($1, $2) or site_code = $2' into n using p.id::text, coalesce(p.project_code, ''); used := used or n > 0;
    end if;
    if to_regclass('attendance.guard_attendance') is not null then
      execute 'select count(*) from attendance.guard_attendance where project_id::text in ($1, $2) or site_code = $2' into n using p.id::text, coalesce(p.project_code, ''); used := used or n > 0;
    end if;
    if used then
      raise notice 'Kept "%" in the project list too (active): orders / intake / attendance use it', p.project_name;
      continue;
    end if;

    -- Not used: take it out of Project Access lists, but only where other
    -- projects remain (an EMPTY list means "all projects" — emptying it
    -- would widen access). A list holding only this one keeps it, and the
    -- project then stays (active).
    update designations
    set    project_access = (select jsonb_agg(x) from jsonb_array_elements(project_access) x where x #>> '{}' <> p.id::text)
    where  jsonb_typeof(project_access) = 'array' and project_access ? p.id::text and jsonb_array_length(project_access) > 1;
    update users
    set    profile_permissions = jsonb_set(profile_permissions, '{allowed_projects}',
             (select jsonb_agg(x) from jsonb_array_elements(profile_permissions->'allowed_projects') x where x #>> '{}' <> p.id::text))
    where  jsonb_typeof(profile_permissions->'allowed_projects') = 'array'
      and  profile_permissions->'allowed_projects' ? p.id::text
      and  jsonb_array_length(profile_permissions->'allowed_projects') > 1;

    if exists (select 1 from users where profile_permissions::text like '%' || p.id::text || '%')
       or exists (select 1 from designations d where d::text like '%' || p.id::text || '%') then
      raise notice 'Kept "%" in the project list too (active): it is someone''s only Project Access', p.project_name;
      continue;
    end if;

    begin
      delete from public.projects where id = p.id;
    exception when foreign_key_violation then  -- some other table still points at it
      raise notice 'Kept "%" in the project list too (active): another table still uses it', p.project_name;
    end;
  end loop;
end $$;


-- ════════════════════════════════════════════════════════════════════
-- 12 / 13 — zyhawk_ai_permission.sql
-- ════════════════════════════════════════════════════════════════════
-- ZyAI gets its own permission (Access Profiles / User Management ›
-- General › ZyAI). Admin roles keep it; everyone else needs View granted.
--
-- Run by hand in the Supabase SQL editor, on dev and on prod, BEFORE
-- deploying the matching code. Safe to re-run.

select setval(pg_get_serial_sequence('modules', 'id'), (select max(id) from modules));

insert into modules (module_key, module_name)
select 'zyhawk_ai', 'ZyAI'
where not exists (select 1 from modules where module_key = 'zyhawk_ai');


-- ════════════════════════════════════════════════════════════════════
-- 13 / 13 — permission_scope.sql
-- ════════════════════════════════════════════════════════════════════
-- Per-tab project access: next to a tab's permissions, which projects it
-- covers — e.g. Orders for B47 + NLV, Intake for B47 only.
--
--   permissions.scope (per user)                 and
--   designations.app_permissions[].scope (Access Profile, same jsonb entries)
-- hold  {"all": true}  or  {"projects": ["<project id>", …]}.
-- NULL = not set yet: the tab keeps the old rule (Project Access list;
-- empty list = every project), so nobody's access changes until it is set.
--
-- Run by hand in the Supabase SQL editor, on dev and on prod, BEFORE
-- deploying the matching code. Safe to re-run.

alter table permissions add column if not exists scope jsonb;

