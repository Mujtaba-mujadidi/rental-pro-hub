-- Versioned permission letters (mirrors company_hire_terms_versions).

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

-- Migrate legacy single-row table into version history.
insert into public.company_hire_permission_letter_versions (
  parent_company_id,
  version_label,
  title,
  body,
  body_hash,
  status,
  published_at,
  published_by,
  created_at,
  updated_at
)
select
  p.parent_company_id,
  case when p.published_at is not null then '1' else 'draft' end,
  p.title,
  p.body,
  encode(sha256(convert_to(coalesce(p.body, ''), 'UTF8')), 'hex'),
  case when p.published_at is not null then 'published' else 'draft' end,
  p.published_at,
  p.published_by,
  coalesce(p.published_at, p.updated_at, now()),
  coalesce(p.updated_at, now())
from public.company_hire_permission_letters p
where not exists (
  select 1
  from public.company_hire_permission_letter_versions v
  where v.parent_company_id = p.parent_company_id
);
