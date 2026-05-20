-- Optional: run in Supabase SQL editor if POST /vendor-pool fails on other_attachment_url
alter table procurement.vendor_pool add column if not exists other_attachment_url text;
