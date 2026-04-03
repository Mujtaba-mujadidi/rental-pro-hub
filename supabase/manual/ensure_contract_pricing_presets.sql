-- Fix: "Could not find the table 'public.contract_pricing_presets' in the schema cache"
-- Run this in the Supabase SQL Editor for the same project as your app (.env.local).
-- Safe to re-run (idempotent).

create table if not exists public.contract_pricing_presets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pricing_model_type text not null
    check (
      pricing_model_type in (
        'fixed_monthly',
        'per_vehicle',
        'tiered_vehicles',
        'base_plus_per_vehicle',
        'custom'
      )
    ),
  parameters jsonb not null default '{}'::jsonb,
  billing_frequency text,
  currency text not null default 'GBP',
  description text,
  internal_note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists contract_pricing_presets_touch on public.contract_pricing_presets;
create trigger contract_pricing_presets_touch
  before update on public.contract_pricing_presets
  for each row execute procedure public.touch_updated_at();

alter table public.contract_pricing_presets enable row level security;

drop policy if exists contract_pricing_presets_all_super_admin on public.contract_pricing_presets;
create policy contract_pricing_presets_all_super_admin
  on public.contract_pricing_presets for all
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  );

comment on table public.contract_pricing_presets is 'Super-admin pricing presets for company contracts; used by contract-presets UI.';
