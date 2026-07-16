-- Subcompanies managed by rental companies under their tenant company.

create table if not exists public.subcompanies (
  id uuid primary key default gen_random_uuid(),
  parent_company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  legal_name text,
  company_number text,
  registered_address_line1 text,
  registered_address_line2 text,
  registered_town text,
  registered_county text,
  registered_postcode text,
  country text not null default 'GB',
  primary_contact_first_name text not null,
  primary_contact_last_name text not null,
  primary_contact_dob date not null,
  primary_contact_phone text not null,
  primary_contact_email text not null,
  status text not null default 'active' check (status in ('active', 'inactive', 'pending')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subcompanies_parent_company_id_idx on public.subcompanies (parent_company_id);
create index if not exists subcompanies_created_at_desc_idx on public.subcompanies (created_at desc);
create index if not exists subcompanies_name_lower_idx on public.subcompanies (lower(name));
create index if not exists subcompanies_status_idx on public.subcompanies (status);

create or replace function public.subcompanies_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists subcompanies_set_updated_at on public.subcompanies;
create trigger subcompanies_set_updated_at
  before update on public.subcompanies
  for each row execute procedure public.subcompanies_set_updated_at();

alter table public.subcompanies enable row level security;

create policy subcompanies_select_super_admin
  on public.subcompanies for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
  );

create policy subcompanies_insert_super_admin
  on public.subcompanies for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
  );

create policy subcompanies_update_super_admin
  on public.subcompanies for update
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

create policy subcompanies_delete_super_admin
  on public.subcompanies for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
  );

create policy subcompanies_select_rental_company
  on public.subcompanies for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'rental_company'
        and p.company_id = subcompanies.parent_company_id
    )
  );

create policy subcompanies_insert_rental_company
  on public.subcompanies for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'rental_company'
        and p.company_id = subcompanies.parent_company_id
    )
  );

create policy subcompanies_update_rental_company
  on public.subcompanies for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'rental_company'
        and p.company_id = subcompanies.parent_company_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'rental_company'
        and p.company_id = subcompanies.parent_company_id
    )
  );

create policy subcompanies_delete_rental_company
  on public.subcompanies for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'rental_company'
        and p.company_id = subcompanies.parent_company_id
    )
  );

comment on table public.subcompanies is 'Subcompanies (branches/entities) owned by a rental parent company.';
