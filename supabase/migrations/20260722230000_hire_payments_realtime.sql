-- Realtime for hire payment schedule, status events, and discounts (staff + driver sheet).

alter table public.vehicle_hire_payment_schedule replica identity full;
alter table public.vehicle_hire_payment_status_events replica identity full;
alter table public.vehicle_hire_schedule_discounts replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'vehicle_hire_payment_schedule'
  ) then
    alter publication supabase_realtime add table public.vehicle_hire_payment_schedule;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'vehicle_hire_payment_status_events'
  ) then
    alter publication supabase_realtime add table public.vehicle_hire_payment_status_events;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'vehicle_hire_schedule_discounts'
  ) then
    alter publication supabase_realtime add table public.vehicle_hire_schedule_discounts;
  end if;
end $$;
