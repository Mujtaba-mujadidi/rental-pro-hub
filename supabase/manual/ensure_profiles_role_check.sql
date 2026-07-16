-- Fix: "new row for relation profiles violates check constraint profiles_role_check"
-- Progress: ../../docs/PROGRESS.md
-- when logging in as a rental company user (role must allow 'rental_company').
--
-- Older databases may only allow ('driver', 'super_admin'). This matches
-- migration 20260330220000_rental_company_profiles_invite.sql.

alter table public.profiles drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('driver', 'super_admin', 'rental_company'));

notify pgrst, 'reload schema';
