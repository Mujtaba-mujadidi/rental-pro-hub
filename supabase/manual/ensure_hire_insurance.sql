-- Per-hire insurance (idempotent). Mirrors 20260809200000_hire_insurance.sql.

alter table public.companies
  add column if not exists notify_insurance_days_before integer not null default 28;

alter table public.companies
  drop constraint if exists companies_notify_insurance_days_before_check;
alter table public.companies
  add constraint companies_notify_insurance_days_before_check
  check (notify_insurance_days_before >= 0 and notify_insurance_days_before <= 365);

alter table public.vehicle_hire_groups
  add column if not exists insurance_provided_by text;

alter table public.vehicle_hire_groups
  drop constraint if exists vehicle_hire_groups_insurance_provided_by_check;
alter table public.vehicle_hire_groups
  add constraint vehicle_hire_groups_insurance_provided_by_check
  check (insurance_provided_by is null or insurance_provided_by in ('driver', 'company'));

create table if not exists public.vehicle_hire_insurance (
  hire_group_id uuid primary key references public.vehicle_hire_groups (id) on delete cascade,
  parent_company_id uuid not null references public.companies (id) on delete cascade,
  insurance_type text not null,
  expiry_date date not null,
  file_path text not null,
  file_name text,
  content_type text,
  uploaded_by_user_id uuid references auth.users (id) on delete set null,
  uploaded_by_role text not null,
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vehicle_hire_insurance
  drop constraint if exists vehicle_hire_insurance_insurance_type_check;
alter table public.vehicle_hire_insurance
  add constraint vehicle_hire_insurance_insurance_type_check
  check (insurance_type in ('tpo', 'tpft', 'fully_comprehensive'));

alter table public.vehicle_hire_insurance
  drop constraint if exists vehicle_hire_insurance_uploaded_by_role_check;
alter table public.vehicle_hire_insurance
  add constraint vehicle_hire_insurance_uploaded_by_role_check
  check (uploaded_by_role in ('driver', 'company_staff'));

create index if not exists vehicle_hire_insurance_company_expiry_idx
  on public.vehicle_hire_insurance (parent_company_id, expiry_date);

alter table public.vehicle_hire_insurance enable row level security;

drop policy if exists vehicle_hire_insurance_select on public.vehicle_hire_insurance;
create policy vehicle_hire_insurance_select on public.vehicle_hire_insurance
  for select to authenticated
  using (
    exists (
      select 1 from public.vehicle_hire_groups g
      where g.id = vehicle_hire_insurance.hire_group_id
        and (
          public.user_can_access_subcompany(g.subcompany_id)
          or g.driver_user_id = auth.uid()
        )
    )
  );

drop policy if exists vehicle_hire_insurance_insert on public.vehicle_hire_insurance;
create policy vehicle_hire_insurance_insert on public.vehicle_hire_insurance
  for insert to authenticated
  with check (
    exists (
      select 1 from public.vehicle_hire_groups g
      where g.id = vehicle_hire_insurance.hire_group_id
        and g.parent_company_id = vehicle_hire_insurance.parent_company_id
        and (
          (
            g.insurance_provided_by = 'company'
            and public.user_can_write_rentals_for_company(g.parent_company_id)
          )
          or (
            g.insurance_provided_by = 'driver'
            and g.driver_user_id = auth.uid()
          )
        )
    )
  );

drop policy if exists vehicle_hire_insurance_update on public.vehicle_hire_insurance;
create policy vehicle_hire_insurance_update on public.vehicle_hire_insurance
  for update to authenticated
  using (
    exists (
      select 1 from public.vehicle_hire_groups g
      where g.id = vehicle_hire_insurance.hire_group_id
        and (
          (
            g.insurance_provided_by = 'company'
            and public.user_can_write_rentals_for_company(g.parent_company_id)
          )
          or (
            g.insurance_provided_by = 'driver'
            and g.driver_user_id = auth.uid()
          )
        )
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'hire-insurance-documents',
  'hire-insurance-documents',
  false,
  12582912,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists hire_insurance_documents_storage_select on storage.objects;
create policy hire_insurance_documents_storage_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'hire-insurance-documents'
    and (
      exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
      or exists (
        select 1 from public.user_company_memberships m
        where m.user_id = auth.uid()
          and m.status = 'active'
          and m.parent_company_id::text = (storage.foldername(name))[1]
      )
      or exists (
        select 1 from public.vehicle_hire_groups g
        where g.driver_user_id = auth.uid()
          and g.id::text = (storage.foldername(name))[2]
      )
    )
  );

drop policy if exists hire_insurance_documents_storage_insert on storage.objects;
create policy hire_insurance_documents_storage_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'hire-insurance-documents'
    and (
      exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
      or exists (
        select 1
        from public.vehicle_hire_groups g
        where g.id::text = (storage.foldername(name))[2]
          and g.parent_company_id::text = (storage.foldername(name))[1]
          and (
            (
              g.insurance_provided_by = 'company'
              and exists (
                select 1 from public.user_company_memberships m
                where m.user_id = auth.uid()
                  and m.status = 'active'
                  and m.role in ('owner', 'admin', 'operations')
                  and m.parent_company_id = g.parent_company_id
              )
            )
            or (g.insurance_provided_by = 'driver' and g.driver_user_id = auth.uid())
          )
      )
    )
  );

drop policy if exists hire_insurance_documents_storage_delete on storage.objects;
create policy hire_insurance_documents_storage_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'hire-insurance-documents'
    and (
      exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
      or exists (
        select 1
        from public.vehicle_hire_groups g
        where g.id::text = (storage.foldername(name))[2]
          and g.parent_company_id::text = (storage.foldername(name))[1]
          and (
            (
              g.insurance_provided_by = 'company'
              and exists (
                select 1 from public.user_company_memberships m
                where m.user_id = auth.uid()
                  and m.status = 'active'
                  and m.role in ('owner', 'admin', 'operations')
                  and m.parent_company_id = g.parent_company_id
              )
            )
            or (g.insurance_provided_by = 'driver' and g.driver_user_id = auth.uid())
          )
      )
    )
  );
