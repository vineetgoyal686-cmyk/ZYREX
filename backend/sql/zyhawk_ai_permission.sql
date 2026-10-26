-- ZyAI gets its own permission (Access Profiles / User Management ›
-- General › ZyAI). Admin roles keep it; everyone else needs View granted.
--
-- Run by hand in the Supabase SQL editor, on dev and on prod, BEFORE
-- deploying the matching code. Safe to re-run.

select setval(pg_get_serial_sequence('modules', 'id'), (select max(id) from modules));

insert into modules (module_key, module_name)
select 'zyhawk_ai', 'ZyAI'
where not exists (select 1 from modules where module_key = 'zyhawk_ai');
