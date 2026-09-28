-- Petty Cash attachments split into four sections — Bills, Voucher,
-- Payment Docs, Material Image — each its own column instead of the single
-- document_urls list.
--
-- Run by hand in the Supabase SQL editor, on dev and on prod, BEFORE
-- deploying the matching code. Safe to re-run.

alter table petty_cash_entries add column if not exists bill_docs     text[] not null default '{}';
alter table petty_cash_entries add column if not exists voucher_docs  text[] not null default '{}';
alter table petty_cash_entries add column if not exists payment_docs  text[] not null default '{}';
alter table petty_cash_entries add column if not exists material_docs text[] not null default '{}';

-- Move anything already uploaded into the best-fitting section:
-- Received / Given entries → Payment Docs; voucher expenses → Voucher;
-- other expenses → Bills. Then empty the old column.
update petty_cash_entries set payment_docs = payment_docs || document_urls
where entry_type <> 'expense' and cardinality(document_urls) > 0;

update petty_cash_entries set voucher_docs = voucher_docs || document_urls
where entry_type = 'expense' and proof_type = 'voucher' and cardinality(document_urls) > 0;

update petty_cash_entries set bill_docs = bill_docs || document_urls
where entry_type = 'expense' and proof_type <> 'voucher' and cardinality(document_urls) > 0;

update petty_cash_entries set document_urls = '{}' where cardinality(document_urls) > 0;
