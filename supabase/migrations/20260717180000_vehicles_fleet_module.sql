-- Vehicle fleet module (Phase 2 first slice): vehicles, transfers, documents + RLS.
-- Tenancy: parent company → subcompany → vehicle. Staff scoped like subcompanies.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Helpers: subcompany visibility / fleet write (membership + scope)
-- ---------------------------------------------------------------------------

create or replace function public.user_can_access_subcompany(p_subcompany_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.subcompanies s
    join public.user_company_memberships m
      on m.parent_company_id = s.parent_company_id
     and m.user_id = auth.uid()
     and m.status = 'active'
    where s.id = p_subcompany_id
      and (
        m.subcompany_scope = 'all'
        or exists (
          select 1 from public.user_subcompany_permissions usp
          where usp.membership_id = m.id
            and usp.subcompany_id = s.id
        )
      )
  );
$$;

revoke all on function public.user_can_access_subcompany(uuid) from public;
grant execute on function public.user_can_access_subcompany(uuid) to authenticated;

create or replace function public.user_can_manage_fleet_for_subcompany(p_subcompany_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.subcompanies s
    join public.user_company_memberships m
      on m.parent_company_id = s.parent_company_id
     and m.user_id = auth.uid()
     and m.status = 'active'
     and m.role in ('owner', 'admin', 'operations')
    where s.id = p_subcompany_id
      and (
        m.subcompany_scope = 'all'
        or exists (
          select 1 from public.user_subcompany_permissions usp
          where usp.membership_id = m.id
            and usp.subcompany_id = s.id
        )
      )
  );
$$;

revoke all on function public.user_can_manage_fleet_for_subcompany(uuid) from public;
grant execute on function public.user_can_manage_fleet_for_subcompany(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- vehicles
-- ---------------------------------------------------------------------------

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  parent_company_id uuid not null references public.companies (id) on delete cascade,
  subcompany_id uuid not null references public.subcompanies (id) on delete restrict,
  vrm text not null,
  make text not null,
  model text not null,
  colour text,
  first_reg_date date,
  first_reg_uk_date date,
  fuel_type text,
  seats integer check (seats is null or (seats >= 1 and seats <= 99)),
  cc integer check (cc is null or (cc >= 0 and cc <= 20000)),
  mot_expiry date,
  tax_expiry date,
  phv_licence_no text,
  phv_licence_expiry date,
  licensing_authority_name text,
  status text not null default 'available'
    check (status in ('available', 'on_rent', 'reserved', 'repair', 'accident_claim')),
  vehicle_age_limit_years integer check (vehicle_age_limit_years is null or vehicle_age_limit_years > 0),
  service_due_at date,
  current_mileage integer check (current_mileage is null or current_mileage >= 0),
  next_service_mileage integer check (next_service_mileage is null or next_service_mileage >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicles_vrm_company_unique unique (parent_company_id, vrm)
);

create index if not exists vehicles_parent_company_id_idx on public.vehicles (parent_company_id);
create index if not exists vehicles_subcompany_id_idx on public.vehicles (subcompany_id);
create index if not exists vehicles_status_idx on public.vehicles (status);
create index if not exists vehicles_mot_expiry_idx on public.vehicles (mot_expiry);
create index if not exists vehicles_vrm_lower_idx on public.vehicles (lower(vrm));

comment on table public.vehicles is 'Fleet vehicles scoped to a parent company and current subcompany branch.';
comment on column public.vehicles.vrm is 'Normalised registration mark (uppercase, no spaces), unique per parent company.';
comment on column public.vehicles.status is 'available=off rent; on_rent may be set manually until hire module drives it.';

create or replace function public.vehicles_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists vehicles_set_updated_at on public.vehicles;
create trigger vehicles_set_updated_at
  before update on public.vehicles
  for each row execute function public.vehicles_set_updated_at();

-- Keep parent_company_id aligned with subcompany parent
create or replace function public.vehicles_enforce_parent_matches_subcompany()
returns trigger
language plpgsql
as $$
declare
  expected uuid;
begin
  select s.parent_company_id into expected from public.subcompanies s where s.id = new.subcompany_id;
  if expected is null then
    raise exception 'subcompany not found';
  end if;
  if new.parent_company_id is distinct from expected then
    raise exception 'parent_company_id must match subcompany parent';
  end if;
  return new;
end;
$$;

drop trigger if exists vehicles_enforce_parent_matches_subcompany on public.vehicles;
create trigger vehicles_enforce_parent_matches_subcompany
  before insert or update of parent_company_id, subcompany_id on public.vehicles
  for each row execute function public.vehicles_enforce_parent_matches_subcompany();

alter table public.vehicles enable row level security;

drop policy if exists vehicles_select_super_admin on public.vehicles;
create policy vehicles_select_super_admin
  on public.vehicles for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'));

drop policy if exists vehicles_mutate_super_admin on public.vehicles;
create policy vehicles_mutate_super_admin
  on public.vehicles for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'));

drop policy if exists vehicles_select_rental on public.vehicles;
create policy vehicles_select_rental
  on public.vehicles for select to authenticated
  using (public.user_can_access_subcompany(subcompany_id));

drop policy if exists vehicles_insert_rental on public.vehicles;
create policy vehicles_insert_rental
  on public.vehicles for insert to authenticated
  with check (public.user_can_manage_fleet_for_subcompany(subcompany_id));

drop policy if exists vehicles_update_rental on public.vehicles;
create policy vehicles_update_rental
  on public.vehicles for update to authenticated
  using (public.user_can_manage_fleet_for_subcompany(subcompany_id))
  with check (public.user_can_manage_fleet_for_subcompany(subcompany_id));

drop policy if exists vehicles_delete_rental on public.vehicles;
create policy vehicles_delete_rental
  on public.vehicles for delete to authenticated
  using (
    exists (
      select 1 from public.user_company_memberships m
      where m.user_id = auth.uid()
        and m.parent_company_id = vehicles.parent_company_id
        and m.status = 'active'
        and m.role in ('owner', 'admin')
    )
  );

-- ---------------------------------------------------------------------------
-- vehicle_transfers (audit trail)
-- ---------------------------------------------------------------------------

create table if not exists public.vehicle_transfers (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  parent_company_id uuid not null references public.companies (id) on delete cascade,
  from_subcompany_id uuid not null references public.subcompanies (id) on delete restrict,
  to_subcompany_id uuid not null references public.subcompanies (id) on delete restrict,
  transferred_by uuid references auth.users (id) on delete set null,
  transferred_at timestamptz not null default now(),
  notes text,
  constraint vehicle_transfers_distinct_branches check (from_subcompany_id <> to_subcompany_id)
);

create index if not exists vehicle_transfers_vehicle_id_idx on public.vehicle_transfers (vehicle_id);
create index if not exists vehicle_transfers_parent_company_id_idx on public.vehicle_transfers (parent_company_id);

alter table public.vehicle_transfers enable row level security;

drop policy if exists vehicle_transfers_select_super_admin on public.vehicle_transfers;
create policy vehicle_transfers_select_super_admin
  on public.vehicle_transfers for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'));

drop policy if exists vehicle_transfers_select_rental on public.vehicle_transfers;
create policy vehicle_transfers_select_rental
  on public.vehicle_transfers for select to authenticated
  using (
    exists (
      select 1 from public.user_company_memberships m
      where m.user_id = auth.uid()
        and m.parent_company_id = vehicle_transfers.parent_company_id
        and m.status = 'active'
    )
  );

drop policy if exists vehicle_transfers_insert_rental on public.vehicle_transfers;
create policy vehicle_transfers_insert_rental
  on public.vehicle_transfers for insert to authenticated
  with check (
    public.user_can_manage_fleet_for_subcompany(from_subcompany_id)
    and public.user_can_manage_fleet_for_subcompany(to_subcompany_id)
  );

-- ---------------------------------------------------------------------------
-- vehicle_documents
-- ---------------------------------------------------------------------------

create table if not exists public.vehicle_documents (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  parent_company_id uuid not null references public.companies (id) on delete cascade,
  doc_type text not null
    check (doc_type in ('mot', 'phv_licence', 'logbook', 'insurance', 'permission_letter', 'photo', 'other')),
  file_path text not null,
  file_name text,
  content_type text,
  expiry_date date,
  issued_date date,
  notes text,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists vehicle_documents_vehicle_id_idx on public.vehicle_documents (vehicle_id);
create index if not exists vehicle_documents_expiry_idx on public.vehicle_documents (expiry_date);

alter table public.vehicle_documents enable row level security;

drop policy if exists vehicle_documents_select_super_admin on public.vehicle_documents;
create policy vehicle_documents_select_super_admin
  on public.vehicle_documents for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'));

drop policy if exists vehicle_documents_mutate_super_admin on public.vehicle_documents;
create policy vehicle_documents_mutate_super_admin
  on public.vehicle_documents for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'));

drop policy if exists vehicle_documents_select_rental on public.vehicle_documents;
create policy vehicle_documents_select_rental
  on public.vehicle_documents for select to authenticated
  using (
    exists (
      select 1 from public.vehicles v
      where v.id = vehicle_documents.vehicle_id
        and public.user_can_access_subcompany(v.subcompany_id)
    )
  );

drop policy if exists vehicle_documents_insert_rental on public.vehicle_documents;
create policy vehicle_documents_insert_rental
  on public.vehicle_documents for insert to authenticated
  with check (
    exists (
      select 1 from public.vehicles v
      where v.id = vehicle_documents.vehicle_id
        and public.user_can_manage_fleet_for_subcompany(v.subcompany_id)
    )
  );

drop policy if exists vehicle_documents_delete_rental on public.vehicle_documents;
create policy vehicle_documents_delete_rental
  on public.vehicle_documents for delete to authenticated
  using (
    exists (
      select 1 from public.vehicles v
      where v.id = vehicle_documents.vehicle_id
        and public.user_can_manage_fleet_for_subcompany(v.subcompany_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Storage: vehicle-documents (private)
-- Path: {parent_company_id}/{vehicle_id}/{filename}
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vehicle-documents',
  'vehicle-documents',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists vehicle_documents_storage_select on storage.objects;
create policy vehicle_documents_storage_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'vehicle-documents'
    and (
      exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
      or exists (
        select 1 from public.user_company_memberships m
        where m.user_id = auth.uid()
          and m.status = 'active'
          and m.parent_company_id::text = (storage.foldername(name))[1]
      )
    )
  );

drop policy if exists vehicle_documents_storage_insert on storage.objects;
create policy vehicle_documents_storage_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'vehicle-documents'
    and (
      exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
      or exists (
        select 1 from public.user_company_memberships m
        where m.user_id = auth.uid()
          and m.status = 'active'
          and m.role in ('owner', 'admin', 'operations')
          and m.parent_company_id::text = (storage.foldername(name))[1]
      )
    )
  );

drop policy if exists vehicle_documents_storage_delete on storage.objects;
create policy vehicle_documents_storage_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'vehicle-documents'
    and (
      exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
      or exists (
        select 1 from public.user_company_memberships m
        where m.user_id = auth.uid()
          and m.status = 'active'
          and m.role in ('owner', 'admin', 'operations')
          and m.parent_company_id::text = (storage.foldername(name))[1]
      )
    )
  );
