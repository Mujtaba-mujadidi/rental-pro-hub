-- Idempotent ensure for hire end time (see 20260729110000_hire_end_time.sql).

alter table public.vehicle_hire_groups
  add column if not exists end_time time;

comment on column public.vehicle_hire_groups.end_time is
  'UK local end time on each contract end_date; pairs with agreement end_date like start_time + start_date.';
