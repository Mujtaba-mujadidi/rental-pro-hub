-- Subcompany workspace: logo, audit events, contract-impact requirements.

alter table public.subcompanies
  add column if not exists logo_storage_path text;

comment on column public.subcompanies.logo_storage_path is
  'Storage path in bucket subcompany-logos (private).';

insert into storage.buckets (id, name, public)
values ('subcompany-logos', 'subcompany-logos', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- subcompany_events (field-change audit)
-- ---------------------------------------------------------------------------

create table if not exists public.subcompany_events (
  id uuid primary key default gen_random_uuid(),
  subcompany_id uuid not null references public.subcompanies (id) on delete cascade,
  parent_company_id uuid not null references public.companies (id) on delete cascade,
  event_type text not null
    check (event_type in ('created', 'updated', 'logo_changed', 'deactivated', 'contracts_impact_answered')),
  actor_user_id uuid references auth.users (id) on delete set null,
  actor_role text,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists subcompany_events_subcompany_idx
  on public.subcompany_events (subcompany_id, created_at desc);

alter table public.subcompany_events enable row level security;

drop policy if exists subcompany_events_select on public.subcompany_events;
create policy subcompany_events_select on public.subcompany_events
  for select to authenticated
  using (public.user_can_access_subcompany(subcompany_id));

-- ---------------------------------------------------------------------------
-- Change batches + hire document update requirements
-- ---------------------------------------------------------------------------

create table if not exists public.subcompany_detail_change_batches (
  id uuid primary key default gen_random_uuid(),
  subcompany_id uuid not null references public.subcompanies (id) on delete cascade,
  parent_company_id uuid not null references public.companies (id) on delete cascade,
  changed_fields jsonb not null default '[]'::jsonb,
  contracts_need_update boolean not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists subcompany_detail_change_batches_subcompany_idx
  on public.subcompany_detail_change_batches (subcompany_id, created_at desc);

alter table public.subcompany_detail_change_batches enable row level security;

drop policy if exists subcompany_detail_change_batches_select on public.subcompany_detail_change_batches;
create policy subcompany_detail_change_batches_select on public.subcompany_detail_change_batches
  for select to authenticated
  using (public.user_can_access_subcompany(subcompany_id));

create table if not exists public.subcompany_hire_document_requirements (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.subcompany_detail_change_batches (id) on delete cascade,
  subcompany_id uuid not null references public.subcompanies (id) on delete cascade,
  hire_group_id uuid not null references public.vehicle_hire_groups (id) on delete cascade,
  document_kind text not null
    check (document_kind in ('hire_agreement', 'permission_letter')),
  agreement_id uuid references public.vehicle_hire_agreements (id) on delete set null,
  status text not null default 'required'
    check (status in ('required', 'completed', 'cancelled')),
  completed_at timestamptz,
  completed_by uuid references auth.users (id) on delete set null,
  completed_via text
    check (completed_via is null or completed_via in ('supersede_resign', 'regenerate_unsigned')),
  created_at timestamptz not null default now()
);

create index if not exists subcompany_hire_document_requirements_open_idx
  on public.subcompany_hire_document_requirements (subcompany_id, status)
  where status = 'required';

create index if not exists subcompany_hire_document_requirements_hire_idx
  on public.subcompany_hire_document_requirements (hire_group_id, status);

alter table public.subcompany_hire_document_requirements enable row level security;

drop policy if exists subcompany_hire_document_requirements_select on public.subcompany_hire_document_requirements;
create policy subcompany_hire_document_requirements_select on public.subcompany_hire_document_requirements
  for select to authenticated
  using (public.user_can_access_subcompany(subcompany_id));

-- Storage: staff with subcompany access; path = {parent_company_id}/{subcompany_id}/logo.*
drop policy if exists subcompany_logos_storage_select on storage.objects;
create policy subcompany_logos_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'subcompany-logos'
    and public.user_can_access_subcompany((storage.foldername(name))[2]::uuid)
  );

drop policy if exists subcompany_logos_storage_insert on storage.objects;
create policy subcompany_logos_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'subcompany-logos'
    and public.user_can_manage_fleet_for_subcompany((storage.foldername(name))[2]::uuid)
  );

drop policy if exists subcompany_logos_storage_update on storage.objects;
create policy subcompany_logos_storage_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'subcompany-logos'
    and public.user_can_manage_fleet_for_subcompany((storage.foldername(name))[2]::uuid)
  )
  with check (
    bucket_id = 'subcompany-logos'
    and public.user_can_manage_fleet_for_subcompany((storage.foldername(name))[2]::uuid)
  );

drop policy if exists subcompany_logos_storage_delete on storage.objects;
create policy subcompany_logos_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'subcompany-logos'
    and public.user_can_manage_fleet_for_subcompany((storage.foldername(name))[2]::uuid)
  );
