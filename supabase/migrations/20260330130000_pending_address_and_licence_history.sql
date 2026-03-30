-- Two-stage address update + document versioning
-- - Current verified address stays in address_* fields
-- - New submissions go into pending_address_* until verified by updated licence uploads
-- - Keep historical addresses and licence document versions for audit/disputes

alter table public.driver_profiles
  add column if not exists address_verified_at timestamptz not null default now(),
  add column if not exists pending_address_line1 text,
  add column if not exists pending_address_line2 text,
  add column if not exists pending_address_town text,
  add column if not exists pending_address_county text,
  add column if not exists pending_address_postcode text,
  add column if not exists pending_address_submitted_at timestamptz,
  add column if not exists pending_driving_licence_front_path text,
  add column if not exists pending_driving_licence_back_path text,
  add column if not exists pending_phv_licence_card_path text,
  add column if not exists pending_licence_uploaded_at timestamptz;

create table if not exists public.driver_address_history (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  address_line1 text not null,
  address_line2 text,
  address_town text not null,
  address_county text,
  address_postcode text not null,
  effective_from timestamptz not null,
  effective_to timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists driver_address_history_user_id_idx
  on public.driver_address_history (user_id, effective_from desc);

alter table public.driver_address_history enable row level security;

create policy driver_address_history_select_own
  on public.driver_address_history for select
  to authenticated
  using (user_id = auth.uid());

create table if not exists public.driver_licence_document_versions (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  slot text not null check (slot in ('driving_front','driving_back','phv')),
  object_path text not null,
  uploaded_at timestamptz not null,
  superseded_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists driver_licence_document_versions_user_id_idx
  on public.driver_licence_document_versions (user_id, uploaded_at desc);

alter table public.driver_licence_document_versions enable row level security;

create policy driver_licence_document_versions_select_own
  on public.driver_licence_document_versions for select
  to authenticated
  using (user_id = auth.uid());

