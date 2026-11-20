-- Inventory and HR Letters get their own permission (Nov 2026).
-- Until now both tabs showed to every user; after this they show only to
-- users given "View" on them (per user or through an Access Profile).
-- Global Admin / Super Admin still see them without a grant.
-- Safe to run more than once.

select setval(pg_get_serial_sequence('modules', 'id'), (select max(id) from modules));

insert into modules (module_key, module_name)
select 'inventory', 'Inventory'
where not exists (select 1 from modules where module_key = 'inventory');

insert into modules (module_key, module_name)
select 'hr_letters', 'HR Letters'
where not exists (select 1 from modules where module_key = 'hr_letters');
