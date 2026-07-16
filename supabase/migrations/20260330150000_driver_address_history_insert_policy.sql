-- Allow drivers to archive their own previous addresses
create policy driver_address_history_insert_own
  on public.driver_address_history for insert
  to authenticated
  with check (user_id = auth.uid());

