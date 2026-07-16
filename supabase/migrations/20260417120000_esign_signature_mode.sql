-- Signature mode + suggested field placeholders on envelopes.

alter table public.esign_envelopes
  add column if not exists requires_owner_signature boolean not null default true,
  add column if not exists suggested_field_layout jsonb not null default '[]'::jsonb;

comment on column public.esign_envelopes.requires_owner_signature is
  'When false, only the recipient signs (owner signature skipped).';
comment on column public.esign_envelopes.suggested_field_layout is
  'Auto-positioned signature/date fields aligned to PDF execution placeholders.';
