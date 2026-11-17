-- Request Handler per company.
-- company_id = null  → Default handlers (used for every company that has none of its own)
-- company_id = <id>  → that company's own handlers for the action
-- Safe to run more than once.

alter table public.request_handlers
  add column if not exists company_id uuid references organisation.companies (id) on delete cascade;

-- The old unique key was (module_key, action_key) — one row per action.
-- Drop it so each company can have its own row.
do $$
declare r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class t     on t.oid = con.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'request_handlers' and con.contype = 'u'
  loop
    execute format('alter table public.request_handlers drop constraint %I', r.conname);
  end loop;

  for r in
    select i.relname
    from pg_index x
    join pg_class i     on i.oid = x.indexrelid
    join pg_class t     on t.oid = x.indrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'request_handlers'
      and x.indisunique and not x.indisprimary
      and i.relname <> 'request_handlers_module_action_company_key'
  loop
    execute format('drop index if exists public.%I', r.relname);
  end loop;
end $$;

-- One row per module + action + company (null company = the Default row).
create unique index if not exists request_handlers_module_action_company_key
  on public.request_handlers (module_key, action_key, coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid));
