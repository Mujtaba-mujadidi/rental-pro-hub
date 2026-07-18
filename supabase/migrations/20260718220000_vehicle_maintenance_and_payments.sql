-- Vehicle maintenance expense log + company payment methods/accounts.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.user_is_active_company_member(p_parent_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.user_company_memberships m
    where m.parent_company_id = p_parent_company_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

revoke all on function public.user_is_active_company_member(uuid) from public;
grant execute on function public.user_is_active_company_member(uuid) to authenticated;

create or replace function public.user_can_manage_company_settings(p_parent_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.user_company_memberships m
    where m.parent_company_id = p_parent_company_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('owner', 'admin')
  );
$$;

revoke all on function public.user_can_manage_company_settings(uuid) from public;
grant execute on function public.user_can_manage_company_settings(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- company_payment_methods
-- ---------------------------------------------------------------------------

create table if not exists public.company_payment_methods (
  id uuid primary key default gen_random_uuid(),
  parent_company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint company_payment_methods_name_nonempty check (length(trim(name)) > 0)
);

create unique index if not exists company_payment_methods_company_name_uidx
  on public.company_payment_methods (parent_company_id, lower(trim(name)));

create index if not exists company_payment_methods_company_idx
  on public.company_payment_methods (parent_company_id, sort_order, name);

comment on table public.company_payment_methods is
  'Company-configured payment methods (how an expense was paid), e.g. Cash, Card, Bank transfer.';

alter table public.company_payment_methods enable row level security;

drop policy if exists company_payment_methods_select on public.company_payment_methods;
create policy company_payment_methods_select on public.company_payment_methods
  for select to authenticated
  using (public.user_is_active_company_member(parent_company_id));

drop policy if exists company_payment_methods_insert on public.company_payment_methods;
create policy company_payment_methods_insert on public.company_payment_methods
  for insert to authenticated
  with check (public.user_can_manage_company_settings(parent_company_id));

drop policy if exists company_payment_methods_update on public.company_payment_methods;
create policy company_payment_methods_update on public.company_payment_methods
  for update to authenticated
  using (public.user_can_manage_company_settings(parent_company_id))
  with check (public.user_can_manage_company_settings(parent_company_id));

drop policy if exists company_payment_methods_delete on public.company_payment_methods;
create policy company_payment_methods_delete on public.company_payment_methods
  for delete to authenticated
  using (public.user_can_manage_company_settings(parent_company_id));

grant select, insert, update, delete on public.company_payment_methods to authenticated;

-- ---------------------------------------------------------------------------
-- company_payment_accounts
-- ---------------------------------------------------------------------------

create table if not exists public.company_payment_accounts (
  id uuid primary key default gen_random_uuid(),
  parent_company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  notes text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint company_payment_accounts_name_nonempty check (length(trim(name)) > 0)
);

create unique index if not exists company_payment_accounts_company_name_uidx
  on public.company_payment_accounts (parent_company_id, lower(trim(name)));

create index if not exists company_payment_accounts_company_idx
  on public.company_payment_accounts (parent_company_id, sort_order, name);

comment on table public.company_payment_accounts is
  'Company-configured payment accounts (from which account), e.g. Barclays Business, Petty cash.';

alter table public.company_payment_accounts enable row level security;

drop policy if exists company_payment_accounts_select on public.company_payment_accounts;
create policy company_payment_accounts_select on public.company_payment_accounts
  for select to authenticated
  using (public.user_is_active_company_member(parent_company_id));

drop policy if exists company_payment_accounts_insert on public.company_payment_accounts;
create policy company_payment_accounts_insert on public.company_payment_accounts
  for insert to authenticated
  with check (public.user_can_manage_company_settings(parent_company_id));

drop policy if exists company_payment_accounts_update on public.company_payment_accounts;
create policy company_payment_accounts_update on public.company_payment_accounts
  for update to authenticated
  using (public.user_can_manage_company_settings(parent_company_id))
  with check (public.user_can_manage_company_settings(parent_company_id));

drop policy if exists company_payment_accounts_delete on public.company_payment_accounts;
create policy company_payment_accounts_delete on public.company_payment_accounts
  for delete to authenticated
  using (public.user_can_manage_company_settings(parent_company_id));

grant select, insert, update, delete on public.company_payment_accounts to authenticated;

-- ---------------------------------------------------------------------------
-- vehicle_maintenance_records
-- ---------------------------------------------------------------------------

create table if not exists public.vehicle_maintenance_records (
  id uuid primary key default gen_random_uuid(),
  parent_company_id uuid not null references public.companies (id) on delete cascade,
  subcompany_id uuid not null references public.subcompanies (id) on delete restrict,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  occurred_on date not null,
  category text not null
    check (category in (
      'service', 'mot', 'repair', 'tyres', 'bodywork', 'glass', 'electrical', 'other'
    )),
  description text not null default '',
  amount_gbp numeric(12, 2) not null check (amount_gbp >= 0),
  odometer_miles integer check (odometer_miles is null or odometer_miles >= 0),
  paid_to text not null default '',
  paid_by_user_id uuid references auth.users (id) on delete set null,
  paid_by_label text,
  payment_method_id uuid not null references public.company_payment_methods (id) on delete restrict,
  payment_account_id uuid not null references public.company_payment_accounts (id) on delete restrict,
  source text not null default 'manual' check (source in ('manual', 'csv')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vehicle_maintenance_records_vehicle_idx
  on public.vehicle_maintenance_records (vehicle_id, occurred_on desc);

create index if not exists vehicle_maintenance_records_company_idx
  on public.vehicle_maintenance_records (parent_company_id, occurred_on desc);

create index if not exists vehicle_maintenance_records_subcompany_idx
  on public.vehicle_maintenance_records (subcompany_id);

comment on table public.vehicle_maintenance_records is
  'Per-vehicle maintenance / expense expenses with payment method and account.';

create or replace function public.vehicle_maintenance_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists vehicle_maintenance_set_updated_at on public.vehicle_maintenance_records;
create trigger vehicle_maintenance_set_updated_at
  before update on public.vehicle_maintenance_records
  for each row execute function public.vehicle_maintenance_set_updated_at();

-- Keep tenancy aligned with vehicle
create or replace function public.vehicle_maintenance_enforce_vehicle_tenancy()
returns trigger
language plpgsql
as $$
declare
  v_parent uuid;
  v_sub uuid;
begin
  select parent_company_id, subcompany_id into v_parent, v_sub
  from public.vehicles
  where id = new.vehicle_id;

  if v_parent is null then
    raise exception 'vehicle not found';
  end if;

  new.parent_company_id := v_parent;
  new.subcompany_id := v_sub;
  return new;
end;
$$;

drop trigger if exists vehicle_maintenance_enforce_vehicle_tenancy on public.vehicle_maintenance_records;
create trigger vehicle_maintenance_enforce_vehicle_tenancy
  before insert or update of vehicle_id on public.vehicle_maintenance_records
  for each row execute function public.vehicle_maintenance_enforce_vehicle_tenancy();

-- Payment lookups must belong to same company
create or replace function public.vehicle_maintenance_enforce_payment_company()
returns trigger
language plpgsql
as $$
declare
  method_company uuid;
  account_company uuid;
begin
  select parent_company_id into method_company
  from public.company_payment_methods
  where id = new.payment_method_id;

  select parent_company_id into account_company
  from public.company_payment_accounts
  where id = new.payment_account_id;

  if method_company is null or method_company <> new.parent_company_id then
    raise exception 'payment method must belong to the vehicle company';
  end if;
  if account_company is null or account_company <> new.parent_company_id then
    raise exception 'payment account must belong to the vehicle company';
  end if;
  return new;
end;
$$;

drop trigger if exists vehicle_maintenance_enforce_payment_company on public.vehicle_maintenance_records;
create trigger vehicle_maintenance_enforce_payment_company
  before insert or update of payment_method_id, payment_account_id, parent_company_id, vehicle_id
  on public.vehicle_maintenance_records
  for each row execute function public.vehicle_maintenance_enforce_payment_company();

alter table public.vehicle_maintenance_records enable row level security;

drop policy if exists vehicle_maintenance_records_select on public.vehicle_maintenance_records;
create policy vehicle_maintenance_records_select on public.vehicle_maintenance_records
  for select to authenticated
  using (public.user_can_access_subcompany(subcompany_id));

drop policy if exists vehicle_maintenance_records_insert on public.vehicle_maintenance_records;
create policy vehicle_maintenance_records_insert on public.vehicle_maintenance_records
  for insert to authenticated
  with check (public.user_can_manage_fleet_for_subcompany(subcompany_id));

drop policy if exists vehicle_maintenance_records_update on public.vehicle_maintenance_records;
create policy vehicle_maintenance_records_update on public.vehicle_maintenance_records
  for update to authenticated
  using (public.user_can_manage_fleet_for_subcompany(subcompany_id))
  with check (public.user_can_manage_fleet_for_subcompany(subcompany_id));

drop policy if exists vehicle_maintenance_records_delete on public.vehicle_maintenance_records;
create policy vehicle_maintenance_records_delete on public.vehicle_maintenance_records
  for delete to authenticated
  using (public.user_can_manage_fleet_for_subcompany(subcompany_id));

grant select, insert, update, delete on public.vehicle_maintenance_records to authenticated;
