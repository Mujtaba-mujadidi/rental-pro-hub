-- Driver hire access email links: OTP gate + 30-minute expiry (mirrors hire signing bundle).

alter table public.company_driver_access_requests
  add column if not exists response_otp_hash text,
  add column if not exists response_otp_attempts integer not null default 0,
  add column if not exists response_verified_at timestamptz,
  add column if not exists response_expires_at timestamptz;

create index if not exists company_driver_access_requests_response_expires_idx
  on public.company_driver_access_requests (response_expires_at)
  where status = 'pending';
