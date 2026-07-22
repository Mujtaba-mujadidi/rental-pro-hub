-- Hire contract wizard: backend drafts, driver access linked to hire groups.

alter table public.vehicle_hire_groups
  alter column vehicle_id drop not null,
  alter column subcompany_id drop not null,
  alter column driver_user_id drop not null,
  alter column start_date drop not null;

alter table public.vehicle_hire_groups
  add column if not exists wizard_step integer not null default 1
    check (wizard_step >= 1 and wizard_step <= 5),
  add column if not exists draft_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists driver_access_status text not null default 'not_requested'
    check (driver_access_status in (
      'not_requested', 'pending', 'approved', 'rejected', 'awaiting_registration'
    )),
  add column if not exists driver_licence_number text,
  add column if not exists driver_email text,
  add column if not exists driver_profile_confirmed boolean not null default false,
  add column if not exists include_deposit boolean not null default false;

create index if not exists vehicle_hire_groups_draft_wizard_idx
  on public.vehicle_hire_groups (parent_company_id, status, wizard_step, updated_at desc)
  where status = 'draft';

alter table public.company_driver_access_requests
  alter column driver_user_id drop not null;

alter table public.company_driver_access_requests
  add column if not exists hire_group_id uuid references public.vehicle_hire_groups (id) on delete cascade,
  add column if not exists driving_licence_number text,
  add column if not exists driver_email text,
  add column if not exists hire_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists response_token_hash text,
  add column if not exists registration_invite_sent_at timestamptz;

create index if not exists company_driver_access_requests_hire_group_idx
  on public.company_driver_access_requests (hire_group_id, status);

create unique index if not exists company_driver_access_requests_token_hash_uidx
  on public.company_driver_access_requests (response_token_hash)
  where response_token_hash is not null;
