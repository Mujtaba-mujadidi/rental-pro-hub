-- Idempotent ensure for hire termination settlement (see migration 20260727200000).

alter table public.vehicle_hire_groups
  add column if not exists deposit_disposition text,
  add column if not exists deposit_refund_method text,
  add column if not exists deposit_refund_amount_gbp numeric(12, 2),
  add column if not exists deposit_refund_reference text,
  add column if not exists deposit_refund_recorded_at timestamptz,
  add column if not exists termination_settlement jsonb not null default '{}'::jsonb,
  add column if not exists settlement_balance_gbp numeric(12, 2),
  add column if not exists settlement_balance_direction text,
  add column if not exists driver_documents_retain_until date,
  add column if not exists deposit_disposition_reason text,
  add column if not exists settlement_resolution text,
  add column if not exists settlement_discount_gbp numeric(12, 2);

alter table public.vehicle_hire_balance_payments
  add column if not exists direction text;

create table if not exists public.vehicle_hire_balance_notes (
  id uuid primary key default gen_random_uuid(),
  hire_group_id uuid not null references public.vehicle_hire_groups (id) on delete cascade,
  body text not null,
  follow_up_at date,
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.vehicle_hire_balance_payments (
  id uuid primary key default gen_random_uuid(),
  hire_group_id uuid not null references public.vehicle_hire_groups (id) on delete cascade,
  amount_gbp numeric(12, 2) not null check (amount_gbp > 0),
  payment_method text not null,
  payment_reference text,
  notes text,
  paid_at timestamptz not null default now(),
  recorded_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
