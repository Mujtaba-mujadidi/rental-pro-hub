-- Rental admins could insert/delete subcompany permissions but had no UPDATE policy.
-- Upsert / ON CONFLICT DO UPDATE paths require UPDATE RLS; align with insert/delete checks.

drop policy if exists user_subcompany_permissions_update_rental_admin on public.user_subcompany_permissions;

create policy user_subcompany_permissions_update_rental_admin
  on public.user_subcompany_permissions for update
  to authenticated
  using (public.user_manages_membership_subcompany_perms(membership_id))
  with check (public.user_manages_membership_subcompany_perms(membership_id));
