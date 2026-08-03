-- Finance module — Site Expenses (kept fully separate from Payments Track,
-- own tables — do not touch finance_bills / finance_bill_items here).
-- Same shape as Payments Track (item grid, GST, HSN/SAC) per instructions.
-- Run by hand in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.finance_site_expenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    expense_number text NOT NULL UNIQUE,       -- auto: EXP-1, EXP-2 ...
    site_id uuid REFERENCES public.projects(id),
    company_id uuid,
    vendor_id uuid REFERENCES procurement.vendors(id),
    vendor_name text DEFAULT ''::text,
    order_id uuid REFERENCES procurement.purchase_orders(id),
    order_number text DEFAULT ''::text,
    invoice_number text NOT NULL,
    invoice_date date,
    category text DEFAULT ''::text,
    gst_type text DEFAULT 'intra',             -- 'intra' (CGST+SGST) or 'inter' (IGST)
    amount numeric(14,2) NOT NULL DEFAULT 0,
    description text DEFAULT ''::text,
    bill_status text DEFAULT 'Pending',
    document_url text DEFAULT ''::text,
    remarks text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    created_by_id uuid,
    created_by_name text,
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    deleted_by_id uuid,
    deleted_by_name text
);

CREATE INDEX IF NOT EXISTS finance_site_expenses_site_id_idx   ON public.finance_site_expenses (site_id);
CREATE INDEX IF NOT EXISTS finance_site_expenses_vendor_id_idx ON public.finance_site_expenses (vendor_id);

CREATE TABLE IF NOT EXISTS public.finance_site_expense_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    expense_id uuid NOT NULL REFERENCES public.finance_site_expenses(id) ON DELETE CASCADE,
    item_date date,
    in_no text DEFAULT ''::text,
    dc_no text DEFAULT ''::text,
    category text DEFAULT ''::text,
    item_type text DEFAULT 'goods',            -- 'goods' (HSN) or 'service' (SAC)
    item_name text DEFAULT ''::text,
    hsn_code text DEFAULT ''::text,            -- holds HSN or SAC, per item_type
    unit text DEFAULT ''::text,
    qty numeric(14,3) DEFAULT 0,
    basic_rate numeric(14,2) DEFAULT 0,
    amount numeric(14,2) DEFAULT 0,
    other_charges numeric(14,2) DEFAULT 0,
    total_amount numeric(14,2) DEFAULT 0,
    igst_pct numeric(5,2) DEFAULT 0,
    igst_amount numeric(14,2) DEFAULT 0,
    cgst_pct numeric(5,2) DEFAULT 0,
    cgst_amount numeric(14,2) DEFAULT 0,
    sgst_pct numeric(5,2) DEFAULT 0,
    sgst_amount numeric(14,2) DEFAULT 0,
    gst_amount numeric(14,2) DEFAULT 0,
    net_amount numeric(14,2) DEFAULT 0,
    remarks text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);
CREATE INDEX IF NOT EXISTS finance_site_expense_items_expense_id_idx ON public.finance_site_expense_items (expense_id);

CREATE TABLE IF NOT EXISTS public.finance_site_expense_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    expense_id uuid NOT NULL REFERENCES public.finance_site_expenses(id) ON DELETE CASCADE,
    amount numeric(14,2) NOT NULL DEFAULT 0,
    payment_date date,
    payment_mode text DEFAULT ''::text,
    reference_no text DEFAULT ''::text,
    document_url text DEFAULT ''::text,
    remarks text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    created_by_id uuid,
    created_by_name text
);
CREATE INDEX IF NOT EXISTS finance_site_expense_payments_expense_id_idx ON public.finance_site_expense_payments (expense_id);
