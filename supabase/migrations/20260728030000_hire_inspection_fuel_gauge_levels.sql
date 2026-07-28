-- Store fuel level as integer percent (0–100) instead of text buckets.

alter table public.vehicle_hire_inspections
  drop constraint if exists vehicle_hire_inspections_fuel_level_check;

alter table public.vehicle_hire_inspections
  add column if not exists fuel_level_pct smallint;

update public.vehicle_hire_inspections
set fuel_level_pct = case fuel_level::text
  when 'empty' then 0
  when 'below_quarter' then 12
  when 'quarter' then 25
  when 'between_quarter_half' then 37
  when 'half' then 50
  when 'between_half_three_quarter' then 62
  when 'three_quarter' then 75
  when 'between_three_quarter_full' then 88
  when 'full' then 100
  else null
end
where fuel_level is not null;

alter table public.vehicle_hire_inspections
  drop column fuel_level;

alter table public.vehicle_hire_inspections
  rename column fuel_level_pct to fuel_level;

alter table public.vehicle_hire_inspections
  add constraint vehicle_hire_inspections_fuel_level_check check (
    fuel_level is null or (fuel_level >= 0 and fuel_level <= 100)
  );
