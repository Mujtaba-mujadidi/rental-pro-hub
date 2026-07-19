-- Idempotent: cash payments need no account; methods can declare requires_account.

alter table public.vehicle_maintenance_records
  alter column payment_account_id drop not null;

alter table public.company_payment_methods
  add column if not exists requires_account boolean not null default true;

comment on column public.company_payment_methods.requires_account is
  'When false (e.g. Cash), maintenance expenses do not require a payment account.';

update public.company_payment_methods
set requires_account = false
where lower(trim(name)) = 'cash';

-- Allow null payment account (e.g. Cash)
create or replace function public.vehicle_maintenance_enforce_payment_company()
returns trigger
language plpgsql
as $$
declare
  method_company uuid;
  account_company uuid;
begin
  select parent_company_id into method_company
  from public.company_payment_methods
  where id = new.payment_method_id;

  if method_company is null or method_company <> new.parent_company_id then
    raise exception 'payment method must belong to the vehicle company';
  end if;

  if new.payment_account_id is not null then
    select parent_company_id into account_company
    from public.company_payment_accounts
    where id = new.payment_account_id;

    if account_company is null or account_company <> new.parent_company_id then
      raise exception 'payment account must belong to the vehicle company';
    end if;
  end if;
  return new;
end;
$$;

-- Allow excel as maintenance record source.
alter table public.vehicle_maintenance_records
  drop constraint if exists vehicle_maintenance_records_source_check;

alter table public.vehicle_maintenance_records
  add constraint vehicle_maintenance_records_source_check
  check (source in ('manual', 'csv', 'excel'));
