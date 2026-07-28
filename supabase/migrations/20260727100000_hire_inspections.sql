-- Hire checkout / check-in inspections with panel damage marking and photos.

-- ---------------------------------------------------------------------------
-- vehicle_hire_inspections
-- ---------------------------------------------------------------------------

create table if not exists public.vehicle_hire_inspections (
  id uuid primary key default gen_random_uuid(),
  hire_group_id uuid not null references public.vehicle_hire_groups (id) on delete cascade,
  parent_company_id uuid not null references public.companies (id) on delete cascade,
  kind text not null check (kind in ('checkout', 'checkin')),
  status text not null default 'draft' check (status in ('draft', 'completed')),
  odometer_reading integer check (odometer_reading is null or odometer_reading >= 0),
  fuel_level text check (
    fuel_level is null
    or fuel_level in ('empty', 'quarter', 'half', 'three_quarter', 'full')
  ),
  general_notes text,
  completed_at timestamptz,
  completed_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vehicle_hire_inspections_group_kind_idx
  on public.vehicle_hire_inspections (hire_group_id, kind, status);

create unique index if not exists vehicle_hire_inspections_one_completed_checkout_uidx
  on public.vehicle_hire_inspections (hire_group_id)
  where kind = 'checkout' and status = 'completed';

create unique index if not exists vehicle_hire_inspections_one_completed_checkin_uidx
  on public.vehicle_hire_inspections (hire_group_id)
  where kind = 'checkin' and status = 'completed';

create or replace function public.vehicle_hire_inspections_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists vehicle_hire_inspections_touch on public.vehicle_hire_inspections;
create trigger vehicle_hire_inspections_touch
  before update on public.vehicle_hire_inspections
  for each row execute procedure public.vehicle_hire_inspections_set_updated_at();

-- ---------------------------------------------------------------------------
-- vehicle_hire_inspection_damages
-- ---------------------------------------------------------------------------

create table if not exists public.vehicle_hire_inspection_damages (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.vehicle_hire_inspections (id) on delete cascade,
  panel_id text not null,
  damage_type text not null check (
    damage_type in ('scratch', 'dent', 'chip', 'crack', 'scuff', 'other')
  ),
  severity text not null check (severity in ('minor', 'moderate', 'major')),
  notes text,
  checkout_damage_id uuid references public.vehicle_hire_inspection_damages (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vehicle_hire_inspection_damages_inspection_idx
  on public.vehicle_hire_inspection_damages (inspection_id);

create or replace function public.vehicle_hire_inspection_damages_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists vehicle_hire_inspection_damages_touch on public.vehicle_hire_inspection_damages;
create trigger vehicle_hire_inspection_damages_touch
  before update on public.vehicle_hire_inspection_damages
  for each row execute procedure public.vehicle_hire_inspection_damages_set_updated_at();

-- ---------------------------------------------------------------------------
-- vehicle_hire_inspection_media
-- ---------------------------------------------------------------------------

create table if not exists public.vehicle_hire_inspection_media (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.vehicle_hire_inspections (id) on delete cascade,
  damage_id uuid references public.vehicle_hire_inspection_damages (id) on delete set null,
  file_path text not null,
  caption text,
  sort_order integer not null default 0,
  uploaded_by_user_id uuid references auth.users (id) on delete set null,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists vehicle_hire_inspection_media_inspection_idx
  on public.vehicle_hire_inspection_media (inspection_id, sort_order);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.vehicle_hire_inspections enable row level security;
alter table public.vehicle_hire_inspection_damages enable row level security;
alter table public.vehicle_hire_inspection_media enable row level security;

drop policy if exists vehicle_hire_inspections_select on public.vehicle_hire_inspections;
create policy vehicle_hire_inspections_select on public.vehicle_hire_inspections
  for select to authenticated
  using (
    public.user_can_read_rentals_for_company(parent_company_id)
    or exists (
      select 1 from public.vehicle_hire_groups g
      where g.id = vehicle_hire_inspections.hire_group_id
        and g.driver_user_id = auth.uid()
        and vehicle_hire_inspections.status = 'completed'
    )
  );

drop policy if exists vehicle_hire_inspections_write on public.vehicle_hire_inspections;
create policy vehicle_hire_inspections_write on public.vehicle_hire_inspections
  for all to authenticated
  using (public.user_can_write_rentals_for_company(parent_company_id))
  with check (public.user_can_write_rentals_for_company(parent_company_id));

drop policy if exists vehicle_hire_inspection_damages_select on public.vehicle_hire_inspection_damages;
create policy vehicle_hire_inspection_damages_select on public.vehicle_hire_inspection_damages
  for select to authenticated
  using (
    exists (
      select 1 from public.vehicle_hire_inspections i
      where i.id = vehicle_hire_inspection_damages.inspection_id
        and (
          public.user_can_read_rentals_for_company(i.parent_company_id)
          or exists (
            select 1 from public.vehicle_hire_groups g
            where g.id = i.hire_group_id
              and g.driver_user_id = auth.uid()
              and i.status = 'completed'
          )
        )
    )
  );

drop policy if exists vehicle_hire_inspection_damages_write on public.vehicle_hire_inspection_damages;
create policy vehicle_hire_inspection_damages_write on public.vehicle_hire_inspection_damages
  for all to authenticated
  using (
    exists (
      select 1 from public.vehicle_hire_inspections i
      where i.id = vehicle_hire_inspection_damages.inspection_id
        and i.status = 'draft'
        and public.user_can_write_rentals_for_company(i.parent_company_id)
    )
  )
  with check (
    exists (
      select 1 from public.vehicle_hire_inspections i
      where i.id = vehicle_hire_inspection_damages.inspection_id
        and i.status = 'draft'
        and public.user_can_write_rentals_for_company(i.parent_company_id)
    )
  );

drop policy if exists vehicle_hire_inspection_media_select on public.vehicle_hire_inspection_media;
create policy vehicle_hire_inspection_media_select on public.vehicle_hire_inspection_media
  for select to authenticated
  using (
    exists (
      select 1 from public.vehicle_hire_inspections i
      where i.id = vehicle_hire_inspection_media.inspection_id
        and (
          public.user_can_read_rentals_for_company(i.parent_company_id)
          or exists (
            select 1 from public.vehicle_hire_groups g
            where g.id = i.hire_group_id
              and g.driver_user_id = auth.uid()
              and i.status = 'completed'
          )
        )
    )
  );

drop policy if exists vehicle_hire_inspection_media_write on public.vehicle_hire_inspection_media;
create policy vehicle_hire_inspection_media_write on public.vehicle_hire_inspection_media
  for all to authenticated
  using (
    exists (
      select 1 from public.vehicle_hire_inspections i
      where i.id = vehicle_hire_inspection_media.inspection_id
        and i.status = 'draft'
        and public.user_can_write_rentals_for_company(i.parent_company_id)
    )
  )
  with check (
    exists (
      select 1 from public.vehicle_hire_inspections i
      where i.id = vehicle_hire_inspection_media.inspection_id
        and i.status = 'draft'
        and public.user_can_write_rentals_for_company(i.parent_company_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Storage: hire-inspection-media (private)
-- Path: {parent_company_id}/{hire_group_id}/{inspection_id}/{filename}
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'hire-inspection-media',
  'hire-inspection-media',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists hire_inspection_media_storage_select on storage.objects;
create policy hire_inspection_media_storage_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'hire-inspection-media'
    and (
      exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
      or exists (
        select 1 from public.user_company_memberships m
        where m.user_id = auth.uid()
          and m.status = 'active'
          and m.parent_company_id::text = (storage.foldername(name))[1]
      )
      or exists (
        select 1
        from public.vehicle_hire_inspections i
        join public.vehicle_hire_groups g on g.id = i.hire_group_id
        where g.driver_user_id = auth.uid()
          and i.status = 'completed'
          and i.id::text = (storage.foldername(name))[3]
      )
    )
  );

drop policy if exists hire_inspection_media_storage_insert on storage.objects;
create policy hire_inspection_media_storage_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'hire-inspection-media'
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

drop policy if exists hire_inspection_media_storage_delete on storage.objects;
create policy hire_inspection_media_storage_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'hire-inspection-media'
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
