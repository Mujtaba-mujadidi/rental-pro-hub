-- Realtime for hire financial rebuild outputs (driver/staff payments refresh after amend).

alter table public.vehicle_hire_financial_summary replica identity full;
alter table public.vehicle_hire_payment_allocations replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'vehicle_hire_financial_summary'
  ) then
    alter publication supabase_realtime add table public.vehicle_hire_financial_summary;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'vehicle_hire_payment_allocations'
  ) then
    alter publication supabase_realtime add table public.vehicle_hire_payment_allocations;
  end if;
end $$;
