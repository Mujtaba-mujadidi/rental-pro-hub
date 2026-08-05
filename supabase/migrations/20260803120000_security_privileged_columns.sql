-- P0: block privilege escalation and lifecycle hijacks via broad UPDATE RLS.
-- Service-role / postgres / supabase_admin still perform privileged writes.

create or replace function public.is_service_or_db_admin()
returns boolean
language sql
stable
as $$
  select
    current_user in ('postgres', 'supabase_admin', 'service_role')
    or coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    or coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
$$;

revoke all on function public.is_service_or_db_admin() from public;
grant execute on function public.is_service_or_db_admin() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- profiles: users may not self-assign role / company_role / arbitrary company_id
-- ---------------------------------------------------------------------------

create or replace function public.profiles_guard_privileged_columns()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if public.is_service_or_db_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.role is distinct from 'driver'
       or new.company_role is not null
       or new.company_id is not null then
      raise exception 'profiles insert may only create a driver row for the signed-in user';
    end if;
    if new.id is distinct from auth.uid() then
      raise exception 'profiles insert id must match auth.uid()';
    end if;
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'profiles.role cannot be changed by the signed-in user';
  end if;
  if new.company_role is distinct from old.company_role then
    raise exception 'profiles.company_role cannot be changed by the signed-in user';
  end if;
  -- company_id may be refreshed to the already-authorised tenant (onboarding),
  -- but not pointed at an arbitrary other company.
  if new.company_id is distinct from old.company_id then
    if new.company_id is null then
      raise exception 'profiles.company_id cannot be cleared by the signed-in user';
    end if;
    if not exists (
      select 1
      from public.user_company_memberships m
      where m.user_id = auth.uid()
        and m.parent_company_id = new.company_id
        and m.status = 'active'
    ) then
      raise exception 'profiles.company_id must match an active membership';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_privileged_columns on public.profiles;
create trigger profiles_guard_privileged_columns
  before insert or update on public.profiles
  for each row
  execute function public.profiles_guard_privileged_columns();

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
  on public.profiles for insert
  to authenticated
  with check (
    id = auth.uid()
    and role = 'driver'
    and company_id is null
    and company_role is null
  );

-- ---------------------------------------------------------------------------
-- memberships: identity keys immutable under JWT; role/status still via staff actions
-- ---------------------------------------------------------------------------

create or replace function public.memberships_guard_identity_columns()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if public.is_service_or_db_admin() then
    return new;
  end if;

  if new.user_id is distinct from old.user_id
     or new.parent_company_id is distinct from old.parent_company_id then
    raise exception 'membership user_id and parent_company_id are immutable';
  end if;

  return new;
end;
$$;

drop trigger if exists memberships_guard_identity_columns on public.user_company_memberships;
create trigger memberships_guard_identity_columns
  before update on public.user_company_memberships
  for each row
  execute function public.memberships_guard_identity_columns();

-- ---------------------------------------------------------------------------
-- companies: block lifecycle / contract / credential hijacks under JWT
-- ---------------------------------------------------------------------------

create or replace function public.companies_guard_privileged_columns()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if public.is_service_or_db_admin() then
    return new;
  end if;

  if new.status is distinct from old.status
     or new.contract_status is distinct from old.contract_status
     or new.contract_version is distinct from old.contract_version
     or new.deletion_phase is distinct from old.deletion_phase
     or new.offboarding_started_at is distinct from old.offboarding_started_at
     or new.offboarding_ends_at is distinct from old.offboarding_ends_at
     or new.access_blocked_at is distinct from old.access_blocked_at
     or new.deletion_requested_by is distinct from old.deletion_requested_by
     or new.superseded_by_company_id is distinct from old.superseded_by_company_id
     or new.primary_contact_user_id is distinct from old.primary_contact_user_id
     or new.invite_last_sent_at is distinct from old.invite_last_sent_at
     or new.pending_primary_invite_after_contract_signed
          is distinct from old.pending_primary_invite_after_contract_signed
     or new.logo_storage_path is distinct from old.logo_storage_path
     or new.fleet_tracking_enabled is distinct from old.fleet_tracking_enabled
     or new.fleet_tracking_account is distinct from old.fleet_tracking_account
     or new.fleet_tracking_password_encrypted
          is distinct from old.fleet_tracking_password_encrypted
     or new.legal_name is distinct from old.legal_name
     or new.company_number is distinct from old.company_number
  then
    raise exception 'companies privileged columns cannot be changed by the signed-in user';
  end if;

  return new;
end;
$$;

drop trigger if exists companies_guard_privileged_columns on public.companies;
create trigger companies_guard_privileged_columns
  before update on public.companies
  for each row
  execute function public.companies_guard_privileged_columns();

-- ---------------------------------------------------------------------------
-- Exact driver licence lookup (no global PII scan)
-- ---------------------------------------------------------------------------

create or replace function public.normalize_driving_licence(raw text)
returns text
language sql
immutable
as $$
  select nullif(upper(regexp_replace(coalesce(raw, ''), '\s+', '', 'g')), '');
$$;

alter table public.driver_profiles
  add column if not exists driving_licence_number_normalized text
    generated always as (public.normalize_driving_licence(driving_licence_number)) stored;

create index if not exists driver_profiles_licence_normalized_idx
  on public.driver_profiles (driving_licence_number_normalized)
  where driving_licence_number_normalized is not null;
