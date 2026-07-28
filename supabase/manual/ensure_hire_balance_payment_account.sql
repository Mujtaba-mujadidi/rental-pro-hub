alter table public.vehicle_hire_balance_payments
  add column if not exists payment_account_id uuid references public.company_payment_accounts (id) on delete set null;

create index if not exists vehicle_hire_balance_payments_account_idx
  on public.vehicle_hire_balance_payments (payment_account_id)
  where payment_account_id is not null;
