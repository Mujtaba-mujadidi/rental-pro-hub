-- Company notification lead times (days before expiry to notify).

alter table public.companies
  add column if not exists notify_mot_days_before integer not null default 5
    check (notify_mot_days_before >= 0 and notify_mot_days_before <= 365);

alter table public.companies
  add column if not exists notify_tax_days_before integer not null default 5
    check (notify_tax_days_before >= 0 and notify_tax_days_before <= 365);

alter table public.companies
  add column if not exists notify_phv_licence_days_before integer not null default 28
    check (notify_phv_licence_days_before >= 0 and notify_phv_licence_days_before <= 365);

comment on column public.companies.notify_mot_days_before is
  'Days before MOT expiry to notify staff. Default 5.';
comment on column public.companies.notify_tax_days_before is
  'Days before tax expiry to notify staff. Default 5.';
comment on column public.companies.notify_phv_licence_days_before is
  'Days before PHV/Taxi licence expiry to notify staff. Default 28.';
