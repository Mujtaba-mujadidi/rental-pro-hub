-- Bank details on company payment accounts (shown to hirers on hire contracts/timesheet).
-- Replaces separate company_hire_bank_accounts table.

alter table public.company_payment_accounts
  add column if not exists payee_name text,
  add column if not exists sort_code text,
  add column if not exists account_number text,
  add column if not exists payment_reference_hint text,
  add column if not exists show_to_hirer boolean not null default false;

comment on column public.company_payment_accounts.payee_name is
  'Bank payee name for hirer-facing payment instructions (optional).';
comment on column public.company_payment_accounts.sort_code is
  'UK sort code when this account is a bank account for hire rent.';
comment on column public.company_payment_accounts.account_number is
  'Bank account number for hire rent (optional).';
comment on column public.company_payment_accounts.payment_reference_hint is
  'Suggested payment reference for hirers.';
comment on column public.company_payment_accounts.show_to_hirer is
  'When true and bank details are set, hirers see this account on hire contracts/timesheet.';

-- Point hire module at company_payment_accounts (if hire tables exist).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'vehicle_hire_groups'
      and column_name = 'default_hire_bank_account_id'
  ) then
    alter table public.vehicle_hire_groups
      drop constraint if exists vehicle_hire_groups_default_hire_bank_account_id_fkey;
    alter table public.vehicle_hire_groups
      rename column default_hire_bank_account_id to default_payment_account_id;
    alter table public.vehicle_hire_groups
      add constraint vehicle_hire_groups_default_payment_account_id_fkey
      foreign key (default_payment_account_id)
      references public.company_payment_accounts (id) on delete set null;
  elsif not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'vehicle_hire_groups'
      and column_name = 'default_payment_account_id'
  ) then
    null;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'vehicle_hire_payment_schedule'
      and column_name = 'expected_bank_account_id'
  ) then
    alter table public.vehicle_hire_payment_schedule
      drop constraint if exists vehicle_hire_payment_schedule_expected_bank_account_id_fkey;
    alter table public.vehicle_hire_payment_schedule
      rename column expected_bank_account_id to expected_payment_account_id;
    alter table public.vehicle_hire_payment_schedule
      add constraint vehicle_hire_payment_schedule_expected_payment_account_id_fkey
      foreign key (expected_payment_account_id)
      references public.company_payment_accounts (id) on delete set null;
  end if;
end $$;

drop table if exists public.company_hire_bank_accounts cascade;
