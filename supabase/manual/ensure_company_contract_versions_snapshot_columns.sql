-- Fix: "Could not find the 'commercial_snapshot' column of 'company_contract_versions' in the schema cache"
-- Progress: ../../docs/PROGRESS.md
-- Run in the Supabase SQL Editor for the same project as the app (.env.local).
-- Safe to re-run where noted. From migration 20260403210000_rental_contract_billing_platform.sql.

alter table public.company_contract_versions
  alter column signed_at drop not null;

alter table public.company_contract_versions
  add column if not exists version_status text not null default 'legacy_import'
    check (
      version_status in (
        'draft',
        'sent_for_signature',
        'viewed',
        'signed_by_customer',
        'active',
        'superseded',
        'expired',
        'terminated',
        'legacy_import'
      )
    ),
  add column if not exists template_used text,
  add column if not exists rendered_pdf_storage_path text,
  add column if not exists legal_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists pricing_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists commercial_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists sent_for_signature_at timestamptz,
  add column if not exists signed_by_customer_at timestamptz,
  add column if not exists countersigned_at timestamptz,
  add column if not exists superseded_at timestamptz,
  add column if not exists change_reason text,
  add column if not exists amendment_type text,
  add column if not exists created_by uuid references auth.users (id) on delete set null;

-- Backfill legal_snapshot / version_status from legacy snapshot column (idempotent for already-migrated rows).
update public.company_contract_versions
set
  legal_snapshot = coalesce(nullif(snapshot, '{}'::jsonb), '{}'::jsonb),
  version_status = 'legacy_import'
where legal_snapshot = '{}'::jsonb
  and snapshot is not null
  and snapshot <> '{}'::jsonb;
