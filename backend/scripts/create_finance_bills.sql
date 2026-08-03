-- Finance module — Phase 1: Payments Track (invoices / bills record)
-- Run this by hand in the Supabase SQL editor (dev project first, then prod).

-- The old scaffolded "Bills & Docs" module row becomes "Payments Track" —
-- renaming (not deleting) preserves any permission grants already tied to it.
UPDATE public.modules SET module_key = 'payments_track', module_name = 'Payments Track'
WHERE module_key = 'bills_docs';

-- New Master Data > Finance Master Data tab (placeholder for now, no table yet).
INSERT INTO public.modules (id, module_key, module_name, is_active)
SELECT COALESCE(MAX(id), 0) + 1, 'master_data_finance', 'Finance Master Data', true
FROM public.modules
WHERE NOT EXISTS (SELECT 1 FROM public.modules WHERE module_key = 'master_data_finance');

CREATE TABLE IF NOT EXISTS public.finance_bills (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    bill_number text NOT NULL UNIQUE,          -- auto: BILL-1, BILL-2 ...
    site_id uuid REFERENCES public.projects(id),
    vendor_id uuid REFERENCES procurement.vendors(id),
    vendor_name text DEFAULT ''::text,         -- snapshot at time of entry
    order_id uuid REFERENCES procurement.purchase_orders(id),
    order_number text DEFAULT ''::text,        -- snapshot; also lets a bill reference an order-in-name-only
    invoice_number text NOT NULL,
    invoice_date date,
    category text DEFAULT ''::text,            -- e.g. Material, Service, Rent, Fuel, Misc
    amount numeric(14,2) NOT NULL DEFAULT 0,
    description text DEFAULT ''::text,
    document_url text DEFAULT ''::text,        -- path inside the finance-docs bucket
    remarks text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    created_by_id uuid,
    created_by_name text,
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    deleted_by_id uuid,
    deleted_by_name text
);

CREATE INDEX IF NOT EXISTS finance_bills_site_id_idx    ON public.finance_bills (site_id);
CREATE INDEX IF NOT EXISTS finance_bills_vendor_id_idx  ON public.finance_bills (vendor_id);
CREATE INDEX IF NOT EXISTS finance_bills_order_id_idx   ON public.finance_bills (order_id);

-- Private storage bucket for bill/invoice PDFs (mirrors procurement-docs).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('finance-docs', 'finance-docs', false, 10485760, ARRAY['application/pdf','image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;
