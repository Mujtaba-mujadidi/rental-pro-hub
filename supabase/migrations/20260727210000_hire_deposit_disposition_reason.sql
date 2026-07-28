alter table public.vehicle_hire_groups
  add column if not exists deposit_disposition_reason text;
