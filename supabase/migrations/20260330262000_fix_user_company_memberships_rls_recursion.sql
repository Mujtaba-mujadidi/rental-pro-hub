-- Membership RLS policies that subqueried user_company_memberships caused infinite recursion.
-- Replace with SECURITY DEFINER helpers that read memberships with row_security off.

create or replace function public.user_is_rental_owner_or_admin_for_company(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.user_company_memberships m
    where m.user_id = auth.uid()
      and m.parent_company_id = p_company_id
      and m.status = 'active'
      and m.role in ('owner', 'admin')
  );
$$;

create or replace function public.user_manages_membership_subcompany_perms(p_membership_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.user_company_memberships m
    inner join public.user_company_memberships me
      on me.parent_company_id = m.parent_company_id
      and me.user_id = auth.uid()
      and me.status = 'active'
      and me.role in ('owner', 'admin')
    where m.id = p_membership_id
  );
$$;

revoke all on function public.user_is_rental_owner_or_admin_for_company(uuid) from public;
revoke all on function public.user_manages_membership_subcompany_perms(uuid) from public;
grant execute on function public.user_is_rental_owner_or_admin_for_company(uuid) to authenticated;
grant execute on function public.user_manages_membership_subcompany_perms(uuid) to authenticated;

drop policy if exists user_company_memberships_select_rental_admin on public.user_company_memberships;
drop policy if exists user_company_memberships_update_rental_admin on public.user_company_memberships;

create policy user_company_memberships_select_rental_admin
  on public.user_company_memberships for select
  to authenticated
  using (public.user_is_rental_owner_or_admin_for_company(parent_company_id));

create policy user_company_memberships_update_rental_admin
  on public.user_company_memberships for update
  to authenticated
  using (public.user_is_rental_owner_or_admin_for_company(parent_company_id))
  with check (public.user_is_rental_owner_or_admin_for_company(parent_company_id));

drop policy if exists user_subcompany_permissions_insert_rental_admin on public.user_subcompany_permissions;
drop policy if exists user_subcompany_permissions_delete_rental_admin on public.user_subcompany_permissions;

create policy user_subcompany_permissions_insert_rental_admin
  on public.user_subcompany_permissions for insert
  to authenticated
  with check (public.user_manages_membership_subcompany_perms(membership_id));

create policy user_subcompany_permissions_delete_rental_admin
  on public.user_subcompany_permissions for delete
  to authenticated
  using (public.user_manages_membership_subcompany_perms(membership_id));
