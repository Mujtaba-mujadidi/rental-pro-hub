-- Allow drivers to insert their own licence version audit rows
create policy driver_licence_document_versions_insert_own
  on public.driver_licence_document_versions for insert
  to authenticated
  with check (user_id = auth.uid());

