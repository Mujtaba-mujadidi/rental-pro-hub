-- Accessory return charges use inspection accessory keys (e.g. hasTyreKeyLocks) as
-- source_id. Damage/fuel still use UUIDs. Widen the column so both fit.

alter table public.vehicle_hire_driver_charge_line_items
  alter column source_id type text using source_id::text;
