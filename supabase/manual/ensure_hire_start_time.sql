-- Idempotent ensure for hire scheduled start time (see 20260729100000_hire_start_time.sql).

alter table public.vehicle_hire_groups
  add column if not exists start_time time;

comment on column public.vehicle_hire_groups.start_time is
  'UK local start time for the hire on start_date; used on contracts and hire details.';
