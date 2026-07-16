-- Immutable snapshot of legal/financial tenant data before super-admin hard-deletes a company.

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

create policy company_deletion_archives_super_admin_all
  on public.company_deletion_archives for all
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  );
