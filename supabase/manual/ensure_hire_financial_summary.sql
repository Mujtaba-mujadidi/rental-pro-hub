-- Idempotent ensure for hire financial summary + payment allocations
-- (see migration 20260823210000_hire_financial_summary.sql).

create table if not exists public.vehicle_hire_financial_summary (
  hire_group_id uuid primary key references public.vehicle_hire_groups (id) on delete cascade,
  parent_company_id uuid not null references public.companies (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  rent_due_gbp numeric(12, 2) not null default 0,
  rent_paid_gbp numeric(12, 2) not null default 0,
  rent_outstanding_gbp numeric(12, 2) not null default 0,
  extras_posted_gbp numeric(12, 2) not null default 0,
  extras_paid_gbp numeric(12, 2) not null default 0,
  extras_outstanding_gbp numeric(12, 2) not null default 0,
  schedule_rent_income_gbp numeric(12, 2) not null default 0,
  driver_charge_income_gbp numeric(12, 2) not null default 0,
  deposit_retention_income_gbp numeric(12, 2) not null default 0,
  supplemental_collections_gbp numeric(12, 2) not null default 0,
  settlement_write_offs_gbp numeric(12, 2) not null default 0,
  net_hire_income_gbp numeric(12, 2) not null default 0,
  open_balance_gbp numeric(12, 2) not null default 0,
  open_direction text not null default 'settled',
  rebuilt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vehicle_hire_financial_summary
  drop constraint if exists vehicle_hire_financial_summary_open_direction_check;
alter table public.vehicle_hire_financial_summary
  add constraint vehicle_hire_financial_summary_open_direction_check
  check (open_direction in ('driver_owes_company', 'company_owes_driver', 'settled'));

create index if not exists vehicle_hire_financial_summary_vehicle_idx
  on public.vehicle_hire_financial_summary (vehicle_id, rebuilt_at desc);

create index if not exists vehicle_hire_financial_summary_company_idx
  on public.vehicle_hire_financial_summary (parent_company_id);

alter table public.vehicle_hire_financial_summary enable row level security;

drop policy if exists vehicle_hire_financial_summary_select on public.vehicle_hire_financial_summary;
create policy vehicle_hire_financial_summary_select on public.vehicle_hire_financial_summary
  for select to authenticated
  using (
    public.user_can_read_rentals_for_company(parent_company_id)
    or exists (
      select 1 from public.vehicle_hire_groups g
      where g.id = vehicle_hire_financial_summary.hire_group_id
        and g.driver_user_id = auth.uid()
    )
  );

drop policy if exists vehicle_hire_financial_summary_mutate on public.vehicle_hire_financial_summary;
create policy vehicle_hire_financial_summary_mutate on public.vehicle_hire_financial_summary
  for all to authenticated
  using (public.user_can_write_rentals_for_company(parent_company_id))
  with check (public.user_can_write_rentals_for_company(parent_company_id));

create table if not exists public.vehicle_hire_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  hire_group_id uuid not null references public.vehicle_hire_groups (id) on delete cascade,
  parent_company_id uuid not null references public.companies (id) on delete cascade,
  balance_payment_id uuid not null references public.vehicle_hire_balance_payments (id) on delete cascade,
  target_type text not null,
  target_id uuid not null,
  amount_gbp numeric(12, 2) not null,
  created_at timestamptz not null default now()
);

alter table public.vehicle_hire_payment_allocations
  drop constraint if exists vehicle_hire_payment_allocations_target_type_check;
alter table public.vehicle_hire_payment_allocations
  add constraint vehicle_hire_payment_allocations_target_type_check
  check (target_type in ('driver_charge_line', 'schedule_row'));

alter table public.vehicle_hire_payment_allocations
  drop constraint if exists vehicle_hire_payment_allocations_amount_gbp_check;
alter table public.vehicle_hire_payment_allocations
  add constraint vehicle_hire_payment_allocations_amount_gbp_check
  check (amount_gbp > 0);

create unique index if not exists vehicle_hire_payment_allocations_payment_target_uidx
  on public.vehicle_hire_payment_allocations (balance_payment_id, target_type, target_id);

create index if not exists vehicle_hire_payment_allocations_hire_idx
  on public.vehicle_hire_payment_allocations (hire_group_id, created_at desc);

create index if not exists vehicle_hire_payment_allocations_target_idx
  on public.vehicle_hire_payment_allocations (target_type, target_id);

alter table public.vehicle_hire_payment_allocations enable row level security;

drop policy if exists vehicle_hire_payment_allocations_select on public.vehicle_hire_payment_allocations;
create policy vehicle_hire_payment_allocations_select on public.vehicle_hire_payment_allocations
  for select to authenticated
  using (
    public.user_can_read_rentals_for_company(parent_company_id)
    or exists (
      select 1 from public.vehicle_hire_groups g
      where g.id = vehicle_hire_payment_allocations.hire_group_id
        and g.driver_user_id = auth.uid()
    )
  );

drop policy if exists vehicle_hire_payment_allocations_mutate on public.vehicle_hire_payment_allocations;
create policy vehicle_hire_payment_allocations_mutate on public.vehicle_hire_payment_allocations
  for all to authenticated
  using (public.user_can_write_rentals_for_company(parent_company_id))
  with check (public.user_can_write_rentals_for_company(parent_company_id));

alter table public.vehicle_hire_driver_charge_line_items
  add column if not exists paid_gbp numeric(12, 2) not null default 0;

alter table public.vehicle_hire_driver_charge_line_items
  drop constraint if exists vehicle_hire_driver_charge_line_items_paid_gbp_check;
alter table public.vehicle_hire_driver_charge_line_items
  add constraint vehicle_hire_driver_charge_line_items_paid_gbp_check
  check (paid_gbp >= 0);

alter table public.vehicle_hire_driver_charge_line_items
  add column if not exists collection_status text not null default 'due';

alter table public.vehicle_hire_driver_charge_line_items
  drop constraint if exists vehicle_hire_driver_charge_line_items_collection_status_check;
alter table public.vehicle_hire_driver_charge_line_items
  add constraint vehicle_hire_driver_charge_line_items_collection_status_check
  check (
    collection_status in (
      'paid',
      'partially_paid',
      'pending_approval',
      'due',
      'waived',
      'voided'
    )
  );

create index if not exists vehicle_hire_driver_charge_line_items_collection_idx
  on public.vehicle_hire_driver_charge_line_items (hire_group_id, collection_status);
