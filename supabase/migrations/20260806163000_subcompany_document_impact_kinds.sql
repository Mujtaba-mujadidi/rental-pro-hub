-- Extend subcompany hire document requirements for logo-bearing inspection reports.

alter table public.subcompany_hire_document_requirements
  drop constraint if exists subcompany_hire_document_requirements_document_kind_check;

alter table public.subcompany_hire_document_requirements
  add constraint subcompany_hire_document_requirements_document_kind_check
  check (
    document_kind in (
      'hire_agreement',
      'permission_letter',
      'inspection_checkout',
      'inspection_checkin'
    )
  );

alter table public.subcompany_hire_document_requirements
  add column if not exists inspection_id uuid
    references public.vehicle_hire_inspections (id) on delete set null;

create index if not exists subcompany_hire_document_requirements_inspection_idx
  on public.subcompany_hire_document_requirements (inspection_id)
  where inspection_id is not null;
