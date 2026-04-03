-- Fix: "column profiles.company_id does not exist"
-- Run in Supabase SQL Editor when your DB predates rental-company profile migrations.
-- Requires public.companies to exist (from companies migration).

alter table public.profiles
  add column if not exists company_id uuid references public.companies (id) on delete set null;

create index if not exists profiles_company_id_idx on public.profiles (company_id);

alter table public.profiles
  add column if not exists company_role text;

-- Optional: enforce values (skip if constraint already present)
alter table public.profiles drop constraint if exists profiles_company_role_check;
alter table public.profiles
  add constraint profiles_company_role_check
  check (company_role is null or company_role in ('admin', 'staff'));

notify pgrst, 'reload schema';
