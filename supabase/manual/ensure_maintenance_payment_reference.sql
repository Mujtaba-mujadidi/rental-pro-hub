-- Idempotent: optional payment reference on maintenance expenses.

alter table public.vehicle_maintenance_records
  add column if not exists payment_reference text not null default '';

comment on column public.vehicle_maintenance_records.payment_reference is
  'Optional bank / card / transfer payment reference.';
