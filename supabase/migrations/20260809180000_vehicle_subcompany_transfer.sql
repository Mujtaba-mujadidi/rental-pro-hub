-- Vehicle subcompany transfer: intents, document requirements, doc versioning, inspection carry-over.

-- ---------------------------------------------------------------------------
-- vehicle_documents versioning (supersede — never delete historical files)
-- ---------------------------------------------------------------------------

alter table public.vehicle_documents
  add column if not exists version_status text not null default 'current'
    check (version_status in ('current', 'superseded'));

alter table public.vehicle_documents
  add column if not exists supersedes_document_id uuid
    references public.vehicle_documents (id) on delete set null;

alter table public.vehicle_documents
  add column if not exists vehicle_transfer_id uuid;

create index if not exists vehicle_documents_current_by_vehicle_type_idx
  on public.vehicle_documents (vehicle_id, doc_type)
  where version_status = 'current';

-- ---------------------------------------------------------------------------
-- vehicle_transfers — link supersession hires
-- ---------------------------------------------------------------------------

alter table public.vehicle_transfers
  add column if not exists transfer_intent_id uuid;

alter table public.vehicle_transfers
  add column if not exists superseded_hire_group_id uuid
    references public.vehicle_hire_groups (id) on delete set null;

alter table public.vehicle_transfers
  add column if not exists supersession_hire_group_id uuid
    references public.vehicle_hire_groups (id) on delete set null;

-- ---------------------------------------------------------------------------
-- vehicle_hire_inspections — mirrored check-in + checkout carry-over
-- ---------------------------------------------------------------------------

alter table public.vehicle_hire_inspections
  add column if not exists completion_mode text not null default 'physical'
    check (completion_mode in ('physical', 'mirrored'));

alter table public.vehicle_hire_inspections
  add column if not exists mirrored_from_inspection_id uuid
    references public.vehicle_hire_inspections (id) on delete set null;

alter table public.vehicle_hire_inspections
  add column if not exists carried_from_inspection_id uuid
    references public.vehicle_hire_inspections (id) on delete set null;

alter table public.vehicle_hire_inspections
  add column if not exists transfer_intent_id uuid;

-- ---------------------------------------------------------------------------
-- vehicle_subcompany_transfer_intents
-- ---------------------------------------------------------------------------

create table if not exists public.vehicle_subcompany_transfer_intents (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  parent_company_id uuid not null references public.companies (id) on delete cascade,
  from_subcompany_id uuid not null references public.subcompanies (id) on delete restrict,
  to_subcompany_id uuid not null references public.subcompanies (id) on delete restrict,
  superseded_hire_group_id uuid references public.vehicle_hire_groups (id) on delete set null,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed', 'cancelled')),
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  cancelled_at timestamptz,
  constraint vehicle_subcompany_transfer_intents_distinct_branches
    check (from_subcompany_id <> to_subcompany_id)
);

create index if not exists vehicle_subcompany_transfer_intents_vehicle_idx
  on public.vehicle_subcompany_transfer_intents (vehicle_id, status, created_at desc);

alter table public.vehicle_subcompany_transfer_intents enable row level security;

drop policy if exists vehicle_subcompany_transfer_intents_select on public.vehicle_subcompany_transfer_intents;
create policy vehicle_subcompany_transfer_intents_select on public.vehicle_subcompany_transfer_intents
  for select to authenticated
  using (
    public.user_can_manage_fleet_for_subcompany(from_subcompany_id)
    or public.user_can_manage_fleet_for_subcompany(to_subcompany_id)
  );

drop policy if exists vehicle_subcompany_transfer_intents_insert on public.vehicle_subcompany_transfer_intents;
create policy vehicle_subcompany_transfer_intents_insert on public.vehicle_subcompany_transfer_intents
  for insert to authenticated
  with check (
    public.user_can_manage_fleet_for_subcompany(from_subcompany_id)
    and public.user_can_manage_fleet_for_subcompany(to_subcompany_id)
  );

drop policy if exists vehicle_subcompany_transfer_intents_update on public.vehicle_subcompany_transfer_intents;
create policy vehicle_subcompany_transfer_intents_update on public.vehicle_subcompany_transfer_intents
  for update to authenticated
  using (
    public.user_can_manage_fleet_for_subcompany(from_subcompany_id)
    and public.user_can_manage_fleet_for_subcompany(to_subcompany_id)
  );

alter table public.vehicle_transfers
  add constraint vehicle_transfers_transfer_intent_id_fkey
  foreign key (transfer_intent_id) references public.vehicle_subcompany_transfer_intents (id) on delete set null;

alter table public.vehicle_hire_inspections
  add constraint vehicle_hire_inspections_transfer_intent_id_fkey
  foreign key (transfer_intent_id) references public.vehicle_subcompany_transfer_intents (id) on delete set null;

alter table public.vehicle_documents
  add constraint vehicle_documents_vehicle_transfer_id_fkey
  foreign key (vehicle_transfer_id) references public.vehicle_transfers (id) on delete set null;

-- ---------------------------------------------------------------------------
-- vehicle_transfer_document_requirements
-- ---------------------------------------------------------------------------

create table if not exists public.vehicle_transfer_document_requirements (
  id uuid primary key default gen_random_uuid(),
  transfer_intent_id uuid not null references public.vehicle_subcompany_transfer_intents (id) on delete cascade,
  vehicle_transfer_id uuid references public.vehicle_transfers (id) on delete set null,
  parent_company_id uuid not null references public.companies (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  document_kind text not null
    check (
      document_kind in (
        'logbook',
        'phv_taxi_licence_paper',
        'insurance',
        'mot',
        'hire_agreement',
        'permission_letter',
        'inspection_checkout',
        'inspection_checkin'
      )
    ),
  hire_group_id uuid references public.vehicle_hire_groups (id) on delete set null,
  agreement_id uuid references public.vehicle_hire_agreements (id) on delete set null,
  inspection_id uuid references public.vehicle_hire_inspections (id) on delete set null,
  status text not null default 'required'
    check (status in ('required', 'completed', 'cancelled')),
  completed_at timestamptz,
  completed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists vehicle_transfer_document_requirements_intent_idx
  on public.vehicle_transfer_document_requirements (transfer_intent_id, status);

alter table public.vehicle_transfer_document_requirements enable row level security;

drop policy if exists vehicle_transfer_document_requirements_select on public.vehicle_transfer_document_requirements;
create policy vehicle_transfer_document_requirements_select on public.vehicle_transfer_document_requirements
  for select to authenticated
  using (
    exists (
      select 1 from public.vehicles v
      where v.id = vehicle_transfer_document_requirements.vehicle_id
        and public.user_can_access_subcompany(v.subcompany_id)
    )
  );

drop policy if exists vehicle_transfer_document_requirements_insert on public.vehicle_transfer_document_requirements;
create policy vehicle_transfer_document_requirements_insert on public.vehicle_transfer_document_requirements
  for insert to authenticated
  with check (
    exists (
      select 1 from public.vehicles v
      where v.id = vehicle_transfer_document_requirements.vehicle_id
        and public.user_can_manage_fleet_for_subcompany(v.subcompany_id)
    )
  );

drop policy if exists vehicle_transfer_document_requirements_update on public.vehicle_transfer_document_requirements;
create policy vehicle_transfer_document_requirements_update on public.vehicle_transfer_document_requirements
  for update to authenticated
  using (
    exists (
      select 1 from public.vehicles v
      where v.id = vehicle_transfer_document_requirements.vehicle_id
        and public.user_can_manage_fleet_for_subcompany(v.subcompany_id)
    )
  );
