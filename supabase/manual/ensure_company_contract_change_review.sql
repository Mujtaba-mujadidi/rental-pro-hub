-- Fix: "Could not find the 'review_status' column of 'company_contract_change_requests' in the schema cache"
-- Run in Supabase SQL Editor for the same project as the app.
-- Safe to re-run (idempotent). Mirrors 20260724200000_company_contract_change_review.sql

alter table public.company_contract_change_requests
  add column if not exists transition_type text not null default 'detail_change',
  add column if not exists review_status text not null default 'pending_review',
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users (id) on delete set null,
  add column if not exists review_comment text,
  add column if not exists signatory_name text,
  add column if not exists signatory_email text,
  add column if not exists signatory_title text;

alter table public.company_contract_change_requests
  drop constraint if exists company_contract_change_requests_transition_type_check;

alter table public.company_contract_change_requests
  add constraint company_contract_change_requests_transition_type_check
  check (transition_type in ('detail_change', 'new_legal_entity'));

alter table public.company_contract_change_requests
  drop constraint if exists company_contract_change_requests_review_status_check;

alter table public.company_contract_change_requests
  add constraint company_contract_change_requests_review_status_check
  check (
    review_status in (
      'pending_review',
      'approved',
      'rejected',
      'awaiting_signature',
      'completed'
    )
  );

update public.company_contract_change_requests
set review_status = 'awaiting_signature'
where status = 'pending_signature'
  and review_status = 'pending_review';
