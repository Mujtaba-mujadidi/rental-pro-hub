-- Live updates for in-app notification bell and sidebar badges.
-- Ensures platform_notifications exists (some environments skipped the billing migration).

create table if not exists public.platform_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists platform_notifications_user_idx
  on public.platform_notifications (user_id, created_at desc);

alter table public.platform_notifications enable row level security;

drop policy if exists platform_notifications_select_own on public.platform_notifications;
create policy platform_notifications_select_own
  on public.platform_notifications for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists platform_notifications_update_own on public.platform_notifications;
create policy platform_notifications_update_own
  on public.platform_notifications for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists platform_notifications_insert_service on public.platform_notifications;
drop policy if exists platform_notifications_insert_super_admin on public.platform_notifications;
create policy platform_notifications_insert_super_admin
  on public.platform_notifications for insert
  to authenticated
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  );

alter table public.platform_notifications replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'platform_notifications'
  ) then
    alter publication supabase_realtime add table public.platform_notifications;
  end if;
end $$;
