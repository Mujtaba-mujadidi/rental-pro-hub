-- Idempotent apply for charged_on on vehicle_hire_driver_charge_line_items.

alter table public.vehicle_hire_driver_charge_line_items
  add column if not exists charged_on date;

update public.vehicle_hire_driver_charge_line_items
set charged_on = (created_at at time zone 'Europe/London')::date
where charged_on is null;

alter table public.vehicle_hire_driver_charge_line_items
  alter column charged_on set default (timezone('Europe/London', now()))::date;

alter table public.vehicle_hire_driver_charge_line_items
  alter column charged_on set not null;
