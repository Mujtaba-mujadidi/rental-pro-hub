-- Document / detect deposit→rent credits wrongly written onto deposit schedule rows.
-- Apply heal with:
--   cd apps/web && node ../../supabase/manual/heal_deposit_credit_misapplied_to_deposit_row.mjs
--
-- This SQL only reports candidates (read-only).

select
  g.id as hire_group_id,
  s.id as deposit_schedule_row_id,
  s.approved_amount_gbp,
  e.id as event_id,
  e.created_at,
  e.amendment_payload
from public.vehicle_hire_payment_status_events e
join public.vehicle_hire_payment_schedule s on s.id = e.schedule_row_id
join public.vehicle_hire_groups g on g.id = s.hire_group_id
where e.comment = 'Deposit applied to rent at contract end'
  and e.event_kind = 'status_change'
  and s.row_kind = 'deposit'
  and coalesce((e.amendment_payload->>'depositAppliedGbp')::numeric, 0) > 0.005
order by e.created_at;
