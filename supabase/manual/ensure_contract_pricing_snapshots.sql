-- Fix: "Could not find the table 'public.contract_pricing_snapshots' in the schema cache"
-- Progress: ../../docs/PROGRESS.md
-- Run in the Supabase SQL Editor for the same project as the app (.env.local).
-- Requires: public.company_contracts, public.company_contract_versions, public.contract_pricing_presets
--   (run ensure_contract_pricing_presets.sql first if presets table is missing).
-- Safe to re-run: uses IF NOT EXISTS and DROP POLICY IF EXISTS.

-- Helper used by RLS (same definition as migration 20260403210000; safe if already present).
create or replace function public.user_rental_can_view_billing(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.user_company_memberships m
    where m.user_id = auth.uid()
      and m.parent_company_id = p_company_id
      and m.status = 'active'
      and m.role in ('owner', 'admin', 'finance', 'operations', 'viewer')
  );
$$;

revoke all on function public.user_rental_can_view_billing(uuid) from public;
grant execute on function public.user_rental_can_view_billing(uuid) to authenticated;

create table if not exists public.contract_pricing_snapshots (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.company_contracts (id) on delete cascade,
  version_id uuid references public.company_contract_versions (id) on delete set null,
  effective_from date,
  effective_to date,
  snapshot jsonb not null default '{}'::jsonb,
  preset_id uuid references public.contract_pricing_presets (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists contract_pricing_snapshots_contract_idx
  on public.contract_pricing_snapshots (contract_id, created_at desc);

alter table public.contract_pricing_snapshots enable row level security;

drop policy if exists contract_pricing_snapshots_select_super_admin on public.contract_pricing_snapshots;
drop policy if exists contract_pricing_snapshots_select_rental on public.contract_pricing_snapshots;
drop policy if exists contract_pricing_snapshots_mutate_super_admin on public.contract_pricing_snapshots;

create policy contract_pricing_snapshots_select_super_admin
  on public.contract_pricing_snapshots for select
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  );

create policy contract_pricing_snapshots_select_rental
  on public.contract_pricing_snapshots for select
  to authenticated
  using (
    exists (
      select 1
      from public.company_contracts cc
      where cc.id = contract_pricing_snapshots.contract_id
        and public.user_rental_can_view_billing(cc.parent_company_id)
    )
  );

create policy contract_pricing_snapshots_mutate_super_admin
  on public.contract_pricing_snapshots for all
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  );

comment on table public.contract_pricing_snapshots is 'Pricing snapshots linked to contract versions; super-admin writes, rental finance roles may read via contract.';
