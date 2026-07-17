-- Allow PHV/Taxi licence paper as a first-class vehicle document type.
-- (Historical name was pco_paper; later renamed in 20260717200000.)

alter table public.vehicle_documents drop constraint if exists vehicle_documents_doc_type_check;
alter table public.vehicle_documents
  add constraint vehicle_documents_doc_type_check
  check (doc_type in (
    'mot',
    'logbook',
    'phv_taxi_licence_paper',
    'pco_paper',
    'phv_licence',
    'insurance',
    'permission_letter',
    'photo',
    'other'
  ));
