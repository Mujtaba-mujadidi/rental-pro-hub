-- Idempotent: allow vehicle_hire_groups.status = ending for End hire close-out.

alter table public.vehicle_hire_groups
  drop constraint if exists vehicle_hire_groups_status_check;

alter table public.vehicle_hire_groups
  add constraint vehicle_hire_groups_status_check
  check (
    status in (
      'draft',
      'pending_signature',
      'reserved',
      'active',
      'ending',
      'completed',
      'terminated',
      'cancelled'
    )
  );

drop index if exists public.vehicle_hire_groups_one_in_progress_per_vehicle_uidx;

create unique index vehicle_hire_groups_one_in_progress_per_vehicle_uidx
  on public.vehicle_hire_groups (vehicle_id)
  where status in ('draft', 'pending_signature', 'reserved', 'active', 'ending')
    and vehicle_id is not null;
