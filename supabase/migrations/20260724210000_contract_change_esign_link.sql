-- Link contract-change renewals to draft versions and e-sign envelopes.

alter table public.company_contract_versions
  add column if not exists change_request_id uuid references public.company_contract_change_requests (id) on delete set null;

create index if not exists company_contract_versions_change_request_idx
  on public.company_contract_versions (change_request_id)
  where change_request_id is not null;

alter table public.company_contract_change_requests
  add column if not exists esign_envelope_id uuid references public.esign_envelopes (id) on delete set null;
