-- Contract-gated sync between parent rental company and its primary subcompany.

alter table public.subcompanies
  add column if not exists is_primary boolean not null default false;

with ranked_primary as (
  select
    id,
    row_number() over (partition by parent_company_id order by created_at asc, id asc) as rn
  from public.subcompanies
  where is_primary
)
update public.subcompanies s
set is_primary = false
from ranked_primary r
where s.id = r.id
  and r.rn > 1;

with ranked_any as (
  select
    id,
    parent_company_id,
    row_number() over (partition by parent_company_id order by created_at asc, id asc) as rn
  from public.subcompanies
),
missing_primary_parent as (
  select distinct parent_company_id
  from ranked_any r
  where not exists (
    select 1 from public.subcompanies s2
    where s2.parent_company_id = r.parent_company_id
      and s2.is_primary
  )
)
update public.subcompanies s
set is_primary = true
from ranked_any r
where s.id = r.id
  and r.rn = 1
  and r.parent_company_id in (select parent_company_id from missing_primary_parent);

insert into public.subcompanies (
  parent_company_id,
  is_primary,
  name,
  legal_name,
  company_number,
  registered_address_line1,
  registered_address_line2,
  registered_town,
  registered_county,
  registered_postcode,
  country,
  primary_contact_first_name,
  primary_contact_last_name,
  primary_contact_dob,
  primary_contact_phone,
  primary_contact_email,
  status,
  notes
)
select
  c.id,
  true,
  c.name,
  c.legal_name,
  c.company_number,
  c.registered_address_line1,
  c.registered_address_line2,
  c.registered_town,
  c.registered_county,
  c.registered_postcode,
  c.country,
  c.primary_contact_first_name,
  c.primary_contact_last_name,
  c.primary_contact_dob,
  c.primary_contact_phone,
  c.primary_contact_email,
  c.status,
  c.notes
from public.companies c
where not exists (
  select 1
  from public.subcompanies s
  where s.parent_company_id = c.id
);

create unique index if not exists subcompanies_one_primary_per_parent_idx
  on public.subcompanies (parent_company_id)
  where is_primary;

alter table public.companies
  add column if not exists contract_status text not null default 'active'
  check (contract_status in ('active', 'pending_renewal'));

alter table public.companies
  add column if not exists contract_version integer not null default 1;

create table if not exists public.company_contract_change_requests (
  id uuid primary key default gen_random_uuid(),
  parent_company_id uuid not null references public.companies (id) on delete cascade,
  requested_by uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending_signature' check (status in ('pending_signature', 'signed', 'rejected')),
  proposed_name text not null,
  proposed_legal_name text,
  proposed_company_number text,
  proposed_registered_address_line1 text,
  proposed_registered_address_line2 text,
  proposed_registered_town text,
  proposed_registered_county text,
  proposed_registered_postcode text,
  proposed_country text not null default 'GB',
  proposed_primary_contact_first_name text not null,
  proposed_primary_contact_last_name text not null,
  proposed_primary_contact_dob date not null,
  proposed_primary_contact_phone text not null,
  proposed_primary_contact_email text not null,
  proposed_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  signed_at timestamptz,
  signed_by uuid references auth.users (id),
  rejected_at timestamptz,
  rejected_by uuid references auth.users (id)
);

create index if not exists company_contract_change_requests_parent_company_idx
  on public.company_contract_change_requests (parent_company_id, created_at desc);

create unique index if not exists company_contract_change_one_pending_per_parent_idx
  on public.company_contract_change_requests (parent_company_id)
  where status = 'pending_signature';

create or replace function public.company_contract_change_requests_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists company_contract_change_requests_set_updated_at on public.company_contract_change_requests;
create trigger company_contract_change_requests_set_updated_at
  before update on public.company_contract_change_requests
  for each row execute procedure public.company_contract_change_requests_set_updated_at();

alter table public.company_contract_change_requests enable row level security;

create policy company_contract_change_requests_select_super_admin
  on public.company_contract_change_requests for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
  );

create policy company_contract_change_requests_select_rental_company
  on public.company_contract_change_requests for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'rental_company'
        and p.company_id = company_contract_change_requests.parent_company_id
    )
  );

create policy company_contract_change_requests_insert_rental_company
  on public.company_contract_change_requests for insert
  to authenticated
  with check (
    status = 'pending_signature'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'rental_company'
        and p.company_id = company_contract_change_requests.parent_company_id
    )
  );

create or replace function public.apply_company_contract_change(p_change_id uuid, p_signed_by uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.company_contract_change_requests%rowtype;
  v_primary_subcompany_id uuid;
begin
  select * into req
  from public.company_contract_change_requests
  where id = p_change_id
  for update;

  if req.id is null then
    raise exception 'Contract change request not found';
  end if;
  if req.status <> 'pending_signature' then
    raise exception 'Contract change request is not pending signature';
  end if;

  select s.id into v_primary_subcompany_id
  from public.subcompanies s
  where s.parent_company_id = req.parent_company_id
    and s.is_primary
  order by s.created_at asc, s.id asc
  limit 1;

  if v_primary_subcompany_id is null then
    raise exception 'Primary subcompany not found for parent company %', req.parent_company_id;
  end if;

  update public.companies c
  set
    name = req.proposed_name,
    legal_name = req.proposed_legal_name,
    company_number = req.proposed_company_number,
    registered_address_line1 = req.proposed_registered_address_line1,
    registered_address_line2 = req.proposed_registered_address_line2,
    registered_town = req.proposed_registered_town,
    registered_county = req.proposed_registered_county,
    registered_postcode = req.proposed_registered_postcode,
    country = req.proposed_country,
    primary_contact_first_name = req.proposed_primary_contact_first_name,
    primary_contact_last_name = req.proposed_primary_contact_last_name,
    primary_contact_dob = req.proposed_primary_contact_dob,
    primary_contact_phone = req.proposed_primary_contact_phone,
    primary_contact_email = req.proposed_primary_contact_email,
    notes = req.proposed_notes,
    contract_status = 'active',
    contract_version = coalesce(c.contract_version, 1) + 1
  where c.id = req.parent_company_id;

  update public.subcompanies s
  set
    name = req.proposed_name,
    legal_name = req.proposed_legal_name,
    company_number = req.proposed_company_number,
    registered_address_line1 = req.proposed_registered_address_line1,
    registered_address_line2 = req.proposed_registered_address_line2,
    registered_town = req.proposed_registered_town,
    registered_county = req.proposed_registered_county,
    registered_postcode = req.proposed_registered_postcode,
    country = req.proposed_country,
    primary_contact_first_name = req.proposed_primary_contact_first_name,
    primary_contact_last_name = req.proposed_primary_contact_last_name,
    primary_contact_dob = req.proposed_primary_contact_dob,
    primary_contact_phone = req.proposed_primary_contact_phone,
    primary_contact_email = req.proposed_primary_contact_email,
    notes = req.proposed_notes,
    status = 'active'
  where s.id = v_primary_subcompany_id;

  update public.company_contract_change_requests
  set
    status = 'signed',
    signed_at = now(),
    signed_by = p_signed_by
  where id = req.id;
end;
$$;

comment on table public.company_contract_change_requests is 'Pending legal detail changes that require new contract signature.';
