-- When the driver changes their registered address, we require them to revisit licence details.
-- Cleared when they save the driving or PHV step on /driver/onboarding.

alter table public.driver_profiles
  add column if not exists licence_revalidation_due_at timestamptz;

comment on column public.driver_profiles.licence_revalidation_due_at is
  'Set when address changes; cleared after saving driving or PHV licence step.';
