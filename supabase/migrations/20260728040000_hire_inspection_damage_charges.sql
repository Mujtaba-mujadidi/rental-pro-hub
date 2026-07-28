-- Optional damage charge resolution on check-in damages.

alter table public.vehicle_hire_inspection_damages
  add column if not exists charge_gbp numeric(10, 2)
    check (charge_gbp is null or charge_gbp >= 0),
  add column if not exists charge_resolution text
    check (
      charge_resolution is null
      or charge_resolution in ('waived', 'paid_now', 'add_to_balance')
    );
