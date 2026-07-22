-- Vehicle hire agreements: company hire terms, driver links, hire groups, timesheet, payments.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Company notification: contract expiry lead time
-- ---------------------------------------------------------------------------

alter table public.companies
  add column if not exists notify_contract_expiry_days_before integer not null default 28
    check (notify_contract_expiry_days_before >= 0 and notify_contract_expiry_days_before <= 365);

comment on column public.companies.notify_contract_expiry_days_before is
  'Days before a hire contract end date to show expiring-soon alerts (default 28).';

-- ---------------------------------------------------------------------------
-- company_hire_terms_versions (per rental company — mirrors contract_terms_versions)
-- ---------------------------------------------------------------------------

create table if not exists public.company_hire_terms_versions (
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

create index if not exists company_hire_terms_versions_company_status_idx
  on public.company_hire_terms_versions (parent_company_id, status);
create index if not exists company_hire_terms_versions_company_created_idx
  on public.company_hire_terms_versions (parent_company_id, created_at desc);

create or replace function public.company_hire_terms_versions_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists company_hire_terms_versions_touch on public.company_hire_terms_versions;
create trigger company_hire_terms_versions_touch
  before update on public.company_hire_terms_versions
  for each row execute procedure public.company_hire_terms_versions_set_updated_at();

alter table public.company_hire_terms_versions enable row level security;

drop policy if exists company_hire_terms_versions_select on public.company_hire_terms_versions;
create policy company_hire_terms_versions_select on public.company_hire_terms_versions
  for select to authenticated
  using (public.user_is_active_company_member(parent_company_id));

drop policy if exists company_hire_terms_versions_write on public.company_hire_terms_versions;
create policy company_hire_terms_versions_write on public.company_hire_terms_versions
  for all to authenticated
  using (public.user_can_manage_company_settings(parent_company_id))
  with check (public.user_can_manage_company_settings(parent_company_id));

-- ---------------------------------------------------------------------------
-- company_hire_bank_accounts — removed; bank details live on company_payment_accounts
-- (see migration 20260722110000_payment_account_bank_details.sql)
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- company_driver_links
-- ---------------------------------------------------------------------------

create table if not exists public.company_driver_links (
  id uuid primary key default gen_random_uuid(),
  parent_company_id uuid not null references public.companies (id) on delete cascade,
  driver_user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'removed')),
  linked_at timestamptz not null default now(),
  linked_by_user_id uuid references auth.users (id) on delete set null,
  notes text,
  unique (parent_company_id, driver_user_id)
);

create index if not exists company_driver_links_company_idx
  on public.company_driver_links (parent_company_id, status);

alter table public.company_driver_links enable row level security;

drop policy if exists company_driver_links_select on public.company_driver_links;
create policy company_driver_links_select on public.company_driver_links
  for select to authenticated
  using (public.user_is_active_company_member(parent_company_id));

drop policy if exists company_driver_links_write on public.company_driver_links;
create policy company_driver_links_write on public.company_driver_links
  for all to authenticated
  using (
    exists (
      select 1 from public.user_company_memberships m
      where m.parent_company_id = company_driver_links.parent_company_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('owner', 'admin', 'operations')
    )
  )
  with check (
    exists (
      select 1 from public.user_company_memberships m
      where m.parent_company_id = company_driver_links.parent_company_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('owner', 'admin', 'operations')
    )
  );

-- ---------------------------------------------------------------------------
-- company_driver_access_requests
-- ---------------------------------------------------------------------------

create table if not exists public.company_driver_access_requests (
  id uuid primary key default gen_random_uuid(),
  parent_company_id uuid not null references public.companies (id) on delete cascade,
  subcompany_id uuid not null references public.subcompanies (id) on delete cascade,
  driver_user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'expired')),
  requested_by_user_id uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  resolved_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists company_driver_access_requests_company_idx
  on public.company_driver_access_requests (parent_company_id, status, created_at desc);

alter table public.company_driver_access_requests enable row level security;

drop policy if exists company_driver_access_requests_select on public.company_driver_access_requests;
create policy company_driver_access_requests_select on public.company_driver_access_requests
  for select to authenticated
  using (
    public.user_can_access_subcompany(subcompany_id)
    or driver_user_id = auth.uid()
  );

drop policy if exists company_driver_access_requests_write on public.company_driver_access_requests;
create policy company_driver_access_requests_write on public.company_driver_access_requests
  for all to authenticated
  using (public.user_can_manage_fleet_for_subcompany(subcompany_id))
  with check (public.user_can_manage_fleet_for_subcompany(subcompany_id));

-- ---------------------------------------------------------------------------
-- vehicle_hire_groups
-- ---------------------------------------------------------------------------

create table if not exists public.vehicle_hire_groups (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete restrict,
  parent_company_id uuid not null references public.companies (id) on delete cascade,
  subcompany_id uuid not null references public.subcompanies (id) on delete restrict,
  driver_user_id uuid not null references auth.users (id) on delete restrict,
  rent_cadence text not null default 'weekly'
    check (rent_cadence in ('daily', 'weekly', 'monthly')),
  rent_amount_gbp numeric(12, 2) not null check (rent_amount_gbp >= 0),
  deposit_gbp numeric(12, 2) check (deposit_gbp is null or deposit_gbp >= 0),
  start_date date not null,
  default_payment_account_id uuid references public.company_payment_accounts (id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft', 'pending_signature', 'reserved', 'active', 'completed', 'terminated', 'cancelled')),
  supersedes_hire_group_id uuid references public.vehicle_hire_groups (id) on delete set null,
  superseded_by_hire_group_id uuid references public.vehicle_hire_groups (id) on delete set null,
  subcompany_legal_snapshot jsonb not null default '{}'::jsonb,
  hire_terms_version_id uuid references public.company_hire_terms_versions (id) on delete set null,
  activated_at timestamptz,
  ended_at timestamptz,
  terminated_at timestamptz,
  termination_reason text,
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vehicle_hire_groups_vehicle_idx
  on public.vehicle_hire_groups (vehicle_id, status);
create index if not exists vehicle_hire_groups_company_idx
  on public.vehicle_hire_groups (parent_company_id, status, created_at desc);
create index if not exists vehicle_hire_groups_driver_idx
  on public.vehicle_hire_groups (driver_user_id, status);

create unique index if not exists vehicle_hire_groups_one_active_per_vehicle_uidx
  on public.vehicle_hire_groups (vehicle_id)
  where status in ('pending_signature', 'reserved', 'active');

alter table public.vehicle_hire_groups enable row level security;

drop policy if exists vehicle_hire_groups_select on public.vehicle_hire_groups;
create policy vehicle_hire_groups_select on public.vehicle_hire_groups
  for select to authenticated
  using (
    public.user_can_access_subcompany(subcompany_id)
    or driver_user_id = auth.uid()
  );

drop policy if exists vehicle_hire_groups_write on public.vehicle_hire_groups;
create policy vehicle_hire_groups_write on public.vehicle_hire_groups
  for all to authenticated
  using (public.user_can_manage_fleet_for_subcompany(subcompany_id))
  with check (public.user_can_manage_fleet_for_subcompany(subcompany_id));

-- ---------------------------------------------------------------------------
-- vehicle_hire_agreements (one per contract length)
-- ---------------------------------------------------------------------------

create table if not exists public.vehicle_hire_agreements (
  id uuid primary key default gen_random_uuid(),
  hire_group_id uuid not null references public.vehicle_hire_groups (id) on delete cascade,
  contract_length_kind text not null
    check (contract_length_kind in ('annual', 'six_months', 'custom')),
  end_date date not null,
  status text not null default 'draft'
    check (status in ('draft', 'pending_signature', 'reserved', 'active', 'completed', 'terminated', 'cancelled', 'superseded')),
  supersedes_agreement_id uuid references public.vehicle_hire_agreements (id) on delete set null,
  esign_envelope_id uuid references public.esign_envelopes (id) on delete set null,
  signed_storage_path text,
  signed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists vehicle_hire_agreements_group_idx
  on public.vehicle_hire_agreements (hire_group_id, status);

alter table public.vehicle_hire_agreements enable row level security;

drop policy if exists vehicle_hire_agreements_select on public.vehicle_hire_agreements;
create policy vehicle_hire_agreements_select on public.vehicle_hire_agreements
  for select to authenticated
  using (
    exists (
      select 1 from public.vehicle_hire_groups g
      where g.id = vehicle_hire_agreements.hire_group_id
        and (
          public.user_can_access_subcompany(g.subcompany_id)
          or g.driver_user_id = auth.uid()
        )
    )
  );

drop policy if exists vehicle_hire_agreements_write on public.vehicle_hire_agreements;
create policy vehicle_hire_agreements_write on public.vehicle_hire_agreements
  for all to authenticated
  using (
    exists (
      select 1 from public.vehicle_hire_groups g
      where g.id = vehicle_hire_agreements.hire_group_id
        and public.user_can_manage_fleet_for_subcompany(g.subcompany_id)
    )
  )
  with check (
    exists (
      select 1 from public.vehicle_hire_groups g
      where g.id = vehicle_hire_agreements.hire_group_id
        and public.user_can_manage_fleet_for_subcompany(g.subcompany_id)
    )
  );

-- ---------------------------------------------------------------------------
-- vehicle_hire_payment_schedule (timesheet rows)
-- ---------------------------------------------------------------------------

create table if not exists public.vehicle_hire_payment_schedule (
  id uuid primary key default gen_random_uuid(),
  hire_group_id uuid not null references public.vehicle_hire_groups (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  base_amount_gbp numeric(12, 2) not null check (base_amount_gbp >= 0),
  payment_status text not null default 'not_received'
    check (payment_status in ('not_received', 'pending_approval', 'rejected', 'approved')),
  row_kind text not null default 'rent' check (row_kind in ('rent', 'deposit')),
  expected_payment_account_id uuid references public.company_payment_accounts (id) on delete set null,
  received_payment_account_id uuid references public.company_payment_accounts (id) on delete set null,
  received_payment_method_id uuid references public.company_payment_methods (id) on delete set null,
  approved_amount_gbp numeric(12, 2) check (approved_amount_gbp is null or approved_amount_gbp >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists vehicle_hire_payment_schedule_group_idx
  on public.vehicle_hire_payment_schedule (hire_group_id, sort_order);

alter table public.vehicle_hire_payment_schedule enable row level security;

drop policy if exists vehicle_hire_payment_schedule_select on public.vehicle_hire_payment_schedule;
create policy vehicle_hire_payment_schedule_select on public.vehicle_hire_payment_schedule
  for select to authenticated
  using (
    exists (
      select 1 from public.vehicle_hire_groups g
      where g.id = vehicle_hire_payment_schedule.hire_group_id
        and (
          public.user_can_access_subcompany(g.subcompany_id)
          or g.driver_user_id = auth.uid()
        )
    )
  );

drop policy if exists vehicle_hire_payment_schedule_staff_write on public.vehicle_hire_payment_schedule;
create policy vehicle_hire_payment_schedule_staff_write on public.vehicle_hire_payment_schedule
  for all to authenticated
  using (
    exists (
      select 1 from public.vehicle_hire_groups g
      where g.id = vehicle_hire_payment_schedule.hire_group_id
        and public.user_can_manage_fleet_for_subcompany(g.subcompany_id)
    )
  )
  with check (
    exists (
      select 1 from public.vehicle_hire_groups g
      where g.id = vehicle_hire_payment_schedule.hire_group_id
        and public.user_can_manage_fleet_for_subcompany(g.subcompany_id)
    )
  );

-- ---------------------------------------------------------------------------
-- vehicle_hire_schedule_discounts
-- ---------------------------------------------------------------------------

create table if not exists public.vehicle_hire_schedule_discounts (
  id uuid primary key default gen_random_uuid(),
  schedule_row_id uuid not null references public.vehicle_hire_payment_schedule (id) on delete cascade,
  amount_gbp numeric(12, 2) not null check (amount_gbp > 0),
  reason text not null check (length(trim(reason)) > 0),
  applied_by_user_id uuid references auth.users (id) on delete set null,
  applied_at timestamptz not null default now()
);

create index if not exists vehicle_hire_schedule_discounts_row_idx
  on public.vehicle_hire_schedule_discounts (schedule_row_id);

alter table public.vehicle_hire_schedule_discounts enable row level security;

drop policy if exists vehicle_hire_schedule_discounts_select on public.vehicle_hire_schedule_discounts;
create policy vehicle_hire_schedule_discounts_select on public.vehicle_hire_schedule_discounts
  for select to authenticated
  using (
    exists (
      select 1
      from public.vehicle_hire_payment_schedule s
      join public.vehicle_hire_groups g on g.id = s.hire_group_id
      where s.id = vehicle_hire_schedule_discounts.schedule_row_id
        and (
          public.user_can_access_subcompany(g.subcompany_id)
          or g.driver_user_id = auth.uid()
        )
    )
  );

drop policy if exists vehicle_hire_schedule_discounts_write on public.vehicle_hire_schedule_discounts;
create policy vehicle_hire_schedule_discounts_write on public.vehicle_hire_schedule_discounts
  for all to authenticated
  using (
    exists (
      select 1
      from public.vehicle_hire_payment_schedule s
      join public.vehicle_hire_groups g on g.id = s.hire_group_id
      where s.id = vehicle_hire_schedule_discounts.schedule_row_id
        and public.user_can_manage_fleet_for_subcompany(g.subcompany_id)
    )
  )
  with check (
    exists (
      select 1
      from public.vehicle_hire_payment_schedule s
      join public.vehicle_hire_groups g on g.id = s.hire_group_id
      where s.id = vehicle_hire_schedule_discounts.schedule_row_id
        and public.user_can_manage_fleet_for_subcompany(g.subcompany_id)
    )
  );

-- ---------------------------------------------------------------------------
-- vehicle_hire_payment_status_events (audit + replies + amendments)
-- ---------------------------------------------------------------------------

create table if not exists public.vehicle_hire_payment_status_events (
  id uuid primary key default gen_random_uuid(),
  schedule_row_id uuid not null references public.vehicle_hire_payment_schedule (id) on delete cascade,
  event_kind text not null default 'status_change'
    check (event_kind in ('status_change', 'reply', 'amendment')),
  from_status text,
  to_status text,
  comment text,
  amendment_payload jsonb,
  actor_user_id uuid references auth.users (id) on delete set null,
  actor_role text not null check (actor_role in ('company_staff', 'driver')),
  created_at timestamptz not null default now()
);

create index if not exists vehicle_hire_payment_status_events_row_idx
  on public.vehicle_hire_payment_status_events (schedule_row_id, created_at);

alter table public.vehicle_hire_payment_status_events enable row level security;

drop policy if exists vehicle_hire_payment_status_events_select on public.vehicle_hire_payment_status_events;
create policy vehicle_hire_payment_status_events_select on public.vehicle_hire_payment_status_events
  for select to authenticated
  using (
    exists (
      select 1
      from public.vehicle_hire_payment_schedule s
      join public.vehicle_hire_groups g on g.id = s.hire_group_id
      where s.id = vehicle_hire_payment_status_events.schedule_row_id
        and (
          public.user_can_access_subcompany(g.subcompany_id)
          or g.driver_user_id = auth.uid()
        )
    )
  );

drop policy if exists vehicle_hire_payment_status_events_insert on public.vehicle_hire_payment_status_events;
create policy vehicle_hire_payment_status_events_insert on public.vehicle_hire_payment_status_events
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.vehicle_hire_payment_schedule s
      join public.vehicle_hire_groups g on g.id = s.hire_group_id
      where s.id = vehicle_hire_payment_status_events.schedule_row_id
        and (
          public.user_can_manage_fleet_for_subcompany(g.subcompany_id)
          or g.driver_user_id = auth.uid()
        )
    )
  );
