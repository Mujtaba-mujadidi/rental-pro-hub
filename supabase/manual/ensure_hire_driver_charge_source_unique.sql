-- Idempotent: one live (non-voided) charge row per hire + source_kind + source_id.
-- Does not adjust settlement — Payments load heals missing return charges.

do $$
begin
  with ranked as (
    select
      id,
      row_number() over (
        partition by hire_group_id, source_kind, source_id
        order by created_at asc nulls last, id asc
      ) as rn
    from public.vehicle_hire_driver_charge_line_items
    where source_id is not null
      and btrim(source_id) <> ''
      and resolution is distinct from 'voided'
  ),
  dupes as (
    select id from ranked where rn > 1
  )
  delete from public.vehicle_hire_driver_charge_line_items c
  using dupes d
  where c.id = d.id;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'vehicle_hire_driver_charge_source_live_uidx'
  ) then
    create unique index vehicle_hire_driver_charge_source_live_uidx
      on public.vehicle_hire_driver_charge_line_items (hire_group_id, source_kind, source_id)
      where source_id is not null
        and btrim(source_id) <> ''
        and resolution is distinct from 'voided';
  end if;
end $$;
