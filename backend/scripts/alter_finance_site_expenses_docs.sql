-- Site Expenses — each document slot (E-way Bill / Invoice / Other Docs) now
-- holds MULTIPLE files, not one. Switching from a single text URL column to
-- a jsonb array per slot. Safe to run even if the single-URL version of this
-- script already ran — no real documents uploaded yet (still build phase).

ALTER TABLE public.finance_site_expenses
  DROP COLUMN IF EXISTS document_url,
  DROP COLUMN IF EXISTS eway_bill_url,
  DROP COLUMN IF EXISTS other_doc_url,
  ADD COLUMN IF NOT EXISTS document_urls  jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS eway_bill_urls jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS other_doc_urls jsonb DEFAULT '[]'::jsonb;
