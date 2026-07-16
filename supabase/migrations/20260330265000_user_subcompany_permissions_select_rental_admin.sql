-- Rental owners/admins could not read other members' subcompany permission rows (staff UI / Access tab).
-- Allow select when the viewer manages that membership's company, matching insert/delete/update helpers.

drop policy if exists user_subcompany_permissions_select_rental_admin on public.user_subcompany_permissions;

create policy user_subcompany_permissions_select_rental_admin
  on public.user_subcompany_permissions for select
  to authenticated
  using (public.user_manages_membership_subcompany_perms(membership_id));
