-- Idempotent ensure for hire checkout / check-in inspections.

create table if not exists public.vehicle_hire_inspections (
  id uuid primary key default gen_random_uuid(),
  hire_group_id uuid not null references public.vehicle_hire_groups (id) on delete cascade,
  parent_company_id uuid not null references public.companies (id) on delete cascade,
  kind text not null check (kind in ('checkout', 'checkin')),
  status text not null default 'draft' check (status in ('draft', 'completed')),
  odometer_reading integer check (odometer_reading is null or odometer_reading >= 0),
  fuel_level smallint check (fuel_level is null or (fuel_level >= 0 and fuel_level <= 100)),
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

alter table public.vehicle_hire_inspections enable row level security;
alter table public.vehicle_hire_inspection_damages enable row level security;
alter table public.vehicle_hire_inspection_media enable row level security;

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
