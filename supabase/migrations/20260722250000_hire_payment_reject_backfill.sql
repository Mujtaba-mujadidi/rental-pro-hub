-- Backfill rows where staff rejected a payment but payment_status was never updated.

with latest_status as (
  select distinct on (schedule_row_id)
    schedule_row_id,
    to_status
  from public.vehicle_hire_payment_status_events
  where event_kind = 'status_change'
  order by schedule_row_id, created_at desc
)
update public.vehicle_hire_payment_schedule s
set payment_status = 'rejected'
from latest_status l
where s.id = l.schedule_row_id
  and l.to_status = 'rejected'
  and s.payment_status = 'pending_approval';
