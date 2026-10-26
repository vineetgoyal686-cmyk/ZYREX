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
