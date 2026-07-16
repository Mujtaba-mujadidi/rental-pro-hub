-- Run this in Supabase Dashboard → SQL Editor if you see:
--   "Could not find the table 'public.contract_terms_versions' in the schema cache"
-- Safe to re-run: uses IF NOT EXISTS / DROP POLICY IF EXISTS where needed.

-- companies: invite-after-sign flag
alter table public.companies
  add column if not exists pending_primary_invite_after_contract_signed boolean not null default false;

comment on column public.companies.pending_primary_invite_after_contract_signed is
  'When true, send primary-contact Auth invite after the rental contract is signed (e-sign webhook), then clear.';

-- catalog table
create table if not exists public.contract_terms_versions (
  id uuid primary key default gen_random_uuid(),
  family text not null default 'rental_master',
  version_label text not null,
  title text not null,
  body text not null,
  body_hash text not null,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  published_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contract_terms_versions_family_status_idx
  on public.contract_terms_versions (family, status);
create index if not exists contract_terms_versions_published_at_idx
  on public.contract_terms_versions (published_at desc);

create or replace function public.contract_terms_versions_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists contract_terms_versions_touch on public.contract_terms_versions;
create trigger contract_terms_versions_touch
  before update on public.contract_terms_versions
  for each row execute procedure public.contract_terms_versions_set_updated_at();

alter table public.contract_terms_versions enable row level security;

drop policy if exists contract_terms_versions_super_admin_all on public.contract_terms_versions;
create policy contract_terms_versions_super_admin_all
  on public.contract_terms_versions for all
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  );

drop policy if exists contract_terms_versions_select_published_rental on public.contract_terms_versions;
create policy contract_terms_versions_select_published_rental
  on public.contract_terms_versions for select
  to authenticated
  using (
    status = 'published'
    and exists (
      select 1
      from public.user_company_memberships m
      where m.user_id = auth.uid()
        and m.status = 'active'
    )
  );

-- snapshot columns on contract versions (requires contract_terms_versions to exist for FK)
alter table public.company_contract_versions
  add column if not exists terms_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists terms_catalog_version_id uuid references public.contract_terms_versions (id) on delete set null;

comment on column public.company_contract_versions.terms_snapshot is
  'Immutable copy of T&C (metadata + optional full body) at contract creation/signing; not updated when catalog publishes new versions.';

-- Ask PostgREST to reload schema (fixes "not in schema cache" after DDL)
notify pgrst, 'reload schema';
