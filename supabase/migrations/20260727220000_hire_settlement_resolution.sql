-- Unified hire settlement resolution and payment ledger direction.

alter table public.vehicle_hire_groups
  add column if not exists settlement_resolution text
    check (
      settlement_resolution is null
      or settlement_resolution in ('paid_now', 'open_balance', 'written_off')
    ),
  add column if not exists settlement_discount_gbp numeric(12, 2)
    check (settlement_discount_gbp is null or settlement_discount_gbp >= 0);

alter table public.vehicle_hire_balance_payments
  add column if not exists direction text
    check (direction is null or direction in ('received_from_driver', 'paid_to_driver'));
