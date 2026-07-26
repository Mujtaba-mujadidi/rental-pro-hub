-- Support vehicle-scoped and company hire lists ordered by updated_at.

create index if not exists vehicle_hire_groups_vehicle_updated_idx
  on public.vehicle_hire_groups (vehicle_id, updated_at desc);

create index if not exists vehicle_hire_groups_company_updated_idx
  on public.vehicle_hire_groups (parent_company_id, updated_at desc);
