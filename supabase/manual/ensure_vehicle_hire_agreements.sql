-- Idempotent ensure for vehicle hire module. Safe to re-run.

\ir ensure_company_notification_settings.sql

alter table public.companies
  add column if not exists notify_contract_expiry_days_before integer not null default 28;

do $$ begin
  alter table public.companies
    add constraint companies_notify_contract_expiry_days_before_check
    check (notify_contract_expiry_days_before >= 0 and notify_contract_expiry_days_before <= 365);
exception when duplicate_object then null;
end $$;

-- Full schema: run migration 20260722100000_vehicle_hire_agreements.sql on fresh DBs.
-- This file mirrors that migration for manual apply on existing Supabase projects.
