-- Idempotent: Fleet Tracking columns for companies + vehicles.
-- Run in Supabase SQL editor if migrations are not applied automatically.

alter table public.companies
  add column if not exists fleet_tracking_enabled boolean not null default false;

alter table public.companies
  add column if not exists fleet_tracking_account text;

alter table public.companies
  add column if not exists fleet_tracking_password_encrypted text;

alter table public.vehicles
  add column if not exists gps_primary_imei text;

alter table public.vehicles
  add column if not exists gps_secondary_imei text;
