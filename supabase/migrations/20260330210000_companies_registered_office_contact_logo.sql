-- Registered office (UK), primary contact person, optional logo path.

alter table public.companies rename column company_registration_number to company_number;

alter table public.companies rename column address_line1 to registered_address_line1;
alter table public.companies rename column address_line2 to registered_address_line2;
alter table public.companies rename column address_town to registered_town;
alter table public.companies rename column address_postcode to registered_postcode;

alter table public.companies
  add column if not exists registered_county text;

alter table public.companies
  add column if not exists primary_contact_first_name text,
  add column if not exists primary_contact_last_name text,
  add column if not exists primary_contact_dob date,
  add column if not exists primary_contact_phone text,
  add column if not exists primary_contact_email text;

alter table public.companies
  add column if not exists logo_storage_path text;

update public.companies
set primary_contact_email = email
where primary_contact_email is null and email is not null;

update public.companies
set primary_contact_phone = phone
where primary_contact_phone is null and phone is not null;

alter table public.companies drop column if exists email;
alter table public.companies drop column if exists phone;

create index if not exists companies_company_number_idx on public.companies (company_number);
create index if not exists companies_primary_contact_email_lower_idx on public.companies (lower(primary_contact_email));

insert into storage.buckets (id, name, public)
values ('company-logos', 'company-logos', false)
on conflict (id) do nothing;

comment on column public.companies.registered_address_line1 is 'UK registered office address line 1.';
comment on column public.companies.registered_county is 'UK county / region (optional).';
comment on column public.companies.logo_storage_path is 'Storage path in bucket company-logos (private).';
