-- Realtime for hire extra/driver charge line items (add/amend/void without a payment row).

alter table public.vehicle_hire_driver_charge_line_items replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'vehicle_hire_driver_charge_line_items'
  ) then
    alter publication supabase_realtime add table public.vehicle_hire_driver_charge_line_items;
  end if;
end $$;
