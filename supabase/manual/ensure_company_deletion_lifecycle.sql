-- Fix: missing companies.deletion_phase and/or public.company_deletion_archives
-- Progress: ../../docs/PROGRESS.md
-- Run in Supabase SQL Editor when migrations were not applied in order.
-- Safe to re-run: IF NOT EXISTS / DROP POLICY IF EXISTS where needed.

-- ---------------------------------------------------------------------------
-- 1) Archives table (from migration 20260405120000_company_deletion_archives)
-- ---------------------------------------------------------------------------

create table if not exists public.company_deletion_archives (
  id uuid primary key default gen_random_uuid(),
  former_company_id uuid not null,
  archived_at timestamptz not null default now(),
  archived_by uuid references auth.users (id) on delete set null,
  snapshot jsonb not null default '{}'::jsonb
);

create index if not exists company_deletion_archives_former_company_id_idx
  on public.company_deletion_archives (former_company_id);
create index if not exists company_deletion_archives_archived_at_idx
  on public.company_deletion_archives (archived_at desc);

comment on table public.company_deletion_archives is
  'JSON snapshot of company, contracts, billing, etc. taken immediately before DELETE from companies (CASCADE). Not FK-linked to companies so rows survive deletion.';

alter table public.company_deletion_archives enable row level security;

drop policy if exists company_deletion_archives_super_admin_all on public.company_deletion_archives;
create policy company_deletion_archives_super_admin_all
  on public.company_deletion_archives for all
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  );

-- ---------------------------------------------------------------------------
-- 2) Lifecycle columns on companies + link column on archives
--    (from migration 20260406120000_company_deletion_lifecycle)
-- ---------------------------------------------------------------------------

alter table public.companies
  add column if not exists deletion_phase text not null default 'active'
    check (deletion_phase in ('active', 'offboarding', 'access_blocked'));

alter table public.companies
  add column if not exists offboarding_started_at timestamptz,
  add column if not exists offboarding_ends_at timestamptz,
  add column if not exists access_blocked_at timestamptz,
  add column if not exists deletion_requested_by uuid references auth.users (id) on delete set null;

create index if not exists companies_deletion_phase_offboarding_ends_idx
  on public.companies (deletion_phase, offboarding_ends_at)
  where deletion_phase = 'offboarding';

comment on column public.companies.deletion_phase is
  'active: normal. offboarding: archived snapshot; rental users limited to export/read-only for retention window. access_blocked: tenant app blocked until super-admin purge or reactivate.';

alter table public.company_deletion_archives
  add column if not exists company_id uuid references public.companies (id) on delete set null;

create index if not exists company_deletion_archives_company_id_idx
  on public.company_deletion_archives (company_id)
  where company_id is not null;

comment on column public.company_deletion_archives.company_id is
  'Set while the company row still exists (offboarding); cleared on CASCADE when company is permanently deleted.';

notify pgrst, 'reload schema';
