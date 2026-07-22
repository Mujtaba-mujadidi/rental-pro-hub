-- One email + sequential hirer signing for all agreements on a hire group.

alter table public.vehicle_hire_groups
  add column if not exists signing_bundle_token_hash text,
  add column if not exists signing_bundle_otp_hash text,
  add column if not exists signing_bundle_otp_expires_at timestamptz,
  add column if not exists signing_bundle_otp_attempts int not null default 0,
  add column if not exists signing_bundle_verified_at timestamptz,
  add column if not exists signing_bundle_sent_at timestamptz,
  add column if not exists signing_bundle_expires_at timestamptz;

create index if not exists vehicle_hire_groups_signing_bundle_token_idx
  on public.vehicle_hire_groups (signing_bundle_token_hash)
  where signing_bundle_token_hash is not null;
