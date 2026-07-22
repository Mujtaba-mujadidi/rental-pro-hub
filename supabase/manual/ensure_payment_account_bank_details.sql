-- Idempotent: bank details on payment accounts + hire FK consolidation.

alter table public.company_payment_accounts
  add column if not exists payee_name text,
  add column if not exists sort_code text,
  add column if not exists account_number text,
  add column if not exists payment_reference_hint text,
  add column if not exists show_to_hirer boolean not null default false;

-- If hire module used company_hire_bank_accounts, run full migration:
-- supabase/migrations/20260722110000_payment_account_bank_details.sql
