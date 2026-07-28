-- Hire termination settlement, open balances, and driver document retention.

alter table public.vehicle_hire_groups
  add column if not exists deposit_disposition text
    check (
      deposit_disposition is null
      or deposit_disposition in (
        'apply_to_balance',
        'refund_full',
        'refund_partial',
        'forfeit',
        'hold_pending'
      )
    ),
  add column if not exists deposit_refund_method text
    check (
      deposit_refund_method is null
      or deposit_refund_method in ('bank_transfer', 'cash', 'card', 'cheque', 'other')
    ),
  add column if not exists deposit_refund_amount_gbp numeric(12, 2)
    check (deposit_refund_amount_gbp is null or deposit_refund_amount_gbp >= 0),
  add column if not exists deposit_refund_reference text,
  add column if not exists deposit_refund_recorded_at timestamptz,
  add column if not exists termination_settlement jsonb not null default '{}'::jsonb,
  add column if not exists settlement_balance_gbp numeric(12, 2),
  add column if not exists settlement_balance_direction text
    check (
      settlement_balance_direction is null
      or settlement_balance_direction in ('driver_owes_company', 'company_owes_driver', 'settled')
    ),
  add column if not exists driver_documents_retain_until date;

create table if not exists public.vehicle_hire_balance_notes (
  id uuid primary key default gen_random_uuid(),
  hire_group_id uuid not null references public.vehicle_hire_groups (id) on delete cascade,
  body text not null,
  follow_up_at date,
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists vehicle_hire_balance_notes_hire_idx
  on public.vehicle_hire_balance_notes (hire_group_id, created_at desc);

create table if not exists public.vehicle_hire_balance_payments (
  id uuid primary key default gen_random_uuid(),
  hire_group_id uuid not null references public.vehicle_hire_groups (id) on delete cascade,
  amount_gbp numeric(12, 2) not null check (amount_gbp > 0),
  payment_method text not null
    check (payment_method in ('bank_transfer', 'cash', 'card', 'cheque', 'other')),
  payment_reference text,
  notes text,
  paid_at timestamptz not null default now(),
  recorded_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists vehicle_hire_balance_payments_hire_idx
  on public.vehicle_hire_balance_payments (hire_group_id, paid_at desc);

create index if not exists vehicle_hire_groups_open_balance_idx
  on public.vehicle_hire_groups (parent_company_id, settlement_balance_direction)
  where settlement_balance_direction is not null
    and settlement_balance_direction <> 'settled';

alter table public.vehicle_hire_balance_notes enable row level security;
alter table public.vehicle_hire_balance_payments enable row level security;

drop policy if exists vehicle_hire_balance_notes_select on public.vehicle_hire_balance_notes;
create policy vehicle_hire_balance_notes_select on public.vehicle_hire_balance_notes
  for select to authenticated
  using (
    exists (
      select 1 from public.vehicle_hire_groups g
      where g.id = vehicle_hire_balance_notes.hire_group_id
        and (
          public.user_can_access_subcompany(g.subcompany_id)
          or g.driver_user_id = auth.uid()
        )
    )
  );

drop policy if exists vehicle_hire_balance_notes_mutate on public.vehicle_hire_balance_notes;
create policy vehicle_hire_balance_notes_mutate on public.vehicle_hire_balance_notes
  for all to authenticated
  using (
    exists (
      select 1 from public.vehicle_hire_groups g
      where g.id = vehicle_hire_balance_notes.hire_group_id
        and public.user_can_manage_fleet_for_subcompany(g.subcompany_id)
    )
  )
  with check (
    exists (
      select 1 from public.vehicle_hire_groups g
      where g.id = vehicle_hire_balance_notes.hire_group_id
        and public.user_can_manage_fleet_for_subcompany(g.subcompany_id)
    )
  );

drop policy if exists vehicle_hire_balance_payments_select on public.vehicle_hire_balance_payments;
create policy vehicle_hire_balance_payments_select on public.vehicle_hire_balance_payments
  for select to authenticated
  using (
    exists (
      select 1 from public.vehicle_hire_groups g
      where g.id = vehicle_hire_balance_payments.hire_group_id
        and (
          public.user_can_access_subcompany(g.subcompany_id)
          or g.driver_user_id = auth.uid()
        )
    )
  );

drop policy if exists vehicle_hire_balance_payments_mutate on public.vehicle_hire_balance_payments;
create policy vehicle_hire_balance_payments_mutate on public.vehicle_hire_balance_payments
  for all to authenticated
  using (
    exists (
      select 1 from public.vehicle_hire_groups g
      where g.id = vehicle_hire_balance_payments.hire_group_id
        and public.user_can_manage_fleet_for_subcompany(g.subcompany_id)
    )
  )
  with check (
    exists (
      select 1 from public.vehicle_hire_groups g
      where g.id = vehicle_hire_balance_payments.hire_group_id
        and public.user_can_manage_fleet_for_subcompany(g.subcompany_id)
    )
  );

-- Block another hire on the same vehicle while awaiting physical return.
drop index if exists public.vehicle_hire_groups_one_in_progress_per_vehicle_uidx;
create unique index if not exists vehicle_hire_groups_one_in_progress_per_vehicle_uidx
  on public.vehicle_hire_groups (vehicle_id)
  where status in ('draft', 'pending_signature', 'reserved', 'active', 'terminated');

alter table public.vehicle_hire_balance_notes replica identity full;
alter table public.vehicle_hire_balance_payments replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'vehicle_hire_balance_notes'
  ) then
    alter publication supabase_realtime add table public.vehicle_hire_balance_notes;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'vehicle_hire_balance_payments'
  ) then
    alter publication supabase_realtime add table public.vehicle_hire_balance_payments;
  end if;
end $$;
