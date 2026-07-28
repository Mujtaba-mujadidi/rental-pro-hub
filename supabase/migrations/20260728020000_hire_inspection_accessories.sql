-- Vehicle kit/accessories checklist on checkout / check-in inspections.
alter table public.vehicle_hire_inspections
  add column if not exists has_spare_tyre boolean,
  add column if not exists has_tyre_key_locks boolean,
  add column if not exists has_tyre_inflation_kit boolean,
  add column if not exists has_charging_cable boolean,
  add column if not exists has_tyre_replacement_kit boolean;
