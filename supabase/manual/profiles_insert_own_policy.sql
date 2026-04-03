-- Fix: "new row violates row-level security policy for table profiles" on INSERT
-- Lets each signed-in user insert exactly their own row (id = auth.uid()).
-- Run in Supabase Dashboard → SQL Editor on your cloud project.

drop policy if exists profiles_insert_own on public.profiles;

create policy profiles_insert_own
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

notify pgrst, 'reload schema';
