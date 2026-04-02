-- profiles_select_rental_admin_peers caused infinite RLS recursion: evaluating it queried
-- user_company_memberships, whose policies reference profiles again.
-- Peer display names for the staff directory are loaded with the service role in the app instead.

drop policy if exists profiles_select_rental_admin_peers on public.profiles;
