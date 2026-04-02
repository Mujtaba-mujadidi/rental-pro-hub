-- Rental onboarding v2: first-class contracts/versions, memberships, subcompany scope,
-- onboarding progress, staff invitations; selective mirror to primary subcompany on amendment.

-- ---------------------------------------------------------------------------
-- Parent company extensions
-- ---------------------------------------------------------------------------
alter table public.companies
  add column if not exists entity_type text;

alter table public.companies
  add column if not exists trading_name text;

alter table public.companies
  add column if not exists billing_email text;

alter table public.companies
  add column if not exists rental_onboarding_step integer not null default 0;

alter table public.companies
  add column if not exists rental_onboarding_completed_at timestamptz;

comment on column public.companies.rental_onboarding_step is '0-based wizard step index; completed when rental_onboarding_completed_at is set.';

-- ---------------------------------------------------------------------------
-- Subcompany display label (operational)
-- ---------------------------------------------------------------------------
alter table public.subcompanies
  add column if not exists display_name text;

-- ---------------------------------------------------------------------------
-- Memberships + subcompany permissions (before company_contracts policies reference them)
-- ---------------------------------------------------------------------------
create table if not exists public.user_company_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  parent_company_id uuid not null references public.companies (id) on delete cascade,
  role text not null default 'viewer' check (
    role in ('owner', 'admin', 'operations', 'finance', 'viewer')
  ),
  subcompany_scope text not null default 'all' check (subcompany_scope in ('all', 'explicit')),
  status text not null default 'active' check (status in ('active', 'invited', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, parent_company_id)
);

create index if not exists user_company_memberships_user_id_idx
  on public.user_company_memberships (user_id);

create index if not exists user_company_memberships_parent_company_id_idx
  on public.user_company_memberships (parent_company_id);

create or replace function public.user_company_memberships_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_company_memberships_set_updated_at on public.user_company_memberships;
create trigger user_company_memberships_set_updated_at
  before update on public.user_company_memberships
  for each row execute procedure public.user_company_memberships_set_updated_at();

alter table public.user_company_memberships enable row level security;

-- RLS-safe helpers: policies must not subquery user_company_memberships (same table) or Postgres detects infinite recursion.
create or replace function public.user_is_rental_owner_or_admin_for_company(p_company_id uuid)
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
    where m.user_id = auth.uid()
      and m.parent_company_id = p_company_id
      and m.status = 'active'
      and m.role in ('owner', 'admin')
  );
$$;

create or replace function public.user_manages_membership_subcompany_perms(p_membership_id uuid)
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
    inner join public.user_company_memberships me
      on me.parent_company_id = m.parent_company_id
      and me.user_id = auth.uid()
      and me.status = 'active'
      and me.role in ('owner', 'admin')
    where m.id = p_membership_id
  );
$$;

revoke all on function public.user_is_rental_owner_or_admin_for_company(uuid) from public;
revoke all on function public.user_manages_membership_subcompany_perms(uuid) from public;
grant execute on function public.user_is_rental_owner_or_admin_for_company(uuid) to authenticated;
grant execute on function public.user_manages_membership_subcompany_perms(uuid) to authenticated;

create policy user_company_memberships_select_own
  on public.user_company_memberships for select
  to authenticated
  using (user_id = auth.uid());

create policy user_company_memberships_select_super_admin
  on public.user_company_memberships for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
  );

create policy user_company_memberships_select_rental_admin
  on public.user_company_memberships for select
  to authenticated
  using (public.user_is_rental_owner_or_admin_for_company(parent_company_id));

create policy user_company_memberships_insert_super_admin
  on public.user_company_memberships for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
  );

create policy user_company_memberships_update_super_admin
  on public.user_company_memberships for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
  );

create policy user_company_memberships_delete_super_admin
  on public.user_company_memberships for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
  );

create policy user_company_memberships_update_rental_admin
  on public.user_company_memberships for update
  to authenticated
  using (public.user_is_rental_owner_or_admin_for_company(parent_company_id))
  with check (public.user_is_rental_owner_or_admin_for_company(parent_company_id));

create table if not exists public.user_subcompany_permissions (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.user_company_memberships (id) on delete cascade,
  subcompany_id uuid not null references public.subcompanies (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (membership_id, subcompany_id)
);

create index if not exists user_subcompany_permissions_membership_id_idx
  on public.user_subcompany_permissions (membership_id);

alter table public.user_subcompany_permissions enable row level security;

create policy user_subcompany_permissions_select_own_membership
  on public.user_subcompany_permissions for select
  to authenticated
  using (
    exists (
      select 1 from public.user_company_memberships m
      where m.id = user_subcompany_permissions.membership_id
        and m.user_id = auth.uid()
    )
  );

create policy user_subcompany_permissions_select_super_admin
  on public.user_subcompany_permissions for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
  );

create policy user_subcompany_permissions_mutate_super_admin
  on public.user_subcompany_permissions for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
  );

create policy user_subcompany_permissions_insert_rental_admin
  on public.user_subcompany_permissions for insert
  to authenticated
  with check (public.user_manages_membership_subcompany_perms(membership_id));

create policy user_subcompany_permissions_delete_rental_admin
  on public.user_subcompany_permissions for delete
  to authenticated
  using (public.user_manages_membership_subcompany_perms(membership_id));

-- ---------------------------------------------------------------------------
-- Staff invitations (token verified in app; store hash)
-- ---------------------------------------------------------------------------
create table if not exists public.staff_invitations (
  id uuid primary key default gen_random_uuid(),
  parent_company_id uuid not null references public.companies (id) on delete cascade,
  email text not null,
  token_hash text not null,
  proposed_role text not null default 'viewer' check (
    proposed_role in ('owner', 'admin', 'operations', 'finance', 'viewer')
  ),
  invited_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists staff_invitations_parent_email_idx
  on public.staff_invitations (parent_company_id, lower(email));

create unique index if not exists staff_invitations_pending_token_hash_idx
  on public.staff_invitations (token_hash)
  where accepted_at is null;

alter table public.staff_invitations enable row level security;

create policy staff_invitations_select_super_admin
  on public.staff_invitations for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
  );

create policy staff_invitations_select_rental_admin
  on public.staff_invitations for select
  to authenticated
  using (
    exists (
      select 1 from public.user_company_memberships m
      where m.user_id = auth.uid()
        and m.parent_company_id = staff_invitations.parent_company_id
        and m.status = 'active'
        and m.role in ('owner', 'admin')
    )
  );

create policy staff_invitations_insert_rental_admin
  on public.staff_invitations for insert
  to authenticated
  with check (
    exists (
      select 1 from public.user_company_memberships m
      where m.user_id = auth.uid()
        and m.parent_company_id = staff_invitations.parent_company_id
        and m.status = 'active'
        and m.role in ('owner', 'admin')
    )
  );

create policy staff_invitations_update_rental_admin
  on public.staff_invitations for update
  to authenticated
  using (
    exists (
      select 1 from public.user_company_memberships m
      where m.user_id = auth.uid()
        and m.parent_company_id = staff_invitations.parent_company_id
        and m.status = 'active'
        and m.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.user_company_memberships m
      where m.user_id = auth.uid()
        and m.parent_company_id = staff_invitations.parent_company_id
        and m.status = 'active'
        and m.role in ('owner', 'admin')
    )
  );

-- ---------------------------------------------------------------------------
-- company_contracts + versions (after memberships exist for RLS)
-- ---------------------------------------------------------------------------
create table if not exists public.company_contracts (
  id uuid primary key default gen_random_uuid(),
  parent_company_id uuid not null unique references public.companies (id) on delete cascade,
  current_version_id uuid,
  status text not null default 'active' check (status in ('active', 'pending_renewal', 'terminated')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists company_contracts_parent_company_id_idx
  on public.company_contracts (parent_company_id);

create table if not exists public.company_contract_versions (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.company_contracts (id) on delete cascade,
  version_number integer not null,
  snapshot jsonb not null default '{}'::jsonb,
  signed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (contract_id, version_number)
);

create index if not exists company_contract_versions_contract_id_idx
  on public.company_contract_versions (contract_id, version_number desc);

alter table public.company_contracts
  drop constraint if exists company_contracts_current_version_fk;

alter table public.company_contracts
  add constraint company_contracts_current_version_fk
  foreign key (current_version_id) references public.company_contract_versions (id)
  on delete set null;

create or replace function public.company_contracts_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists company_contracts_set_updated_at on public.company_contracts;
create trigger company_contracts_set_updated_at
  before update on public.company_contracts
  for each row execute procedure public.company_contracts_set_updated_at();

alter table public.company_contracts enable row level security;
alter table public.company_contract_versions enable row level security;

create policy company_contracts_select_super_admin
  on public.company_contracts for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
  );

create policy company_contracts_select_rental_membership
  on public.company_contracts for select
  to authenticated
  using (
    exists (
      select 1 from public.user_company_memberships m
      where m.user_id = auth.uid()
        and m.parent_company_id = company_contracts.parent_company_id
        and m.status = 'active'
    )
  );

create policy company_contract_versions_select_super_admin
  on public.company_contract_versions for select
  to authenticated
  using (
    exists (
      select 1 from public.company_contracts cc
      join public.profiles p on p.id = auth.uid() and p.role = 'super_admin'
      where cc.id = company_contract_versions.contract_id
    )
  );

create policy company_contract_versions_select_rental_membership
  on public.company_contract_versions for select
  to authenticated
  using (
    exists (
      select 1 from public.company_contracts cc
      join public.user_company_memberships m
        on m.user_id = auth.uid()
        and m.parent_company_id = cc.parent_company_id
        and m.status = 'active'
      where cc.id = company_contract_versions.contract_id
    )
  );

-- ---------------------------------------------------------------------------
-- Link change requests to contract (nullable until backfill)
-- ---------------------------------------------------------------------------
alter table public.company_contract_change_requests
  add column if not exists contract_id uuid references public.company_contracts (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Backfill: one contract per company + version 1 snapshot
-- ---------------------------------------------------------------------------
insert into public.company_contracts (parent_company_id, status)
select c.id, case when c.contract_status = 'pending_renewal' then 'pending_renewal' else 'active' end
from public.companies c
where not exists (
  select 1 from public.company_contracts x where x.parent_company_id = c.id
);

insert into public.company_contract_versions (contract_id, version_number, snapshot, signed_at)
select
  cc.id,
  coalesce(c.contract_version, 1),
  jsonb_build_object(
    'name', c.name,
    'legal_name', c.legal_name,
    'company_number', c.company_number,
    'registered_address_line1', c.registered_address_line1,
    'registered_address_line2', c.registered_address_line2,
    'registered_town', c.registered_town,
    'registered_county', c.registered_county,
    'registered_postcode', c.registered_postcode,
    'country', c.country,
    'primary_contact_first_name', c.primary_contact_first_name,
    'primary_contact_last_name', c.primary_contact_last_name,
    'primary_contact_dob', c.primary_contact_dob,
    'primary_contact_phone', c.primary_contact_phone,
    'primary_contact_email', c.primary_contact_email,
    'notes', c.notes
  ),
  c.created_at
from public.company_contracts cc
join public.companies c on c.id = cc.parent_company_id
where not exists (
  select 1 from public.company_contract_versions v where v.contract_id = cc.id
);

update public.company_contracts cc
set current_version_id = v.id
from public.company_contract_versions v
where v.contract_id = cc.id
  and v.version_number = (
    select max(v2.version_number) from public.company_contract_versions v2 where v2.contract_id = cc.id
  )
  and cc.current_version_id is null;

update public.company_contract_change_requests r
set contract_id = cc.id
from public.company_contracts cc
where cc.parent_company_id = r.parent_company_id
  and r.contract_id is null;

-- Existing tenants with rental users: skip mandatory onboarding wizard
update public.companies c
set rental_onboarding_completed_at = now()
where c.rental_onboarding_completed_at is null
  and exists (
    select 1 from public.profiles p
    where p.role = 'rental_company'
      and p.company_id = c.id
  );

-- ---------------------------------------------------------------------------
-- Backfill memberships from profiles (rental_company)
-- ---------------------------------------------------------------------------
insert into public.user_company_memberships (user_id, parent_company_id, role, subcompany_scope, status)
select
  p.id,
  p.company_id,
  case
    when p.company_role = 'admin' then 'owner'
    else 'operations'
  end,
  'all',
  'active'
from public.profiles p
where p.role = 'rental_company'
  and p.company_id is not null
on conflict (user_id, parent_company_id) do nothing;

-- ---------------------------------------------------------------------------
-- Rental access via membership: additional RLS on companies / subcompanies / change requests
-- ---------------------------------------------------------------------------
create policy companies_select_rental_membership
  on public.companies for select
  to authenticated
  using (
    exists (
      select 1 from public.user_company_memberships m
      where m.user_id = auth.uid()
        and m.parent_company_id = companies.id
        and m.status = 'active'
    )
  );

create policy companies_update_rental_membership
  on public.companies for update
  to authenticated
  using (
    exists (
      select 1 from public.user_company_memberships m
      where m.user_id = auth.uid()
        and m.parent_company_id = companies.id
        and m.status = 'active'
        and m.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.user_company_memberships m
      where m.user_id = auth.uid()
        and m.parent_company_id = companies.id
        and m.status = 'active'
        and m.role in ('owner', 'admin')
    )
  );

create policy subcompanies_select_rental_membership
  on public.subcompanies for select
  to authenticated
  using (
    exists (
      select 1 from public.user_company_memberships m
      where m.user_id = auth.uid()
        and m.parent_company_id = subcompanies.parent_company_id
        and m.status = 'active'
        and (
          m.subcompany_scope = 'all'
          or exists (
            select 1 from public.user_subcompany_permissions usp
            where usp.membership_id = m.id
              and usp.subcompany_id = subcompanies.id
          )
        )
    )
  );

create policy subcompanies_insert_rental_membership
  on public.subcompanies for insert
  to authenticated
  with check (
    exists (
      select 1 from public.user_company_memberships m
      where m.user_id = auth.uid()
        and m.parent_company_id = subcompanies.parent_company_id
        and m.status = 'active'
        and m.role in ('owner', 'admin', 'operations')
    )
  );

create policy subcompanies_update_rental_membership
  on public.subcompanies for update
  to authenticated
  using (
    exists (
      select 1 from public.user_company_memberships m
      where m.user_id = auth.uid()
        and m.parent_company_id = subcompanies.parent_company_id
        and m.status = 'active'
        and m.role in ('owner', 'admin', 'operations')
    )
  )
  with check (
    exists (
      select 1 from public.user_company_memberships m
      where m.user_id = auth.uid()
        and m.parent_company_id = subcompanies.parent_company_id
        and m.status = 'active'
        and m.role in ('owner', 'admin', 'operations')
    )
  );

create policy subcompanies_delete_rental_membership
  on public.subcompanies for delete
  to authenticated
  using (
    exists (
      select 1 from public.user_company_memberships m
      where m.user_id = auth.uid()
        and m.parent_company_id = subcompanies.parent_company_id
        and m.status = 'active'
        and m.role in ('owner', 'admin')
        and not subcompanies.is_primary
    )
  );

create policy company_contract_change_requests_select_rental_membership
  on public.company_contract_change_requests for select
  to authenticated
  using (
    exists (
      select 1 from public.user_company_memberships m
      where m.user_id = auth.uid()
        and m.parent_company_id = company_contract_change_requests.parent_company_id
        and m.status = 'active'
    )
  );

create policy company_contract_change_requests_insert_rental_membership
  on public.company_contract_change_requests for insert
  to authenticated
  with check (
    status = 'pending_signature'
    and exists (
      select 1 from public.user_company_memberships m
      where m.user_id = auth.uid()
        and m.parent_company_id = company_contract_change_requests.parent_company_id
        and m.status = 'active'
        and m.role in ('owner', 'admin')
    )
  );

-- ---------------------------------------------------------------------------
-- handle_new_user: create membership for rental invitees
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meta jsonb;
  v_full text;
  v_first text;
  v_last text;
  v_app_role text;
  v_company_txt text;
  v_company_id uuid;
  v_display text;
  v_company_role text;
  v_membership_role text;
  v_prop_role text;
begin
  v_meta := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_first := nullif(trim(v_meta->>'first_name'), '');
  v_last := nullif(trim(v_meta->>'last_name'), '');
  v_full := nullif(trim(v_meta->>'full_name'), '');
  v_app_role := lower(nullif(trim(v_meta->>'app_role'), ''));

  v_display := coalesce(
    v_full,
    case
      when v_first is not null and v_last is not null then v_first || ' ' || v_last
      when v_first is not null then v_first
      else split_part(new.email, '@', 1)
    end
  );

  v_company_txt := nullif(trim(v_meta->>'company_id'), '');
  v_company_id := null;
  if v_company_txt is not null then
    begin
      v_company_id := v_company_txt::uuid;
    exception when invalid_text_representation then
      v_company_id := null;
    end;
  end if;

  v_company_role := lower(nullif(trim(v_meta->>'company_role'), ''));
  v_prop_role := lower(nullif(trim(v_meta->>'rental_membership_role'), ''));

  if v_app_role = 'rental_company' and v_company_id is not null then
    insert into public.profiles (id, display_name, role, company_id, company_role)
    values (
      new.id,
      v_display,
      'rental_company',
      v_company_id,
      case when v_company_role = 'staff' then 'staff' else 'admin' end
    )
    on conflict (id) do update set
      display_name = excluded.display_name,
      role = excluded.role,
      company_id = excluded.company_id,
      company_role = excluded.company_role,
      updated_at = now();

    v_membership_role := case
      when v_prop_role in ('owner', 'admin', 'operations', 'finance', 'viewer') then v_prop_role
      when v_company_role = 'staff' then 'operations'
      else 'owner'
    end;

    insert into public.user_company_memberships (user_id, parent_company_id, role, subcompany_scope, status)
    values (new.id, v_company_id, v_membership_role, 'all', 'active')
    on conflict (user_id, parent_company_id) do update set
      status = 'active',
      role = excluded.role,
      updated_at = now();
  else
    insert into public.profiles (id, display_name, role)
    values (new.id, v_display, 'driver')
    on conflict (id) do update set
      display_name = excluded.display_name,
      updated_at = now();
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- apply_company_contract_change: parent full update; new version; selective primary mirror
-- ---------------------------------------------------------------------------
create or replace function public.apply_company_contract_change(p_change_id uuid, p_signed_by uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.company_contract_change_requests%rowtype;
  v_primary_subcompany_id uuid;
  v_contract_id uuid;
  v_next_ver integer;
  v_snapshot jsonb;
  v_new_version_id uuid;
begin
  select * into req
  from public.company_contract_change_requests
  where id = p_change_id
  for update;

  if req.id is null then
    raise exception 'Contract change request not found';
  end if;
  if req.status <> 'pending_signature' then
    raise exception 'Contract change request is not pending signature';
  end if;

  select s.id into v_primary_subcompany_id
  from public.subcompanies s
  where s.parent_company_id = req.parent_company_id
    and s.is_primary
  order by s.created_at asc, s.id asc
  limit 1;

  if v_primary_subcompany_id is null then
    raise exception 'Primary subcompany not found for parent company %', req.parent_company_id;
  end if;

  select cc.id into v_contract_id
  from public.company_contracts cc
  where cc.parent_company_id = req.parent_company_id
  limit 1;

  if v_contract_id is null then
    insert into public.company_contracts (parent_company_id, status)
    values (req.parent_company_id, 'active')
    returning id into v_contract_id;
  end if;

  update public.companies c
  set
    name = req.proposed_name,
    legal_name = req.proposed_legal_name,
    company_number = req.proposed_company_number,
    registered_address_line1 = req.proposed_registered_address_line1,
    registered_address_line2 = req.proposed_registered_address_line2,
    registered_town = req.proposed_registered_town,
    registered_county = req.proposed_registered_county,
    registered_postcode = req.proposed_registered_postcode,
    country = req.proposed_country,
    primary_contact_first_name = req.proposed_primary_contact_first_name,
    primary_contact_last_name = req.proposed_primary_contact_last_name,
    primary_contact_dob = req.proposed_primary_contact_dob,
    primary_contact_phone = req.proposed_primary_contact_phone,
    primary_contact_email = req.proposed_primary_contact_email,
    notes = req.proposed_notes,
    contract_status = 'active',
    contract_version = coalesce(c.contract_version, 1) + 1
  where c.id = req.parent_company_id;

  select coalesce(max(v.version_number), 0) + 1 into v_next_ver
  from public.company_contract_versions v
  where v.contract_id = v_contract_id;

  v_snapshot := jsonb_build_object(
    'name', req.proposed_name,
    'legal_name', req.proposed_legal_name,
    'company_number', req.proposed_company_number,
    'registered_address_line1', req.proposed_registered_address_line1,
    'registered_address_line2', req.proposed_registered_address_line2,
    'registered_town', req.proposed_registered_town,
    'registered_county', req.proposed_registered_county,
    'registered_postcode', req.proposed_registered_postcode,
    'country', req.proposed_country,
    'primary_contact_first_name', req.proposed_primary_contact_first_name,
    'primary_contact_last_name', req.proposed_primary_contact_last_name,
    'primary_contact_dob', req.proposed_primary_contact_dob,
    'primary_contact_phone', req.proposed_primary_contact_phone,
    'primary_contact_email', req.proposed_primary_contact_email,
    'notes', req.proposed_notes
  );

  insert into public.company_contract_versions (contract_id, version_number, snapshot, signed_at)
  values (v_contract_id, v_next_ver, v_snapshot, now())
  returning id into v_new_version_id;

  update public.company_contracts
  set
    current_version_id = v_new_version_id,
    status = 'active'
  where id = v_contract_id;

  -- Selective mirror: operational / trading label + primary contact only (not legal entity fields).
  update public.subcompanies s
  set
    name = req.proposed_name,
    primary_contact_first_name = req.proposed_primary_contact_first_name,
    primary_contact_last_name = req.proposed_primary_contact_last_name,
    primary_contact_dob = req.proposed_primary_contact_dob,
    primary_contact_phone = req.proposed_primary_contact_phone,
    primary_contact_email = req.proposed_primary_contact_email,
    status = 'active'
  where s.id = v_primary_subcompany_id;

  update public.company_contract_change_requests
  set
    status = 'signed',
    signed_at = now(),
    signed_by = p_signed_by,
    contract_id = v_contract_id
  where id = p_change_id;
end;
$$;

comment on function public.apply_company_contract_change(uuid, uuid) is
  'Applies signed amendment: updates parent company, records contract version, mirrors only trading name and primary contact to primary subcompany.';
