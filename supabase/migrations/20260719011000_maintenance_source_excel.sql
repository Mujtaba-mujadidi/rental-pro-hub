-- Allow excel as maintenance record source.

alter table public.vehicle_maintenance_records
  drop constraint if exists vehicle_maintenance_records_source_check;

alter table public.vehicle_maintenance_records
  add constraint vehicle_maintenance_records_source_check
  check (source in ('manual', 'csv', 'excel'));
