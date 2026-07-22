-- One in-progress hire per vehicle (includes drafts with a vehicle assigned).

drop index if exists public.vehicle_hire_groups_one_active_per_vehicle_uidx;

create unique index if not exists vehicle_hire_groups_one_in_progress_per_vehicle_uidx
  on public.vehicle_hire_groups (vehicle_id)
  where status in ('draft', 'pending_signature', 'reserved', 'active')
    and vehicle_id is not null;
