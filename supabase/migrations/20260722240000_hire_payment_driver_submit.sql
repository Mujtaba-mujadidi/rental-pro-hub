-- Drivers may mark their hire payment rows as pending_approval after submitting payment.
-- Backfill rows where a pending event exists but payment_status was never updated (RLS gap).

drop policy if exists vehicle_hire_payment_schedule_driver_submit on public.vehicle_hire_payment_schedule;
create policy vehicle_hire_payment_schedule_driver_submit on public.vehicle_hire_payment_schedule
  for update to authenticated
  using (
    payment_status in ('not_received', 'rejected')
    and exists (
      select 1
      from public.vehicle_hire_groups g
      where g.id = vehicle_hire_payment_schedule.hire_group_id
        and g.driver_user_id = auth.uid()
    )
  )
  with check (
    payment_status = 'pending_approval'
    and exists (
      select 1
      from public.vehicle_hire_groups g
      where g.id = vehicle_hire_payment_schedule.hire_group_id
        and g.driver_user_id = auth.uid()
    )
  );

with latest_status as (
  select distinct on (schedule_row_id)
    schedule_row_id,
    to_status
  from public.vehicle_hire_payment_status_events
  where event_kind = 'status_change'
  order by schedule_row_id, created_at desc
)
update public.vehicle_hire_payment_schedule s
set payment_status = 'pending_approval'
from latest_status l
where s.id = l.schedule_row_id
  and l.to_status = 'pending_approval'
  and s.payment_status in ('not_received', 'rejected');
