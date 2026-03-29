-- Private storage for driver licence images; paths stored on driver_profiles.
--
-- Prerequisite: run earlier migrations in timestamp order first (same folder):
--   1) 20260329100000_phase1_login_profiles.sql
--   2) 20260329120000_driver_profiles.sql
--   3) 20260329130000_driver_licences_onboarding.sql
-- Or: supabase db push / supabase migration up

alter table public.driver_profiles
  add column if not exists driving_licence_front_path text,
  add column if not exists driving_licence_back_path text,
  add column if not exists phv_licence_card_path text,
  add column if not exists onboarding_completed_at timestamptz;

insert into storage.buckets (id, name, public)
values ('driver-licences', 'driver-licences', false)
on conflict (id) do nothing;

drop policy if exists "driver_licences_select_own" on storage.objects;
drop policy if exists "driver_licences_insert_own" on storage.objects;
drop policy if exists "driver_licences_update_own" on storage.objects;
drop policy if exists "driver_licences_delete_own" on storage.objects;

-- Object path must be {auth.uid()}/… (first segment is the user id).
create policy "driver_licences_select_own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'driver-licences'
    and split_part(name, '/', 1) = auth.uid()::text
  );

create policy "driver_licences_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'driver-licences'
    and split_part(name, '/', 1) = auth.uid()::text
  );

create policy "driver_licences_update_own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'driver-licences'
    and split_part(name, '/', 1) = auth.uid()::text
  );

create policy "driver_licences_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'driver-licences'
    and split_part(name, '/', 1) = auth.uid()::text
  );
