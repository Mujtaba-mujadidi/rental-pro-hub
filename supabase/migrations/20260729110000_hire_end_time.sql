-- Scheduled hire end time on return date (calendar end dates stay on vehicle_hire_agreements.end_date).

alter table public.vehicle_hire_groups
  add column if not exists end_time time;

comment on column public.vehicle_hire_groups.end_time is
  'UK local end time on each contract end_date; pairs with agreement end_date like start_time + start_date.';
