-- Idempotent ensure for hire draft RLS (see 20260722140000_hire_groups_draft_rls.sql).

create or replace function public.user_can_read_rentals_for_company(p_parent_company_id uuid)
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
    where m.parent_company_id = p_parent_company_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('owner', 'admin', 'operations', 'finance', 'viewer')
  );
$$;

revoke all on function public.user_can_read_rentals_for_company(uuid) from public;
grant execute on function public.user_can_read_rentals_for_company(uuid) to authenticated;

create or replace function public.user_can_write_rentals_for_company(p_parent_company_id uuid)
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
    where m.parent_company_id = p_parent_company_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('owner', 'admin', 'operations')
  );
$$;

revoke all on function public.user_can_write_rentals_for_company(uuid) from public;
grant execute on function public.user_can_write_rentals_for_company(uuid) to authenticated;

drop policy if exists vehicle_hire_groups_select on public.vehicle_hire_groups;
create policy vehicle_hire_groups_select on public.vehicle_hire_groups
  for select to authenticated
  using (
    public.user_can_access_subcompany(subcompany_id)
    or driver_user_id = auth.uid()
    or (
      status = 'draft'
      and public.user_can_read_rentals_for_company(parent_company_id)
    )
  );

drop policy if exists vehicle_hire_groups_write on public.vehicle_hire_groups;
create policy vehicle_hire_groups_write on public.vehicle_hire_groups
  for all to authenticated
  using (
    public.user_can_manage_fleet_for_subcompany(subcompany_id)
    or (
      status = 'draft'
      and public.user_can_write_rentals_for_company(parent_company_id)
    )
  )
  with check (
    (
      status = 'draft'
      and public.user_can_write_rentals_for_company(parent_company_id)
      and (
        subcompany_id is null
        or public.user_can_manage_fleet_for_subcompany(subcompany_id)
      )
    )
    or (
      status <> 'draft'
      and subcompany_id is not null
      and public.user_can_manage_fleet_for_subcompany(subcompany_id)
    )
  );
