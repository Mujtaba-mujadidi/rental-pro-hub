-- Fix: new row for relation "company_contracts" violates check constraint "company_contracts_status_check"
-- Progress: ../../docs/PROGRESS.md
-- The app inserts status 'draft' (e-sign) and 'sent_for_signature', etc. Old schema only allowed
-- ('active', 'pending_renewal', 'terminated'). This script replaces ANY check on this table with the
-- billing-platform list (migration 20260403210000).
--
-- Run in Supabase SQL Editor for the same project as the app.
--
-- Optional: inspect current checks first:
--   select conname, pg_get_constraintdef(c.oid)
--   from pg_constraint c
--   join pg_class t on c.conrelid = t.oid
--   join pg_namespace n on n.oid = t.relnamespace
--   where n.nspname = 'public' and t.relname = 'company_contracts' and c.contype = 'c';

-- Drop every CHECK on company_contracts (this table only has status lifecycle checks in RMS migrations).
do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'company_contracts'
      and c.contype = 'c'
  loop
    execute format('alter table public.company_contracts drop constraint if exists %I', r.conname);
  end loop;
end $$;

-- Legacy value from pre-billing schema
update public.company_contracts
set status = 'pending_amendment'
where status = 'pending_renewal';

-- Anything else unexpected: coerce so ADD CONSTRAINT succeeds (adjust if you use custom statuses)
update public.company_contracts
set status = 'active'
where status is not null
  and status not in (
    'draft',
    'sent_for_signature',
    'signed_by_customer',
    'active',
    'pending_amendment',
    'suspended',
    'terminated',
    'expired',
    'superseded'
  );

alter table public.company_contracts
  add constraint company_contracts_status_check
  check (
    status in (
      'draft',
      'sent_for_signature',
      'signed_by_customer',
      'active',
      'pending_amendment',
      'suspended',
      'terminated',
      'expired',
      'superseded'
    )
  );
