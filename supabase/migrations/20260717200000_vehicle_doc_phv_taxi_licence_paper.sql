-- Rename vehicle doc type pco_paper → phv_taxi_licence_paper (PHV/Taxi licence paper).
-- Also keep phv_licence readable as a legacy alias until rows are replaced by uploads.

update public.vehicle_documents
set doc_type = 'phv_taxi_licence_paper'
where doc_type = 'pco_paper';

alter table public.vehicle_documents drop constraint if exists vehicle_documents_doc_type_check;
alter table public.vehicle_documents
  add constraint vehicle_documents_doc_type_check
  check (doc_type in (
    'mot',
    'logbook',
    'phv_taxi_licence_paper',
    'phv_licence',
    'insurance',
    'permission_letter',
    'photo',
    'other'
  ));

comment on column public.vehicles.phv_licence_no is
  'PHV/Taxi vehicle licence number (plate/licence identifier).';
comment on column public.vehicles.phv_licence_expiry is
  'PHV/Taxi vehicle licence expiry date.';
