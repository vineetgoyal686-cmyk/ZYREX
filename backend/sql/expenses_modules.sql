-- Registers the two Expenses modules (Global > Expenses) so they show up in
-- Settings > Permissions. Each sub-tab (Petty Cash / Cheque Record) is
-- granted separately; the sidebar shows Expenses if either is viewable.

-- modules.id's sequence has fallen behind rows inserted with explicit ids,
-- so the next auto id collides (duplicate key on modules_pkey). Resync it.
select setval(pg_get_serial_sequence('modules', 'id'), (select max(id) from modules));

insert into modules (module_key, module_name)
select 'expenses_petty_cash', 'Petty Cash'
where not exists (select 1 from modules where module_key = 'expenses_petty_cash');

insert into modules (module_key, module_name)
select 'expenses_cheque_record', 'Cheque Record'
where not exists (select 1 from modules where module_key = 'expenses_cheque_record');
