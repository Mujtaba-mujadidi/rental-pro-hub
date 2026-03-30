-- Per-licence confirmations for address revalidation (non-blocking reminders)
alter table public.driver_profiles
  add column if not exists driving_address_confirmed_at timestamptz,
  add column if not exists phv_address_confirmed_at timestamptz;

comment on column public.driver_profiles.driving_address_confirmed_at is
  'When set, driver has confirmed their driving licence details/documents match the current address after an address change.';

comment on column public.driver_profiles.phv_address_confirmed_at is
  'When set, driver has confirmed their PHV/taxi licence details/document match the current address after an address change.';

