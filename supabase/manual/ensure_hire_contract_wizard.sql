-- Idempotent ensure for hire contract wizard columns (see 20260722120000_hire_contract_wizard.sql).

alter table public.vehicle_hire_groups
  alter column vehicle_id drop not null,
  alter column subcompany_id drop not null,
  alter column driver_user_id drop not null,
  alter column start_date drop not null;

alter table public.vehicle_hire_groups
  add column if not exists wizard_step integer not null default 1,
  add column if not exists draft_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists driver_access_status text not null default 'not_requested',
  add column if not exists driver_licence_number text,
  add column if not exists driver_email text,
  add column if not exists driver_profile_confirmed boolean not null default false,
  add column if not exists include_deposit boolean not null default false;

alter table public.company_driver_access_requests
  alter column driver_user_id drop not null;

alter table public.company_driver_access_requests
  add column if not exists hire_group_id uuid references public.vehicle_hire_groups (id) on delete cascade,
  add column if not exists driving_licence_number text,
  add column if not exists driver_email text,
  add column if not exists hire_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists response_token_hash text,
  add column if not exists registration_invite_sent_at timestamptz;
