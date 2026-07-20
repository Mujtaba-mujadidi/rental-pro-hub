-- Idempotent: vehicle purchase/sale events + sold status.
-- Run on live Supabase if migration 20260720140000 has not been applied.

alter table public.vehicles drop constraint if exists vehicles_status_check;
alter table public.vehicles add constraint vehicles_status_check
  check (status in ('available', 'on_rent', 'reserved', 'repair', 'accident_claim', 'sold'));

create table if not exists public.vehicle_ownership_events (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  parent_company_id uuid not null references public.companies (id) on delete cascade,
  subcompany_id uuid not null references public.subcompanies (id) on delete restrict,
  event_type text not null check (event_type in ('purchase', 'sale')),
  occurred_on date not null,
  amount_gbp numeric(12, 2) not null check (amount_gbp >= 0),
  counterparty text not null default '',
  payment_method_id uuid references public.company_payment_methods (id) on delete set null,
  payment_account_id uuid references public.company_payment_accounts (id) on delete set null,
  payment_reference text not null default '',
  notes text,
  recorded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists vehicle_ownership_events_one_purchase_uidx
  on public.vehicle_ownership_events (vehicle_id)
  where event_type = 'purchase';

create unique index if not exists vehicle_ownership_events_one_sale_uidx
  on public.vehicle_ownership_events (vehicle_id)
  where event_type = 'sale';

create index if not exists vehicle_ownership_events_vehicle_idx
  on public.vehicle_ownership_events (vehicle_id, occurred_on desc);

create index if not exists vehicle_ownership_events_company_idx
  on public.vehicle_ownership_events (parent_company_id, occurred_on desc);

create or replace function public.vehicle_ownership_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

drop trigger if exists vehicle_ownership_set_updated_at on public.vehicle_ownership_events;
create trigger vehicle_ownership_set_updated_at
  before update on public.vehicle_ownership_events
  for each row execute function public.vehicle_ownership_set_updated_at();

create or replace function public.vehicle_ownership_enforce_vehicle_tenancy()
returns trigger language plpgsql as $$
declare v_parent uuid; v_sub uuid;
begin
  select parent_company_id, subcompany_id into v_parent, v_sub from public.vehicles where id = new.vehicle_id;
  if v_parent is null then raise exception 'vehicle not found'; end if;
  new.parent_company_id := v_parent; new.subcompany_id := v_sub; return new;
end; $$;

drop trigger if exists vehicle_ownership_enforce_vehicle_tenancy on public.vehicle_ownership_events;
create trigger vehicle_ownership_enforce_vehicle_tenancy
  before insert or update of vehicle_id on public.vehicle_ownership_events
  for each row execute function public.vehicle_ownership_enforce_vehicle_tenancy();

create or replace function public.vehicle_ownership_enforce_payment_company()
returns trigger language plpgsql as $$
declare method_company uuid; account_company uuid;
begin
  if new.payment_method_id is not null then
    select parent_company_id into method_company from public.company_payment_methods where id = new.payment_method_id;
    if method_company is null or method_company <> new.parent_company_id then
      raise exception 'payment method must belong to the vehicle company';
    end if;
  end if;
  if new.payment_account_id is not null then
    select parent_company_id into account_company from public.company_payment_accounts where id = new.payment_account_id;
    if account_company is null or account_company <> new.parent_company_id then
      raise exception 'payment account must belong to the vehicle company';
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists vehicle_ownership_enforce_payment_company on public.vehicle_ownership_events;
create trigger vehicle_ownership_enforce_payment_company
  before insert or update of payment_method_id, payment_account_id, parent_company_id, vehicle_id
  on public.vehicle_ownership_events
  for each row execute function public.vehicle_ownership_enforce_payment_company();

alter table public.vehicle_ownership_events enable row level security;

drop policy if exists vehicle_ownership_events_select on public.vehicle_ownership_events;
create policy vehicle_ownership_events_select on public.vehicle_ownership_events
  for select to authenticated using (public.user_can_access_subcompany(subcompany_id));

drop policy if exists vehicle_ownership_events_insert on public.vehicle_ownership_events;
create policy vehicle_ownership_events_insert on public.vehicle_ownership_events
  for insert to authenticated with check (public.user_can_manage_fleet_for_subcompany(subcompany_id));

drop policy if exists vehicle_ownership_events_update on public.vehicle_ownership_events;
create policy vehicle_ownership_events_update on public.vehicle_ownership_events
  for update to authenticated
  using (public.user_can_manage_fleet_for_subcompany(subcompany_id))
  with check (public.user_can_manage_fleet_for_subcompany(subcompany_id));

drop policy if exists vehicle_ownership_events_delete on public.vehicle_ownership_events;
create policy vehicle_ownership_events_delete on public.vehicle_ownership_events
  for delete to authenticated using (public.user_can_manage_fleet_for_subcompany(subcompany_id));

grant select, insert, update, delete on public.vehicle_ownership_events to authenticated;
