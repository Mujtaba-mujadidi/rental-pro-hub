-- Owner-first signing + saved signatures (run if migration not applied).

alter table public.esign_envelopes
  add column if not exists field_values jsonb not null default '{}'::jsonb,
  add column if not exists owner_signed_at timestamptz,
  add column if not exists owner_signed_by uuid references auth.users (id) on delete set null;

alter table public.esign_envelopes drop constraint if exists esign_envelopes_status_check;
alter table public.esign_envelopes add constraint esign_envelopes_status_check
  check (status in (
    'draft',
    'awaiting_placement',
    'owner_signed',
    'sent',
    'viewed',
    'completed',
    'void',
    'expired'
  ));

create table if not exists public.esign_saved_signatures (
  id uuid primary key default gen_random_uuid(),
  party_type text not null check (party_type in ('user', 'email')),
  user_id uuid references auth.users (id) on delete cascade,
  email text,
  storage_path text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint esign_saved_signatures_party_check check (
    (party_type = 'user' and user_id is not null and email is null)
    or (party_type = 'email' and email is not null and user_id is null)
  )
);

create unique index if not exists esign_saved_signatures_user_uidx
  on public.esign_saved_signatures (user_id)
  where party_type = 'user';

create unique index if not exists esign_saved_signatures_email_uidx
  on public.esign_saved_signatures (email)
  where party_type = 'email';

alter table public.esign_envelopes
  add column if not exists requires_owner_signature boolean not null default true,
  add column if not exists suggested_field_layout jsonb not null default '[]'::jsonb;

comment on column public.esign_envelopes.requires_owner_signature is
  'When false, only the recipient signs (owner signature skipped).';
comment on column public.esign_envelopes.suggested_field_layout is
  'Auto-positioned signature/date fields aligned to PDF execution placeholders.';

alter table public.esign_saved_signatures enable row level security;

drop policy if exists esign_saved_signatures_super_admin_all on public.esign_saved_signatures;
create policy esign_saved_signatures_super_admin_all
  on public.esign_saved_signatures
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
  );
