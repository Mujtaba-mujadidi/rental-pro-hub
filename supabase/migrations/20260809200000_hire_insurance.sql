-- Per-hire insurance: responsibility at contract creation, certificate upload by driver or company.

alter table public.companies
  add column if not exists notify_insurance_days_before integer not null default 28
    check (notify_insurance_days_before >= 0 and notify_insurance_days_before <= 365);

comment on column public.companies.notify_insurance_days_before is
  'Days before hire insurance expiry to show warnings in the UI.';

alter table public.vehicle_hire_groups
  add column if not exists insurance_provided_by text
    check (insurance_provided_by is null or insurance_provided_by in ('driver', 'company'));

comment on column public.vehicle_hire_groups.insurance_provided_by is
  'Who provides motor insurance for this hire — set in the contract wizard.';

-- ---------------------------------------------------------------------------
-- vehicle_hire_insurance (one certificate per hire)
-- ---------------------------------------------------------------------------

create table if not exists public.vehicle_hire_insurance (
  hire_group_id uuid primary key references public.vehicle_hire_groups (id) on delete cascade,
  parent_company_id uuid not null references public.companies (id) on delete cascade,
  insurance_type text not null
    check (insurance_type in ('tpo', 'tpft', 'fully_comprehensive')),
  expiry_date date not null,
  file_path text not null,
  file_name text,
  content_type text,
  uploaded_by_user_id uuid references auth.users (id) on delete set null,
  uploaded_by_role text not null
    check (uploaded_by_role in ('driver', 'company_staff')),
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create or replace function public.vehicle_hire_insurance_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists vehicle_hire_insurance_touch on public.vehicle_hire_insurance;
create trigger vehicle_hire_insurance_touch
  before update on public.vehicle_hire_insurance
  for each row execute procedure public.vehicle_hire_insurance_set_updated_at();

-- ---------------------------------------------------------------------------
-- Storage: hire-insurance-documents (private)
-- Path: {parent_company_id}/{hire_group_id}/{filename}
-- ---------------------------------------------------------------------------

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
