-- Rental company role, profile.company_id, primary contact invite tracking, auth trigger, RLS.

alter table public.profiles drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('driver', 'super_admin', 'rental_company'));

alter table public.profiles
  add column if not exists company_id uuid references public.companies (id) on delete set null;

create index if not exists profiles_company_id_idx on public.profiles (company_id);

alter table public.companies
  add column if not exists primary_contact_user_id uuid references auth.users (id) on delete set null;

alter table public.companies
  add column if not exists invite_last_sent_at timestamptz;

create index if not exists companies_primary_contact_user_id_idx on public.companies (primary_contact_user_id);

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

  if v_app_role = 'rental_company' and v_company_id is not null then
    insert into public.profiles (id, display_name, role, company_id)
    values (new.id, v_display, 'rental_company', v_company_id)
    on conflict (id) do update set
      display_name = excluded.display_name,
      role = excluded.role,
      company_id = excluded.company_id,
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

create policy companies_select_rental_company
  on public.companies for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'rental_company'
        and p.company_id = companies.id
    )
  );

comment on column public.profiles.company_id is 'Tenant company for rental_company role users.';
comment on column public.companies.primary_contact_user_id is 'Auth user id for the invited primary contact, when provisioned.';
comment on column public.companies.invite_last_sent_at is 'Last time an invite was sent to the primary contact email.';
