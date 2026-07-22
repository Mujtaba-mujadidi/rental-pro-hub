-- Idempotent: company notification lead-day settings.

alter table public.companies
  add column if not exists notify_mot_days_before integer not null default 5;

alter table public.companies
  add column if not exists notify_tax_days_before integer not null default 5;

alter table public.companies
  add column if not exists notify_phv_licence_days_before integer not null default 28;

alter table public.companies
  add column if not exists notify_contract_expiry_days_before integer not null default 28;

-- Best-effort constraints (ignore if already present / conflict)
do $$
begin
  alter table public.companies
    add constraint companies_notify_mot_days_before_check
    check (notify_mot_days_before >= 0 and notify_mot_days_before <= 365);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.companies
    add constraint companies_notify_tax_days_before_check
    check (notify_tax_days_before >= 0 and notify_tax_days_before <= 365);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.companies
    add constraint companies_notify_phv_licence_days_before_check
    check (notify_phv_licence_days_before >= 0 and notify_phv_licence_days_before <= 365);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.companies
    add constraint companies_notify_contract_expiry_days_before_check
    check (notify_contract_expiry_days_before >= 0 and notify_contract_expiry_days_before <= 365);
exception when duplicate_object then null;
end $$;
