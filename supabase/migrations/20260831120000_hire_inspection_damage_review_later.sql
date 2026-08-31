-- Allow "review later" on check-in damage charge decisions (final account).

alter table public.vehicle_hire_inspection_damages
  drop constraint if exists vehicle_hire_inspection_damages_charge_resolution_check;

alter table public.vehicle_hire_inspection_damages
  add constraint vehicle_hire_inspection_damages_charge_resolution_check
  check (
    charge_resolution is null
    or charge_resolution in ('waived', 'paid_now', 'add_to_balance', 'review_later')
  );
