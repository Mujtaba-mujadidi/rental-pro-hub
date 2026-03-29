-- Phase 1 (rebuild): remove legacy tenancy schema and create minimal `profiles` + auth trigger.

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'company_staff'
  ) then
    drop trigger if exists company_staff_sync_profile_user_type on public.company_staff;
  end if;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

drop function if exists public.sync_invite_staff_for_current_user() cascade;
drop function if exists public.apply_company_invite_metadata(uuid, text, jsonb) cascade;
drop function if exists public.sync_profile_company_staff() cascade;
drop function if exists public.company_add_existing_staff(uuid, text, text) cascade;
drop function if exists public.company_is_owner(uuid) cascade;
drop function if exists public.admin_add_company_staff(uuid, text, text) cascade;
drop function if exists public.is_company_staff_for_company(uuid) cascade;
drop function if exists public.is_platform_admin() cascade;
drop function if exists public.handle_new_user() cascade;

drop table if exists public.staff_role_assignment cascade;
drop table if exists public.staff_subcompany_access cascade;
drop table if exists public.company_staff cascade;
drop table if exists public.subcompany cascade;
drop table if exists public.rental_company cascade;
drop table if exists public.role cascade;
drop table if exists public.user_profile cascade;
drop table if exists public.profiles cascade;

drop type if exists public.staff_scope cascade;
drop type if exists public.company_status cascade;
drop type if exists public.user_type cascade;

-- -----------------------------------------------------------------------------
-- profiles (app role + display name)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  role text not null default 'driver' check (role in ('driver', 'super_admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy profiles_select_own
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

create policy profiles_update_own
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

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
begin
  v_meta := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_first := nullif(trim(v_meta->>'first_name'), '');
  v_last := nullif(trim(v_meta->>'last_name'), '');
  v_full := nullif(trim(v_meta->>'full_name'), '');

  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(
      v_full,
      case
        when v_first is not null and v_last is not null then v_first || ' ' || v_last
        when v_first is not null then v_first
        else split_part(new.email, '@', 1)
      end
    ),
    'driver'
  )
  on conflict (id) do update set
    display_name = excluded.display_name,
    updated_at = now();

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
