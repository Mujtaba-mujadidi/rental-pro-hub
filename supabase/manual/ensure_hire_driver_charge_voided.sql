-- Idempotent: allow voided resolution on driver charge line items.

alter table public.vehicle_hire_driver_charge_line_items
  drop constraint if exists vehicle_hire_driver_charge_line_items_resolution_check;

alter table public.vehicle_hire_driver_charge_line_items
  add constraint vehicle_hire_driver_charge_line_items_resolution_check
  check (resolution in ('waived', 'paid_now', 'add_to_balance', 'voided'));
