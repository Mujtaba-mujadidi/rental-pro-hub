-- Idempotent apply for vehicle_hire_driver_charge_line_items + payment_category on balance payments.

create table if not exists public.vehicle_hire_driver_charge_line_items (
  id uuid primary key default gen_random_uuid(),
  hire_group_id uuid not null references public.vehicle_hire_groups (id) on delete cascade,
  parent_company_id uuid not null references public.companies (id) on delete cascade,
  charge_type text not null,
  amount_gbp numeric(12, 2) not null check (amount_gbp > 0),
  resolution text not null check (resolution in ('waived', 'paid_now', 'add_to_balance')),
  source_kind text not null,
  source_id uuid,
  description text,
  balance_payment_id uuid,
  charged_on date not null default (timezone('Europe/London', now()))::date,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references auth.users (id) on delete set null
);

create index if not exists vehicle_hire_driver_charge_line_items_hire_idx
  on public.vehicle_hire_driver_charge_line_items (hire_group_id, created_at desc);

create index if not exists vehicle_hire_driver_charge_line_items_company_type_idx
  on public.vehicle_hire_driver_charge_line_items (parent_company_id, charge_type);

alter table public.vehicle_hire_balance_payments
  add column if not exists payment_category text not null default 'settlement'
    check (payment_category in ('settlement', 'driver_charge'));

alter table public.vehicle_hire_driver_charge_line_items
  drop constraint if exists vehicle_hire_driver_charge_line_items_balance_payment_id_fkey;

alter table public.vehicle_hire_driver_charge_line_items
  add constraint vehicle_hire_driver_charge_line_items_balance_payment_id_fkey
  foreign key (balance_payment_id) references public.vehicle_hire_balance_payments (id) on delete set null;

alter table public.vehicle_hire_driver_charge_line_items enable row level security;

drop policy if exists vehicle_hire_driver_charge_line_items_select on public.vehicle_hire_driver_charge_line_items;
create policy vehicle_hire_driver_charge_line_items_select on public.vehicle_hire_driver_charge_line_items
  for select to authenticated
  using (
    public.user_can_read_rentals_for_company(parent_company_id)
    or exists (
      select 1 from public.vehicle_hire_groups g
      where g.id = vehicle_hire_driver_charge_line_items.hire_group_id
        and g.driver_user_id = auth.uid()
    )
  );

drop policy if exists vehicle_hire_driver_charge_line_items_mutate on public.vehicle_hire_driver_charge_line_items;
create policy vehicle_hire_driver_charge_line_items_mutate on public.vehicle_hire_driver_charge_line_items
  for all to authenticated
  using (
    public.user_can_write_rentals_for_company(parent_company_id)
  )
  with check (
    public.user_can_write_rentals_for_company(parent_company_id)
  );

alter table public.vehicle_hire_driver_charge_line_items
  add column if not exists charged_on date;

update public.vehicle_hire_driver_charge_line_items
set charged_on = (created_at at time zone 'Europe/London')::date
where charged_on is null;

alter table public.vehicle_hire_driver_charge_line_items
  alter column charged_on set default (timezone('Europe/London', now()))::date;

alter table public.vehicle_hire_driver_charge_line_items
  alter column charged_on set not null;

alter table public.vehicle_hire_driver_charge_line_items replica identity full;
