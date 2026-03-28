-- Phase 1: profiles, rental companies, subcompanies, staff, roles, RLS

-- -----------------------------------------------------------------------------
-- Extensions
-- -----------------------------------------------------------------------------
create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
do $$ begin
  create type public.user_type as enum ('platform_admin', 'company_staff', 'driver');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.company_status as enum ('active', 'suspended');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.staff_scope as enum ('company', 'subcompany');
exception
  when duplicate_object then null;
end $$;

-- -----------------------------------------------------------------------------
-- Core tables
-- -----------------------------------------------------------------------------
create table public.user_profile (
  id uuid primary key references auth.users (id) on delete cascade,
  user_type public.user_type not null default 'driver',
  display_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.rental_company (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  address text,
  contact_number text,
  company_reg_no text,
  status public.company_status not null default 'active',
  created_at timestamptz not null default now()
);

create table public.subcompany (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.rental_company (id) on delete cascade,
  name text not null,
  address text,
  email text,
  contact_number text,
  company_no text,
  logo_path text,
  created_at timestamptz not null default now()
);

create index subcompany_company_id_idx on public.subcompany (company_id);

create table public.role (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null
);

create table public.company_staff (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid not null references public.rental_company (id) on delete cascade,
  display_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, company_id)
);

create index company_staff_user_id_idx on public.company_staff (user_id);
create index company_staff_company_id_idx on public.company_staff (company_id);

create table public.staff_subcompany_access (
  company_staff_id uuid not null references public.company_staff (id) on delete cascade,
  subcompany_id uuid not null references public.subcompany (id) on delete cascade,
  primary key (company_staff_id, subcompany_id)
);

create table public.staff_role_assignment (
  id uuid primary key default gen_random_uuid(),
  company_staff_id uuid not null references public.company_staff (id) on delete cascade,
  role_id uuid not null references public.role (id) on delete cascade,
  scope public.staff_scope not null default 'company',
  subcompany_id uuid references public.subcompany (id) on delete cascade,
  unique (company_staff_id, role_id)
);

-- -----------------------------------------------------------------------------
-- Seed roles
-- -----------------------------------------------------------------------------
insert into public.role (code, name) values
  ('owner', 'Owner'),
  ('fleet', 'Fleet'),
  ('finance', 'Finance'),
  ('read_only', 'Read only')
on conflict (code) do nothing;

-- -----------------------------------------------------------------------------
-- Auth: auto-create profile
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Always default to driver; promote platform_admin only via SQL (see README).
  insert into public.user_profile (id, display_name, user_type)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'driver'::public.user_type
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER for stable auth checks)
-- -----------------------------------------------------------------------------
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_profile p
    where p.id = auth.uid() and p.user_type = 'platform_admin'::public.user_type
  );
$$;

create or replace function public.is_company_staff_for_company(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.company_staff cs
    where cs.user_id = auth.uid()
      and cs.company_id = p_company_id
      and cs.is_active
  );
$$;

-- -----------------------------------------------------------------------------
-- RPC: platform admin links an existing auth user to a company as staff (+ owner role)
-- -----------------------------------------------------------------------------
create or replace function public.admin_add_company_staff(
  p_company_id uuid,
  p_email text,
  p_display_name text
) returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
  v_staff_id uuid;
  v_role_owner uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'not allowed';
  end if;

  select id into v_user_id
  from auth.users
  where lower(email) = lower(trim(p_email));

  if v_user_id is null then
    raise exception 'No user with that email. They must sign up first.';
  end if;

  insert into public.company_staff (user_id, company_id, display_name)
  values (v_user_id, p_company_id, coalesce(nullif(trim(p_display_name), ''), split_part(p_email, '@', 1)))
  on conflict (user_id, company_id)
  do update set display_name = excluded.display_name, is_active = true
  returning id into v_staff_id;

  select id into v_role_owner from public.role where code = 'owner' limit 1;

  if v_role_owner is not null
     and not exists (
       select 1 from public.staff_role_assignment s
       where s.company_staff_id = v_staff_id and s.role_id = v_role_owner
     ) then
    insert into public.staff_role_assignment (company_staff_id, role_id, scope)
    values (v_staff_id, v_role_owner, 'company'::public.staff_scope);
  end if;

  update public.user_profile
  set user_type = 'company_staff'::public.user_type, updated_at = now()
  where id = v_user_id;

  return v_staff_id;
end;
$$;

grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.is_company_staff_for_company(uuid) to authenticated;
grant execute on function public.admin_add_company_staff(uuid, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.user_profile enable row level security;
alter table public.rental_company enable row level security;
alter table public.subcompany enable row level security;
alter table public.company_staff enable row level security;
alter table public.staff_subcompany_access enable row level security;
alter table public.staff_role_assignment enable row level security;
alter table public.role enable row level security;

-- role: readable by any signed-in user (small lookup table)
create policy role_select_authenticated on public.role
  for select to authenticated
  using (true);

-- user_profile
create policy user_profile_select on public.user_profile
  for select to authenticated
  using (id = auth.uid() or public.is_platform_admin());

create policy user_profile_update_self on public.user_profile
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy user_profile_update_admin on public.user_profile
  for update to authenticated
  using (public.is_platform_admin())
  with check (true);

-- rental_company
create policy rental_company_select on public.rental_company
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_staff_for_company(id)
  );

create policy rental_company_insert_admin on public.rental_company
  for insert to authenticated
  with check (public.is_platform_admin());

create policy rental_company_update_admin on public.rental_company
  for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- subcompany
create policy subcompany_select on public.subcompany
  for select to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1
      from public.company_staff cs
      where cs.user_id = auth.uid()
        and cs.is_active
        and cs.company_id = subcompany.company_id
        and (
          not exists (
            select 1 from public.staff_subcompany_access ssa
            where ssa.company_staff_id = cs.id
          )
          or exists (
            select 1 from public.staff_subcompany_access ssa
            where ssa.company_staff_id = cs.id
              and ssa.subcompany_id = subcompany.id
          )
        )
    )
  );

create policy subcompany_insert on public.subcompany
  for insert to authenticated
  with check (
    public.is_platform_admin()
    or public.is_company_staff_for_company(company_id)
  );

create policy subcompany_update on public.subcompany
  for update to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_staff_for_company(company_id)
  )
  with check (
    public.is_platform_admin()
    or public.is_company_staff_for_company(company_id)
  );

create policy subcompany_delete on public.subcompany
  for delete to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_staff_for_company(company_id)
  );

-- company_staff
create policy company_staff_select on public.company_staff
  for select to authenticated
  using (
    public.is_platform_admin()
    or user_id = auth.uid()
    or exists (
      select 1 from public.company_staff me
      where me.user_id = auth.uid()
        and me.company_id = company_staff.company_id
        and me.is_active
    )
  );

-- Inserts only via admin RPC / service role; block direct client inserts
-- (admin_add_company_staff runs as definer)

-- staff_subcompany_access
create policy staff_subcompany_access_select on public.staff_subcompany_access
  for select to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.company_staff cs
      where cs.id = staff_subcompany_access.company_staff_id
        and cs.user_id = auth.uid()
        and cs.is_active
    )
    or exists (
      select 1 from public.company_staff cs
      join public.company_staff cs2 on cs2.company_id = cs.company_id
      where staff_subcompany_access.company_staff_id = cs.id
        and cs2.user_id = auth.uid()
        and cs2.is_active
    )
  );

create policy staff_subcompany_access_mutate on public.staff_subcompany_access
  for all to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.company_staff cs
      where cs.id = staff_subcompany_access.company_staff_id
        and cs.user_id = auth.uid()
        and cs.is_active
    )
  )
  with check (
    public.is_platform_admin()
    or exists (
      select 1 from public.company_staff cs
      where cs.id = staff_subcompany_access.company_staff_id
        and cs.user_id = auth.uid()
        and cs.is_active
    )
  );

-- staff_role_assignment
create policy staff_role_assignment_select on public.staff_role_assignment
  for select to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.company_staff cs
      where cs.id = staff_role_assignment.company_staff_id
        and (
          cs.user_id = auth.uid()
          or exists (
            select 1 from public.company_staff me
            where me.user_id = auth.uid()
              and me.company_id = cs.company_id
              and me.is_active
          )
        )
    )
  );
