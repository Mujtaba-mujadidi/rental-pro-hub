-- Owner-first signing: field_values, owner_signed status, saved signature reuse.

alter table public.esign_envelopes
  add column if not exists field_values jsonb not null default '{}'::jsonb,
  add column if not exists owner_signed_at timestamptz,
  add column if not exists owner_signed_by uuid references auth.users (id) on delete set null;

comment on column public.esign_envelopes.field_values is
  'Accumulated field values keyed by field id (owner then recipient).';
comment on column public.esign_envelopes.owner_signed_at is
  'When the contract owner (platform) signed before sending to the recipient.';

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

create or replace function public.esign_saved_signatures_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists esign_saved_signatures_updated_at on public.esign_saved_signatures;
create trigger esign_saved_signatures_updated_at
  before update on public.esign_saved_signatures
  for each row execute function public.esign_saved_signatures_set_updated_at();

comment on table public.esign_saved_signatures is
  'Optional reusable signature images for platform users and recipient emails.';

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
