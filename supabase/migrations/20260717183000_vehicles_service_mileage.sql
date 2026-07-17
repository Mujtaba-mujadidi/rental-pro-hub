-- Optional odometer / service mileage on vehicles (service_due_at already optional).

alter table public.vehicles
  add column if not exists current_mileage integer
    check (current_mileage is null or current_mileage >= 0);

alter table public.vehicles
  add column if not exists next_service_mileage integer
    check (next_service_mileage is null or next_service_mileage >= 0);

comment on column public.vehicles.service_due_at is 'Optional next service date. Not required when adding a vehicle.';
comment on column public.vehicles.current_mileage is 'Optional current odometer reading (miles).';
comment on column public.vehicles.next_service_mileage is 'Optional odometer reading when next service is due (miles).';
