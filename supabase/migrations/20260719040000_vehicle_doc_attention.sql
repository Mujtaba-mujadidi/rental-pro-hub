-- MOT / PHV document-upload attention timestamps on vehicles.

alter table public.vehicles
  add column if not exists mot_doc_attention_at timestamptz;

alter table public.vehicles
  add column if not exists phv_doc_attention_at timestamptz;

comment on column public.vehicles.mot_doc_attention_at is
  'Set when MOT maintenance is logged; cleared when MOT document is uploaded or user confirms.';

comment on column public.vehicles.phv_doc_attention_at is
  'Set when PHV/Taxi licence maintenance is logged; cleared when PHV paper is uploaded or user confirms.';

create index if not exists vehicles_mot_doc_attention_at_idx
  on public.vehicles (parent_company_id)
  where mot_doc_attention_at is not null;

create index if not exists vehicles_phv_doc_attention_at_idx
  on public.vehicles (parent_company_id)
  where phv_doc_attention_at is not null;
