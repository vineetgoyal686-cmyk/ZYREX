-- Removes Payments Track and Site Expenses (the old project-level "Finance"
-- section's built features) along with their tables. Both were confirmed
-- empty (0 rows) before this was written, so this drops no real data.
-- Run once by hand in the Supabase SQL editor.

drop table if exists finance_bill_payments;
drop table if exists finance_bill_items;
drop table if exists finance_bills;

drop table if exists finance_site_expense_payments;
drop table if exists finance_site_expense_items;
drop table if exists finance_site_expenses;
