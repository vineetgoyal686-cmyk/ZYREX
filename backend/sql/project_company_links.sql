-- Which company each project belongs to — as linked on dev (Oct 2026) in
-- Settings › Organisation › company › Projects.
--
-- Matches by project code and company code (ids differ between dev and
-- prod). A project already linked is left alone; a code missing on prod is
-- skipped and listed in a NOTICE, so it can be linked by hand there.
--
-- Run by hand in the Supabase SQL editor, AFTER projects_into_company.sql.
-- Safe to re-run.

do $$
declare
  l record;
  n int;
begin
  for l in select * from (values
    ('B47',  'BITL'),   -- B-47 IAS House Noida
    ('BHA',  'BITL'),   -- Bootes Heights Alwar
    ('JYO',  'UBILLP'), -- GEETA MEUSEUM HR
    ('HIH',  'UBILLP'), -- Haryana Habitat Centre Panchkula
    ('HKD',  'BITL'),   -- Hotel Kapasheda
    ('JE',   'BITL'),   -- Janpura Extension
    ('JEX',  'UBILLP'), -- JHANSI EXHIBITION CENTRE
    ('SLH',  'UBILLP'), -- Lete Hunuman Mandir
    ('NLV',  'BVPL'),   -- Noida LEISURE VALLEY Phase -3
    ('NUR',  'BITL'),   -- Noida Urbs
    ('RSTF', 'BITL'),   -- Rashmi Sharma Tele Films
    ('RWH',  'NSSPL'),  -- Rewari Ware House
    ('GDLV', 'UBILLP'), -- Varanasi Library
    ('VRI',  'BVPL')    -- Vrindavan Residence
  ) as t(project_code, company_code) loop
    update public.projects p
    set    company_id = c.id
    from   organisation.companies c
    where  lower(c.company_code) = lower(l.company_code)
      and  lower(p.project_code) = lower(l.project_code)
      and  p.company_id is null;
    get diagnostics n = row_count;
    if n = 0 and not exists (select 1 from public.projects where lower(project_code) = lower(l.project_code) and company_id is not null) then
      raise notice 'Not linked: project % or company % not found', l.project_code, l.company_code;
    end if;
  end loop;
end $$;
