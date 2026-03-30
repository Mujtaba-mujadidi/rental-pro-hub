-- Idempotent: fixes "new row violates row-level security policy" on insert when
-- the prior policy migration was not applied or failed.
drop policy if exists driver_licence_document_versions_insert_own
  on public.driver_licence_document_versions;

create policy driver_licence_document_versions_insert_own
  on public.driver_licence_document_versions for insert
  to authenticated
  with check (user_id = auth.uid());

grant insert on table public.driver_licence_document_versions to authenticated;
