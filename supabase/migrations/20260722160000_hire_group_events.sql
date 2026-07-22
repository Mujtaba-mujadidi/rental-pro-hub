-- Hire contract lifecycle audit trail (draft → driver access → e-sign → active/cancelled).

create table if not exists public.vehicle_hire_group_events (
  id uuid primary key default gen_random_uuid(),
  hire_group_id uuid not null references public.vehicle_hire_groups (id) on delete cascade,
  event_type text not null,
  actor_user_id uuid references auth.users (id) on delete set null,
  actor_role text not null check (actor_role in ('company_staff', 'driver', 'system')),
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists vehicle_hire_group_events_group_idx
  on public.vehicle_hire_group_events (hire_group_id, created_at asc);

alter table public.vehicle_hire_group_events enable row level security;

drop policy if exists vehicle_hire_group_events_select on public.vehicle_hire_group_events;
create policy vehicle_hire_group_events_select on public.vehicle_hire_group_events
  for select to authenticated
  using (
    exists (
      select 1
      from public.vehicle_hire_groups g
      where g.id = vehicle_hire_group_events.hire_group_id
        and (
          public.user_can_access_subcompany(g.subcompany_id)
          or g.driver_user_id = auth.uid()
        )
    )
  );

alter table public.vehicle_hire_group_events replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'vehicle_hire_group_events'
    ) then
      alter publication supabase_realtime add table public.vehicle_hire_group_events;
    end if;
  end if;
end $$;
