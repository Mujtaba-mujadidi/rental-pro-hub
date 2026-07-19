-- Allow tax and PHV/Taxi licence as maintenance expense categories.

alter table public.vehicle_maintenance_records
  drop constraint if exists vehicle_maintenance_records_category_check;

alter table public.vehicle_maintenance_records
  add constraint vehicle_maintenance_records_category_check
  check (category in (
    'service', 'mot', 'tax', 'phv_taxi_licence', 'repair', 'tyres', 'bodywork', 'glass', 'electrical', 'other'
  ));
