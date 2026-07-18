-- Fleet Tracking (SmartCar Tracker) — company enable flag, API credentials, vehicle IMEI links.

alter table public.companies
  add column if not exists fleet_tracking_enabled boolean not null default false;

alter table public.companies
  add column if not exists fleet_tracking_account text;

alter table public.companies
  add column if not exists fleet_tracking_password_encrypted text;

comment on column public.companies.fleet_tracking_enabled is
  'Super-admin: company may use Fleet Tracking (SmartCar Tracker) in the rental app.';
comment on column public.companies.fleet_tracking_account is
  'SmartCar Tracker Open API account (company-entered).';
comment on column public.companies.fleet_tracking_password_encrypted is
  'AES-GCM ciphertext of API password (server-only; never expose to clients).';

alter table public.vehicles
  add column if not exists gps_primary_imei text;

alter table public.vehicles
  add column if not exists gps_secondary_imei text;

comment on column public.vehicles.gps_primary_imei is
  'Primary tracker IMEI (prefer VRM-imob when dual devices).';
comment on column public.vehicles.gps_secondary_imei is
  'Secondary tracker IMEI (plain VRM device when dual setup).';
