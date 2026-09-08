-- Prevent concurrent return-charge applies from inserting the same source twice.
-- Voided rows are excluded so staff can re-post after a void.
--
-- Duplicate row cleanup does NOT adjust settlement_balance_gbp: concurrent applies
-- often inflated line items without double-counting settlement. The app heals
-- missing return charges into settlement on Payments load.

-- 1) Drop live duplicate non-voided rows (keep oldest per hire + source_kind + source_id).
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

-- 2) Partial unique index: one live row per hire + source.
create unique index if not exists vehicle_hire_driver_charge_source_live_uidx
  on public.vehicle_hire_driver_charge_line_items (hire_group_id, source_kind, source_id)
  where source_id is not null
    and btrim(source_id) <> ''
    and resolution is distinct from 'voided';
