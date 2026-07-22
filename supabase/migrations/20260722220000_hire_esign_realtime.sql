-- Realtime for hire agreement / e-sign workflow updates on the contracts table.

alter table public.vehicle_hire_agreements replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'vehicle_hire_agreements'
  ) then
    alter publication supabase_realtime add table public.vehicle_hire_agreements;
  end if;
end $$;
