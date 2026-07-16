-- If you already ran 20260329120000 with NOT NULL licence columns, relax them and align trigger
-- with onboarding (licences collected after login).

alter table public.driver_profiles alter column driving_licence_number drop not null;
alter table public.driver_profiles alter column driving_licence_expiry drop not null;
alter table public.driver_profiles alter column phv_licence_number drop not null;
alter table public.driver_profiles alter column phv_licensing_authority drop not null;
alter table public.driver_profiles alter column phv_licence_expiry drop not null;

drop trigger if exists on_auth_user_created on auth.users;

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

  if coalesce(v_meta->>'signup_flow', '') = 'driver'
     and v_first is not null
     and v_last is not null
     and nullif(trim(v_meta->>'date_of_birth'), '') is not null
     and nullif(trim(v_meta->>'phone'), '') is not null
     and nullif(trim(v_meta->>'address_line1'), '') is not null
     and nullif(trim(v_meta->>'address_town'), '') is not null
     and nullif(trim(v_meta->>'address_postcode'), '') is not null
  then
    insert into public.driver_profiles (
      user_id,
      first_name,
      last_name,
      date_of_birth,
      phone,
      address_line1,
      address_line2,
      address_town,
      address_county,
      address_postcode
    )
    values (
      new.id,
      v_first,
      v_last,
      (trim(v_meta->>'date_of_birth'))::date,
      trim(v_meta->>'phone'),
      trim(v_meta->>'address_line1'),
      nullif(trim(v_meta->>'address_line2'), ''),
      trim(v_meta->>'address_town'),
      nullif(trim(v_meta->>'address_county'), ''),
      upper(replace(trim(v_meta->>'address_postcode'), ' ', ''))
    );
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
