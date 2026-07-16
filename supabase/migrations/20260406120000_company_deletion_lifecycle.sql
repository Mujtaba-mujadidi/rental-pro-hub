-- Offboarding lifecycle: soft-delete window, then access block, then super-admin purge.

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
