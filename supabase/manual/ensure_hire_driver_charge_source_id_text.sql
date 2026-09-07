-- Idempotent: allow accessory keys (and UUIDs) in source_id.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'vehicle_hire_driver_charge_line_items'
      and column_name = 'source_id'
      and data_type = 'uuid'
  ) then
    alter table public.vehicle_hire_driver_charge_line_items
      alter column source_id type text using source_id::text;
  end if;
end $$;
