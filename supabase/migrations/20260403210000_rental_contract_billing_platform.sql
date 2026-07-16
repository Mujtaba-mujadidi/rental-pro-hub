-- Rental contract module: commercial fields, billing, invoices, payments, adjustments, amendments,
-- signature requests, presets, notifications, audit. RLS aligned with super_admin + rental membership.

-- ---------------------------------------------------------------------------
-- company_contracts: expand status + commercial columns
-- ---------------------------------------------------------------------------
alter table public.company_contracts
  drop constraint if exists company_contracts_status_check;

update public.company_contracts
set status = 'pending_amendment'
where status = 'pending_renewal';

alter table public.company_contracts
  add constraint company_contracts_status_check
  check (
    status in (
      'draft',
      'sent_for_signature',
      'signed_by_customer',
      'active',
      'pending_amendment',
      'suspended',
      'terminated',
      'expired',
      'superseded'
    )
  );

alter table public.company_contracts
  add column if not exists contract_number text,
  add column if not exists contract_type text,
  add column if not exists pricing_model text,
  add column if not exists billing_frequency text,
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists is_ongoing boolean not null default true,
  add column if not exists auto_renew boolean not null default false,
  add column if not exists notice_period_days integer,
  add column if not exists currency text not null default 'GBP',
  add column if not exists payment_terms_days integer,
  add column if not exists billing_anchor_day integer,
  add column if not exists contract_signed_at timestamptz,
  add column if not exists terminated_at timestamptz,
  add column if not exists termination_reason text,
  add column if not exists internal_notes text,
  add column if not exists legacy_bootstrap_signed boolean not null default false;

comment on column public.company_contracts.legacy_bootstrap_signed is
  'True when v1 was created before e-sign (pre-platform attestation); not a DocuSeal-signed flow.';

create unique index if not exists company_contracts_contract_number_key
  on public.company_contracts (contract_number)
  where contract_number is not null;

-- ---------------------------------------------------------------------------
-- company_contract_versions: lifecycle + snapshot columns
-- ---------------------------------------------------------------------------
alter table public.company_contract_versions
  alter column signed_at drop not null;

alter table public.company_contract_versions
  add column if not exists version_status text not null default 'legacy_import'
    check (
      version_status in (
        'draft',
        'sent_for_signature',
        'viewed',
        'signed_by_customer',
        'active',
        'superseded',
        'expired',
        'terminated',
        'legacy_import'
      )
    ),
  add column if not exists template_used text,
  add column if not exists rendered_pdf_storage_path text,
  add column if not exists legal_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists pricing_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists commercial_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists sent_for_signature_at timestamptz,
  add column if not exists signed_by_customer_at timestamptz,
  add column if not exists countersigned_at timestamptz,
  add column if not exists superseded_at timestamptz,
  add column if not exists change_reason text,
  add column if not exists amendment_type text,
  add column if not exists created_by uuid references auth.users (id) on delete set null;

update public.company_contract_versions
set
  legal_snapshot = coalesce(nullif(snapshot, '{}'::jsonb), '{}'::jsonb),
  version_status = 'legacy_import'
where legal_snapshot = '{}'::jsonb
  and snapshot is not null
  and snapshot <> '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- Pricing presets & templates (super admin)
-- ---------------------------------------------------------------------------
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

create table if not exists public.contract_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  body_ref text,
  variable_schema jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

-- ---------------------------------------------------------------------------
-- Signature requests (DocuSeal / provider)
-- ---------------------------------------------------------------------------
create table if not exists public.contract_signature_requests (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.company_contracts (id) on delete cascade,
  version_id uuid references public.company_contract_versions (id) on delete set null,
  provider text not null default 'docuseal',
  provider_submission_id text,
  status text not null default 'draft'
    check (
      status in (
        'draft',
        'sent',
        'viewed',
        'signed_by_customer',
        'active',
        'superseded',
        'expired',
        'declined'
      )
    ),
  signatory_name text,
  signatory_email text,
  signatory_title text,
  metadata jsonb not null default '{}'::jsonb,
  audit_trail jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contract_signature_requests_contract_idx
  on public.contract_signature_requests (contract_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Billing schedules & items
-- ---------------------------------------------------------------------------
create table if not exists public.billing_schedules (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.company_contracts (id) on delete cascade,
  parent_company_id uuid not null references public.companies (id) on delete cascade,
  pricing_snapshot_id uuid references public.contract_pricing_snapshots (id) on delete set null,
  frequency text not null
    check (frequency in ('weekly', 'monthly', 'quarterly', 'annual', 'custom')),
  start_date date not null,
  end_date date,
  is_ongoing boolean not null default true,
  next_period_start date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists billing_schedules_contract_idx
  on public.billing_schedules (contract_id);

create table if not exists public.billing_schedule_items (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.billing_schedules (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  amount_due numeric(14, 2) not null,
  currency text not null default 'GBP',
  status text not null default 'scheduled'
    check (status in ('scheduled', 'invoiced', 'skipped', 'cancelled')),
  created_at timestamptz not null default now()
);

create index if not exists billing_schedule_items_schedule_idx
  on public.billing_schedule_items (schedule_id, period_start);

-- ---------------------------------------------------------------------------
-- Invoices
-- ---------------------------------------------------------------------------
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  parent_company_id uuid not null references public.companies (id) on delete cascade,
  contract_id uuid references public.company_contracts (id) on delete set null,
  billing_schedule_item_id uuid references public.billing_schedule_items (id) on delete set null,
  billing_period_start date,
  billing_period_end date,
  issue_date date,
  due_date date,
  status text not null default 'draft'
    check (
      status in (
        'draft',
        'issued',
        'due',
        'payment_submitted',
        'paid',
        'rejected',
        'overdue',
        'void'
      )
    ),
  subtotal numeric(14, 2) not null default 0,
  tax_amount numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  currency text not null default 'GBP',
  notes text,
  internal_notes text,
  payment_validation_status text,
  confirmed_payment_method text,
  paid_at timestamptz,
  generated_by uuid references auth.users (id) on delete set null,
  pricing_snapshot jsonb not null default '{}'::jsonb,
  adjustment_summary jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists invoices_parent_company_idx
  on public.invoices (parent_company_id, created_at desc);
create index if not exists invoices_contract_idx
  on public.invoices (contract_id);

-- ---------------------------------------------------------------------------
-- Payment submissions & validations (two-step workflow)
-- ---------------------------------------------------------------------------
create table if not exists public.invoice_payment_submissions (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  submitted_by uuid not null references auth.users (id) on delete cascade,
  payment_date date not null,
  payment_method text not null,
  reference text,
  note text,
  proof_storage_path text,
  status text not null default 'submitted'
    check (status in ('submitted', 'superseded')),
  created_at timestamptz not null default now()
);

create index if not exists invoice_payment_submissions_invoice_idx
  on public.invoice_payment_submissions (invoice_id, created_at desc);

create table if not exists public.invoice_payment_validations (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.invoice_payment_submissions (id) on delete cascade,
  validated_by uuid not null references auth.users (id) on delete cascade,
  decision text not null check (decision in ('confirmed_paid', 'rejected')),
  comment text,
  confirmed_payment_method text,
  internal_note text,
  created_at timestamptz not null default now(),
  unique (submission_id)
);

-- ---------------------------------------------------------------------------
-- Billing adjustments (discounts, etc.)
-- ---------------------------------------------------------------------------
create table if not exists public.billing_adjustments (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('invoice', 'schedule_item')),
  target_id uuid not null,
  adjustment_type text not null check (adjustment_type in ('discount', 'credit', 'fee')),
  amount_type text not null check (amount_type in ('fixed', 'percent')),
  amount_value numeric(14, 4) not null,
  reason text not null,
  note text,
  original_amount numeric(14, 2),
  adjusted_amount numeric(14, 2),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists billing_adjustments_target_idx
  on public.billing_adjustments (target_type, target_id);

-- ---------------------------------------------------------------------------
-- Effective-dated billing amendments
-- ---------------------------------------------------------------------------
create table if not exists public.contract_billing_amendments (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.company_contracts (id) on delete cascade,
  effective_date date not null,
  reason text not null,
  note text,
  from_pricing_snapshot jsonb not null default '{}'::jsonb,
  to_pricing_snapshot jsonb not null default '{}'::jsonb,
  preset_id uuid references public.contract_pricing_presets (id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'applied', 'cancelled')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  applied_at timestamptz
);

create index if not exists contract_billing_amendments_contract_idx
  on public.contract_billing_amendments (contract_id, effective_date);

-- ---------------------------------------------------------------------------
-- Legal entity transitions (new parent company path)
-- ---------------------------------------------------------------------------
create table if not exists public.legal_entity_transitions (
  id uuid primary key default gen_random_uuid(),
  from_company_id uuid not null references public.companies (id) on delete cascade,
  to_company_id uuid not null references public.companies (id) on delete cascade,
  change_request_id uuid references public.company_contract_change_requests (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Extend legal change requests: review + entity type
-- ---------------------------------------------------------------------------
alter table public.company_contract_change_requests
  add column if not exists transition_type text not null default 'detail_change'
    check (transition_type in ('detail_change', 'new_legal_entity')),
  add column if not exists review_status text not null default 'pending_review'
    check (
      review_status in (
        'pending_review',
        'approved',
        'rejected',
        'awaiting_signature',
        'completed'
      )
    ),
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users (id) on delete set null,
  add column if not exists review_comment text,
  add column if not exists signatory_name text,
  add column if not exists signatory_email text,
  add column if not exists signatory_title text;

-- Map old statuses into review flow: pending_signature -> awaiting_signature for existing rows
update public.company_contract_change_requests
set review_status = 'awaiting_signature'
where status = 'pending_signature'
  and review_status = 'pending_review';

-- ---------------------------------------------------------------------------
-- Notifications & audit
-- ---------------------------------------------------------------------------
create table if not exists public.platform_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists platform_notifications_user_idx
  on public.platform_notifications (user_id, created_at desc);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  actor_id uuid references auth.users (id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_entity_idx
  on public.audit_logs (entity_type, entity_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Triggers: updated_at
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists contract_pricing_presets_touch on public.contract_pricing_presets;
create trigger contract_pricing_presets_touch
  before update on public.contract_pricing_presets
  for each row execute procedure public.touch_updated_at();

drop trigger if exists contract_templates_touch on public.contract_templates;
create trigger contract_templates_touch
  before update on public.contract_templates
  for each row execute procedure public.touch_updated_at();

drop trigger if exists contract_signature_requests_touch on public.contract_signature_requests;
create trigger contract_signature_requests_touch
  before update on public.contract_signature_requests
  for each row execute procedure public.touch_updated_at();

drop trigger if exists billing_schedules_touch on public.billing_schedules;
create trigger billing_schedules_touch
  before update on public.billing_schedules
  for each row execute procedure public.touch_updated_at();

drop trigger if exists invoices_touch on public.invoices;
create trigger invoices_touch
  before update on public.invoices
  for each row execute procedure public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS enable
-- ---------------------------------------------------------------------------
alter table public.contract_pricing_presets enable row level security;
alter table public.contract_templates enable row level security;
alter table public.contract_pricing_snapshots enable row level security;
alter table public.contract_signature_requests enable row level security;
alter table public.billing_schedules enable row level security;
alter table public.billing_schedule_items enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_payment_submissions enable row level security;
alter table public.invoice_payment_validations enable row level security;
alter table public.billing_adjustments enable row level security;
alter table public.contract_billing_amendments enable row level security;
alter table public.legal_entity_transitions enable row level security;
alter table public.platform_notifications enable row level security;
alter table public.audit_logs enable row level security;

-- ---------------------------------------------------------------------------
-- Helper: rental user can read finance data for company
-- ---------------------------------------------------------------------------
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

create or replace function public.user_rental_can_manage_billing_submission(p_company_id uuid)
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
      and m.role in ('owner', 'admin', 'finance')
  );
$$;

revoke all on function public.user_rental_can_view_billing(uuid) from public;
revoke all on function public.user_rental_can_manage_billing_submission(uuid) from public;
grant execute on function public.user_rental_can_view_billing(uuid) to authenticated;
grant execute on function public.user_rental_can_manage_billing_submission(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- contract_pricing_presets / contract_templates: super admin only
-- ---------------------------------------------------------------------------
create policy contract_pricing_presets_all_super_admin
  on public.contract_pricing_presets for all
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  );

create policy contract_templates_all_super_admin
  on public.contract_templates for all
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  );

-- ---------------------------------------------------------------------------
-- contract_pricing_snapshots: super admin + rental read (company via contract)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- contract_signature_requests
-- ---------------------------------------------------------------------------
create policy contract_signature_requests_select_super_admin
  on public.contract_signature_requests for select
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  );

create policy contract_signature_requests_select_rental
  on public.contract_signature_requests for select
  to authenticated
  using (
    exists (
      select 1
      from public.company_contracts cc
      where cc.id = contract_signature_requests.contract_id
        and public.user_rental_can_view_billing(cc.parent_company_id)
    )
  );

create policy contract_signature_requests_mutate_super_admin
  on public.contract_signature_requests for all
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  );

-- ---------------------------------------------------------------------------
-- billing_schedules & items
-- ---------------------------------------------------------------------------
create policy billing_schedules_select_super_admin
  on public.billing_schedules for select
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  );

create policy billing_schedules_select_rental
  on public.billing_schedules for select
  to authenticated
  using (public.user_rental_can_view_billing(billing_schedules.parent_company_id));

create policy billing_schedules_mutate_super_admin
  on public.billing_schedules for all
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  );

create policy billing_schedule_items_select_super_admin
  on public.billing_schedule_items for select
  to authenticated
  using (
    exists (
      select 1
      from public.billing_schedules s
      join public.profiles p on p.id = auth.uid() and p.role = 'super_admin'
      where s.id = billing_schedule_items.schedule_id
    )
  );

create policy billing_schedule_items_select_rental
  on public.billing_schedule_items for select
  to authenticated
  using (
    exists (
      select 1
      from public.billing_schedules s
      where s.id = billing_schedule_items.schedule_id
        and public.user_rental_can_view_billing(s.parent_company_id)
    )
  );

create policy billing_schedule_items_mutate_super_admin
  on public.billing_schedule_items for all
  to authenticated
  using (
    exists (
      select 1
      from public.billing_schedules s
      join public.profiles p on p.id = auth.uid() and p.role = 'super_admin'
      where s.id = billing_schedule_items.schedule_id
    )
  )
  with check (
    exists (
      select 1
      from public.billing_schedules s
      join public.profiles p on p.id = auth.uid() and p.role = 'super_admin'
      where s.id = billing_schedule_items.schedule_id
    )
  );

-- ---------------------------------------------------------------------------
-- invoices
-- ---------------------------------------------------------------------------
create policy invoices_select_super_admin
  on public.invoices for select
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  );

create policy invoices_select_rental
  on public.invoices for select
  to authenticated
  using (public.user_rental_can_view_billing(invoices.parent_company_id));

create policy invoices_mutate_super_admin
  on public.invoices for all
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  );

-- Rental must NOT set paid directly: no rental UPDATE policy on invoices

-- ---------------------------------------------------------------------------
-- invoice_payment_submissions
-- ---------------------------------------------------------------------------
create policy invoice_payment_submissions_select_super_admin
  on public.invoice_payment_submissions for select
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  );

create policy invoice_payment_submissions_select_rental
  on public.invoice_payment_submissions for select
  to authenticated
  using (
    exists (
      select 1
      from public.invoices i
      where i.id = invoice_payment_submissions.invoice_id
        and public.user_rental_can_view_billing(i.parent_company_id)
    )
  );

create policy invoice_payment_submissions_insert_rental
  on public.invoice_payment_submissions for insert
  to authenticated
  with check (
    submitted_by = auth.uid()
    and exists (
      select 1
      from public.invoices i
      where i.id = invoice_payment_submissions.invoice_id
        and public.user_rental_can_manage_billing_submission(i.parent_company_id)
    )
  );

create policy invoice_payment_submissions_mutate_super_admin
  on public.invoice_payment_submissions for update
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  );

-- ---------------------------------------------------------------------------
-- invoice_payment_validations: super admin only
-- ---------------------------------------------------------------------------
create policy invoice_payment_validations_all_super_admin
  on public.invoice_payment_validations for all
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  );

create policy invoice_payment_validations_select_rental
  on public.invoice_payment_validations for select
  to authenticated
  using (
    exists (
      select 1
      from public.invoice_payment_submissions s
      join public.invoices i on i.id = s.invoice_id
      where s.id = invoice_payment_validations.submission_id
        and public.user_rental_can_view_billing(i.parent_company_id)
    )
  );

-- ---------------------------------------------------------------------------
-- billing_adjustments: super admin write; rental read via invoice/company
-- ---------------------------------------------------------------------------
create policy billing_adjustments_select_super_admin
  on public.billing_adjustments for select
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  );

create policy billing_adjustments_select_rental
  on public.billing_adjustments for select
  to authenticated
  using (
    (
      target_type = 'invoice'
      and exists (
        select 1
        from public.invoices i
        where i.id = billing_adjustments.target_id
          and public.user_rental_can_view_billing(i.parent_company_id)
      )
    )
    or (
      target_type = 'schedule_item'
      and exists (
        select 1
        from public.billing_schedule_items bi
        join public.billing_schedules s on s.id = bi.schedule_id
        where bi.id = billing_adjustments.target_id
          and public.user_rental_can_view_billing(s.parent_company_id)
      )
    )
  );

create policy billing_adjustments_mutate_super_admin
  on public.billing_adjustments for all
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  );

-- ---------------------------------------------------------------------------
-- contract_billing_amendments
-- ---------------------------------------------------------------------------
create policy contract_billing_amendments_select_super_admin
  on public.contract_billing_amendments for select
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  );

create policy contract_billing_amendments_select_rental
  on public.contract_billing_amendments for select
  to authenticated
  using (
    exists (
      select 1
      from public.company_contracts cc
      where cc.id = contract_billing_amendments.contract_id
        and public.user_rental_can_view_billing(cc.parent_company_id)
    )
  );

create policy contract_billing_amendments_mutate_super_admin
  on public.contract_billing_amendments for all
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  );

-- ---------------------------------------------------------------------------
-- legal_entity_transitions: super admin full; rental no access (optional read later)
-- ---------------------------------------------------------------------------
create policy legal_entity_transitions_all_super_admin
  on public.legal_entity_transitions for all
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  );

-- ---------------------------------------------------------------------------
-- platform_notifications: own rows
-- ---------------------------------------------------------------------------
create policy platform_notifications_select_own
  on public.platform_notifications for select
  to authenticated
  using (user_id = auth.uid());

create policy platform_notifications_update_own
  on public.platform_notifications for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy platform_notifications_insert_service
  on public.platform_notifications for insert
  to authenticated
  with check (true);

-- ^ insert with check true is too open. Restrict inserts to super_admin OR service via security definer RPC only.
-- Drop open insert; use super_admin insert for MVP + backend uses service role.
drop policy if exists platform_notifications_insert_service on public.platform_notifications;

create policy platform_notifications_insert_super_admin
  on public.platform_notifications for insert
  to authenticated
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  );

-- Rental users receive notifications inserted by admin client (bypass RLS) from server actions.

-- ---------------------------------------------------------------------------
-- audit_logs: super admin read; insert via service role only (no insert policy for authenticated)
-- ---------------------------------------------------------------------------
create policy audit_logs_select_super_admin
  on public.audit_logs for select
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  );
