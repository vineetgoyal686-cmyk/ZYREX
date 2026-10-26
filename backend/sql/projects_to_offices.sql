-- Offices are not projects. A company's offices live in its Branch list
-- (organisation.branches, type 'Office'); Petty Cash can be booked to a
-- project OR an office of the entity.
--
-- Moves these entries of the project list into Branch, as offices of the
-- company they are linked to:
--   Wav / "Wave One" / Wave-One — Wave One (BVPL); on prod the same office
--                                 was also listed as "Wave One Noida Office"
--   HO-GU                       — Gurugram HO (BITL)
-- (a project with no company yet gets the one named here)
-- A project with no company yet is skipped — link it first (Organisation ›
-- company › Projects), then run this again.
--
-- Nothing that uses a project breaks: the project row is deleted only when
-- no order, intake, attendance or project-access list points at it;
-- otherwise it stays in the project list, active and unchanged, and a
-- NOTICE says so (the office is added either way).
--
-- Run by hand in the Supabase SQL editor, on dev and on prod, AFTER
-- projects_into_company.sql and BEFORE deploying the matching code.
-- Safe to re-run.

-- Branch form saves contact people (routes/organisation.js) — column was missing
alter table organisation.branches add column if not exists contacts jsonb not null default '[]'::jsonb;

alter table petty_cash_entries add column if not exists branch_id uuid references organisation.branches (id);
create index if not exists idx_petty_cash_entries_branch on petty_cash_entries (branch_id);

do $$
declare
  p   record;
  bid uuid;
  used boolean;
  n   bigint;
begin
  -- whose office each one is
  update public.projects set company_id = (select id from organisation.companies where company_code = 'BITL')
  where  lower(project_code) = 'ho-gu' and company_id is null;
  update public.projects set company_id = (select id from organisation.companies where company_code = 'BVPL')
  where  lower(project_code) in ('wav', 'wave one', 'wave-one') and company_id is null;

  for p in select pr.*,
                  -- one office per place: every Wave One variant goes to "Wave One"
                  case when lower(pr.project_code) = 'ho-gu' then pr.project_name else 'Wave One' end as office_name
           from public.projects pr
           where lower(pr.project_code) in ('wav', 'wave one', 'wave-one', 'ho-gu') loop
    if p.company_id is null then
      raise notice 'Skipped "%": link it to a company first', p.project_name;
      continue;
    end if;

    -- the office in that company's Branch list (reuse one with the same name)
    select id into bid from organisation.branches
    where  company_id = p.company_id and lower(label) = lower(p.office_name) limit 1;
    if bid is null then
      insert into organisation.branches (code, label, type, status, is_main, state, city, pincode, address, company_id)
      values (coalesce(p.project_code, ''), p.office_name, 'Office', 'active', false,
              coalesce(p.state, ''), coalesce(p.city, ''), coalesce(p.pincode, ''), coalesce(p.address, ''), p.company_id)
      returning id into bid;
    end if;

    -- Petty Cash entries move from the project to the office
    update petty_cash_entries set branch_id = bid, project_id = null, project = p.office_name
    where  project_id = p.id;

    -- Used for real work (orders, intake, attendance)? Then it stays a
    -- normal, ACTIVE project exactly as it is — nothing that uses it changes,
    -- and nobody's project access is touched. Only the office is added.
    used := false;
    if to_regclass('procurement.purchase_orders') is not null then
      execute 'select count(*) from procurement.purchase_orders where site_id::text = $1' into n using p.id::text; used := used or n > 0;
    end if;
    if to_regclass('store.intakes') is not null then
      execute 'select count(*) from store.intakes where site_id::text = $1' into n using p.id::text; used := used or n > 0;
    end if;
    if to_regclass('attendance.attendance') is not null then
      -- attendance keeps the project code (e.g. B47), older rows may keep the id
      execute 'select count(*) from attendance.attendance where project_id::text in ($1, $2) or site_code = $2' into n using p.id::text, coalesce(p.project_code, ''); used := used or n > 0;
    end if;
    if to_regclass('attendance.guard_attendance') is not null then
      execute 'select count(*) from attendance.guard_attendance where project_id::text in ($1, $2) or site_code = $2' into n using p.id::text, coalesce(p.project_code, ''); used := used or n > 0;
    end if;
    if used then
      raise notice 'Kept "%" in the project list too (active): orders / intake / attendance use it', p.project_name;
      continue;
    end if;

    -- Not used: take it out of Project Access lists, but only where other
    -- projects remain (an EMPTY list means "all projects" — emptying it
    -- would widen access). A list holding only this one keeps it, and the
    -- project then stays (active).
    update designations
    set    project_access = (select jsonb_agg(x) from jsonb_array_elements(project_access) x where x #>> '{}' <> p.id::text)
    where  jsonb_typeof(project_access) = 'array' and project_access ? p.id::text and jsonb_array_length(project_access) > 1;
    update users
    set    profile_permissions = jsonb_set(profile_permissions, '{allowed_projects}',
             (select jsonb_agg(x) from jsonb_array_elements(profile_permissions->'allowed_projects') x where x #>> '{}' <> p.id::text))
    where  jsonb_typeof(profile_permissions->'allowed_projects') = 'array'
      and  profile_permissions->'allowed_projects' ? p.id::text
      and  jsonb_array_length(profile_permissions->'allowed_projects') > 1;

    if exists (select 1 from users where profile_permissions::text like '%' || p.id::text || '%')
       or exists (select 1 from designations d where d::text like '%' || p.id::text || '%') then
      raise notice 'Kept "%" in the project list too (active): it is someone''s only Project Access', p.project_name;
      continue;
    end if;

    begin
      delete from public.projects where id = p.id;
    exception when foreign_key_violation then  -- some other table still points at it
      raise notice 'Kept "%" in the project list too (active): another table still uses it', p.project_name;
    end;
  end loop;
end $$;
