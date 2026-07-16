-- Add org-level role for rental company users while keeping profiles.role as app-area role.

alter table public.profiles
  add column if not exists company_role text;

alter table public.profiles drop constraint if exists profiles_company_role_check;

alter table public.profiles
  add constraint profiles_company_role_check
  check (company_role is null or company_role in ('admin', 'staff'));

update public.profiles
set company_role = 'admin'
where role = 'rental_company'
  and company_role is null;

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
  v_company_role text;
  v_display text;
begin
  v_meta := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_first := nullif(trim(v_meta->>'first_name'), '');
  v_last := nullif(trim(v_meta->>'last_name'), '');
  v_full := nullif(trim(v_meta->>'full_name'), '');
  v_app_role := lower(nullif(trim(v_meta->>'app_role'), ''));
  v_company_role := lower(nullif(trim(v_meta->>'company_role'), ''));
  if v_company_role not in ('admin', 'staff') then
    v_company_role := 'admin';
  end if;

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
    insert into public.profiles (id, display_name, role, company_id, company_role)
    values (new.id, v_display, 'rental_company', v_company_id, v_company_role)
    on conflict (id) do update set
      display_name = excluded.display_name,
      role = excluded.role,
      company_id = excluded.company_id,
      company_role = excluded.company_role,
      updated_at = now();
  else
    insert into public.profiles (id, display_name, role, company_role)
    values (new.id, v_display, 'driver', null)
    on conflict (id) do update set
      display_name = excluded.display_name,
      company_role = null,
      updated_at = now();
  end if;

  return new;
end;
$$;

comment on column public.profiles.company_role is 'Role within company for rental_company users (e.g. admin, staff).';
