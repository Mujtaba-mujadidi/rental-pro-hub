-- Soft-delete so staff/drivers can dismiss notifications without affecting other users.

alter table public.platform_notifications
  add column if not exists deleted_at timestamptz;

create index if not exists platform_notifications_user_active_idx
  on public.platform_notifications (user_id, created_at desc)
  where deleted_at is null;
