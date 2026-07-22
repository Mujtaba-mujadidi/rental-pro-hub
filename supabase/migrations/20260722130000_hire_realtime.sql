-- Enable Supabase Realtime for hire wizard status (driver access, draft updates).

alter table public.vehicle_hire_groups replica identity full;
alter table public.company_driver_access_requests replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'vehicle_hire_groups'
  ) then
    alter publication supabase_realtime add table public.vehicle_hire_groups;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'company_driver_access_requests'
  ) then
    alter publication supabase_realtime add table public.company_driver_access_requests;
  end if;
end $$;
