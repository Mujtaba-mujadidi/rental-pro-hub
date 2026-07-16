-- Fix: "Could not find the 'billing_anchor_day' column of 'company_contracts' in the schema cache"
-- Progress: ../../docs/PROGRESS.md
-- Run in the Supabase SQL Editor for the same project as the app (.env.local).
-- Safe to re-run (idempotent). Aligns with migration 20260403210000_rental_contract_billing_platform.sql
-- (commercial columns on company_contracts only — does not recreate billing tables).

alter table public.company_contracts
  add column if not exists contract_number text,
  add column if not exists contract_type text,
  add column if not exists pricing_model text,
  add column if not exists billing_frequency text,
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists is_ongoing boolean not null default true,
  add column if not exists auto_renew boolean not null default false,
  add column if not exists notice_period_days integer,
  add column if not exists currency text not null default 'GBP',
  add column if not exists payment_terms_days integer,
  add column if not exists billing_anchor_day integer,
  add column if not exists contract_signed_at timestamptz,
  add column if not exists terminated_at timestamptz,
  add column if not exists termination_reason text,
  add column if not exists internal_notes text,
  add column if not exists legacy_bootstrap_signed boolean not null default false;

comment on column public.company_contracts.legacy_bootstrap_signed is
  'True when v1 was created before e-sign (pre-platform attestation); not a DocuSeal-signed flow.';

create unique index if not exists company_contracts_contract_number_key
  on public.company_contracts (contract_number)
  where contract_number is not null;
