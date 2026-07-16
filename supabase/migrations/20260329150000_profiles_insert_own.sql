-- Allow each authenticated user to insert their own profile row once.
-- Needed when auth.users existed before handle_new_user (e.g. admin created in Dashboard)
-- or the trigger did not run — otherwise the app redirects to /login forever.

create policy profiles_insert_own
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());
