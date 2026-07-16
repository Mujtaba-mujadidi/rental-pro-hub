-- Rental / fleet clients managed by super-admins (B2B directory).

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  company_registration_number text,
  email text,
  phone text,
  address_line1 text,
  address_line2 text,
  address_town text,
  address_postcode text,
  country text not null default 'GB',
  status text not null default 'active' check (status in ('active', 'inactive', 'pending')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index companies_created_at_desc_idx on public.companies (created_at desc);
create index companies_name_lower_idx on public.companies (lower(name));
create index companies_status_idx on public.companies (status);

create or replace function public.companies_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger companies_set_updated_at
  before update on public.companies
  for each row execute procedure public.companies_set_updated_at();

alter table public.companies enable row level security;

create policy companies_select_super_admin
  on public.companies for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
  );

create policy companies_insert_super_admin
  on public.companies for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
  );

create policy companies_update_super_admin
  on public.companies for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
  );

create policy companies_delete_super_admin
  on public.companies for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
  );

comment on table public.companies is 'Fleet/rental client organisations; maintained by super-admins.';
