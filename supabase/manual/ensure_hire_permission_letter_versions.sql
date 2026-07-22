-- Idempotent: versioned hire permission letters (see 20260722200000_hire_permission_letter_versions.sql)

create table if not exists public.company_hire_permission_letter_versions (
  id uuid primary key default gen_random_uuid(),
  parent_company_id uuid not null references public.companies (id) on delete cascade,
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

create index if not exists company_hire_permission_letter_versions_company_status_idx
  on public.company_hire_permission_letter_versions (parent_company_id, status);
create index if not exists company_hire_permission_letter_versions_company_created_idx
  on public.company_hire_permission_letter_versions (parent_company_id, created_at desc);

create or replace function public.company_hire_permission_letter_versions_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists company_hire_permission_letter_versions_touch on public.company_hire_permission_letter_versions;
create trigger company_hire_permission_letter_versions_touch
  before update on public.company_hire_permission_letter_versions
  for each row execute procedure public.company_hire_permission_letter_versions_set_updated_at();

alter table public.company_hire_permission_letter_versions enable row level security;

drop policy if exists company_hire_permission_letter_versions_select on public.company_hire_permission_letter_versions;
create policy company_hire_permission_letter_versions_select on public.company_hire_permission_letter_versions
  for select to authenticated
  using (public.user_is_active_company_member(parent_company_id));

drop policy if exists company_hire_permission_letter_versions_write on public.company_hire_permission_letter_versions;
create policy company_hire_permission_letter_versions_write on public.company_hire_permission_letter_versions
  for all to authenticated
  using (public.user_can_manage_company_settings(parent_company_id))
  with check (public.user_can_manage_company_settings(parent_company_id));
