-- Idempotent: soft-archive column on vehicles.

alter table public.vehicles
  add column if not exists archived_at timestamptz;

comment on column public.vehicles.archived_at is
  'When set, vehicle is archived (removed from active fleet lists) but retained for hire/document history.';

create index if not exists vehicles_active_fleet_idx
  on public.vehicles (parent_company_id, subcompany_id)
  where archived_at is null;
