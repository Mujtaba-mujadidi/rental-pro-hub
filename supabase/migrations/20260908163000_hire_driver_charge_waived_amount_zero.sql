-- Allow £0 amount on waived charge rows (waive has no billed amount).
-- Drops any existing amount_gbp check first (inline create-table checks vary by name).

do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'vehicle_hire_driver_charge_line_items'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%amount_gbp%'
  loop
    execute format(
      'alter table public.vehicle_hire_driver_charge_line_items drop constraint if exists %I',
      c.conname
    );
  end loop;
end $$;

alter table public.vehicle_hire_driver_charge_line_items
  add constraint vehicle_hire_driver_charge_line_items_amount_gbp_check
  check (
    amount_gbp > 0
    or resolution = 'waived'
  );
