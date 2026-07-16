-- Native RMS e-sign: envelopes, recipients, audit, private storage bucket.
-- Aligns with docs plan: replace DocuSeal for platform company contracts (reusable context_type).

create table if not exists public.esign_envelopes (
  id uuid primary key default gen_random_uuid(),
  context_type text not null,
  context_id uuid not null,
  parent_company_id uuid references public.companies (id) on delete set null,
  status text not null default 'draft'
    check (status in (
      'draft',
      'awaiting_placement',
      'sent',
      'viewed',
      'completed',
      'void',
      'expired'
    )),
  title text not null default 'Agreement',
  unsigned_pdf_path text,
  signed_pdf_path text,
  field_layout jsonb not null default '[]'::jsonb,
  expires_at timestamptz,
  sent_at timestamptz,
  completed_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  retention_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists esign_envelopes_context_idx
  on public.esign_envelopes (context_type, context_id);
create index if not exists esign_envelopes_parent_company_id_idx
  on public.esign_envelopes (parent_company_id);
create index if not exists esign_envelopes_status_idx
  on public.esign_envelopes (status);

comment on table public.esign_envelopes is
  'Reusable e-sign envelopes. context_type e.g. platform_company_contract; PDF paths in storage bucket esign-documents.';

create table if not exists public.esign_recipients (
  id uuid primary key default gen_random_uuid(),
  envelope_id uuid not null references public.esign_envelopes (id) on delete cascade,
  email text not null,
  name text,
  role text not null default 'signer',
  access_token_hash text,
  otp_hash text,
  otp_expires_at timestamptz,
  otp_attempts integer not null default 0,
  verified_at timestamptz,
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists esign_recipients_envelope_id_idx
  on public.esign_recipients (envelope_id);
create index if not exists esign_recipients_access_token_hash_idx
  on public.esign_recipients (access_token_hash)
  where access_token_hash is not null;

create table if not exists public.esign_audit_events (
  id uuid primary key default gen_random_uuid(),
  envelope_id uuid not null references public.esign_envelopes (id) on delete cascade,
  event_type text not null,
  actor text,
  ip text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists esign_audit_events_envelope_id_idx
  on public.esign_audit_events (envelope_id, created_at desc);

create or replace function public.esign_envelopes_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists esign_envelopes_set_updated_at on public.esign_envelopes;
create trigger esign_envelopes_set_updated_at
  before update on public.esign_envelopes
  for each row execute procedure public.esign_envelopes_set_updated_at();

create or replace function public.esign_recipients_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists esign_recipients_set_updated_at on public.esign_recipients;
create trigger esign_recipients_set_updated_at
  before update on public.esign_recipients
  for each row execute procedure public.esign_recipients_set_updated_at();

alter table public.esign_envelopes enable row level security;
alter table public.esign_recipients enable row level security;
alter table public.esign_audit_events enable row level security;

drop policy if exists esign_envelopes_super_admin_all on public.esign_envelopes;
create policy esign_envelopes_super_admin_all
  on public.esign_envelopes for all
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  );

drop policy if exists esign_recipients_super_admin_all on public.esign_recipients;
create policy esign_recipients_super_admin_all
  on public.esign_recipients for all
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  );

drop policy if exists esign_audit_events_super_admin_select on public.esign_audit_events;
create policy esign_audit_events_super_admin_select
  on public.esign_audit_events for select
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  );

drop policy if exists esign_audit_events_super_admin_insert on public.esign_audit_events;
create policy esign_audit_events_super_admin_insert
  on public.esign_audit_events for insert
  to authenticated
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  );

-- Public signing uses service role; no anon policies on tables.

insert into storage.buckets (id, name, public)
values ('esign-documents', 'esign-documents', false)
on conflict (id) do nothing;

-- Storage access: super_admin only via authenticated policies; signing downloads go through service role.
drop policy if exists esign_documents_select_super_admin on storage.objects;
create policy esign_documents_select_super_admin
  on storage.objects for select to authenticated
  using (
    bucket_id = 'esign-documents'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  );

drop policy if exists esign_documents_insert_super_admin on storage.objects;
create policy esign_documents_insert_super_admin
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'esign-documents'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  );

drop policy if exists esign_documents_update_super_admin on storage.objects;
create policy esign_documents_update_super_admin
  on storage.objects for update to authenticated
  using (
    bucket_id = 'esign-documents'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  );

drop policy if exists esign_documents_delete_super_admin on storage.objects;
create policy esign_documents_delete_super_admin
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'esign-documents'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  );
