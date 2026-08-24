-- Persist in-progress End hire close-out so another authorised device can continue.

alter table public.vehicle_hire_groups
  add column if not exists end_hire_draft jsonb;

comment on column public.vehicle_hire_groups.end_hire_draft is
  'Staff End hire wizard draft: step, return datetime, reason, notes.';
