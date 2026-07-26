-- Draft contract change requests: save on rental side before super-admin review.

alter table public.company_contract_change_requests
  drop constraint if exists company_contract_change_requests_status_check;

alter table public.company_contract_change_requests
  add constraint company_contract_change_requests_status_check
  check (status in ('draft', 'pending_signature', 'signed', 'rejected'));

alter table public.company_contract_change_requests
  drop constraint if exists company_contract_change_requests_review_status_check;

alter table public.company_contract_change_requests
  add constraint company_contract_change_requests_review_status_check
  check (
    review_status in (
      'draft',
      'pending_review',
      'approved',
      'rejected',
      'awaiting_signature',
      'completed'
    )
  );

drop index if exists company_contract_change_one_draft_per_parent_idx;
create unique index company_contract_change_one_draft_per_parent_idx
  on public.company_contract_change_requests (parent_company_id)
  where status = 'draft';

alter table public.company_contract_change_requests replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'company_contract_change_requests'
  ) then
    alter publication supabase_realtime add table public.company_contract_change_requests;
  end if;
end $$;
