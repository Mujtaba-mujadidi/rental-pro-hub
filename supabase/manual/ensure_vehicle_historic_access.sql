-- Idempotent ensure for vehicle historic access (transferred-out read-only).

create or replace function public.user_can_view_transferred_out_vehicle(p_vehicle_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.vehicle_transfers vt
    join public.vehicles v on v.id = vt.vehicle_id
    where vt.vehicle_id = p_vehicle_id
      and v.subcompany_id is distinct from vt.from_subcompany_id
      and public.user_can_access_subcompany(vt.from_subcompany_id)
  );
$$;

revoke all on function public.user_can_view_transferred_out_vehicle(uuid) from public;
grant execute on function public.user_can_view_transferred_out_vehicle(uuid) to authenticated;

drop policy if exists vehicles_select_rental on public.vehicles;
create policy vehicles_select_rental
  on public.vehicles for select to authenticated
  using (
    public.user_can_access_subcompany(subcompany_id)
    or public.user_can_view_transferred_out_vehicle(id)
  );

drop policy if exists vehicle_documents_select_rental_historic on public.vehicle_documents;
create policy vehicle_documents_select_rental_historic
  on public.vehicle_documents for select to authenticated
  using (
    coalesce(version_status, 'current') = 'superseded'
    and public.user_can_view_transferred_out_vehicle(vehicle_id)
  );
