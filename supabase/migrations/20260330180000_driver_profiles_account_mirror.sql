-- Mirror auth account email and ban end time on driver_profiles for scalable admin list queries
-- (no full auth user scans). Keeps filters/search in SQL with indexes.

alter table public.driver_profiles
  add column if not exists account_email text,
  add column if not exists account_banned_until timestamptz;

create index if not exists driver_profiles_created_at_desc_idx
  on public.driver_profiles (created_at desc);

create index if not exists driver_profiles_account_email_lower_idx
  on public.driver_profiles (lower(account_email));

create index if not exists driver_profiles_banned_until_idx
  on public.driver_profiles (account_banned_until)
  where account_banned_until is not null;

update public.driver_profiles dp
set
  account_email = u.email,
  account_banned_until = u.banned_until
from auth.users u
where dp.user_id = u.id;

-- Keep trigger in sync with 20260329130000 (onboarding) + mirrored columns.
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
      address_postcode,
      account_email,
      account_banned_until
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
      upper(replace(trim(v_meta->>'address_postcode'), ' ', '')),
      new.email,
      null
    );
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
