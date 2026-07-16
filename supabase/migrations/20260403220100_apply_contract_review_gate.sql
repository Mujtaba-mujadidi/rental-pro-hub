-- Require review approval (or legacy awaiting_signature) before applying legal changes.

create or replace function public.apply_company_contract_change(p_change_id uuid, p_signed_by uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.company_contract_change_requests%rowtype;
  v_primary_subcompany_id uuid;
  v_contract_id uuid;
  v_next_ver integer;
  v_snapshot jsonb;
  v_new_version_id uuid;
begin
  select * into req
  from public.company_contract_change_requests
  where id = p_change_id
  for update;

  if req.id is null then
    raise exception 'Contract change request not found';
  end if;
  if req.status <> 'pending_signature' then
    raise exception 'Contract change request is not pending signature';
  end if;
  if req.review_status in ('rejected', 'completed') then
    raise exception 'Contract change request is not in an applicable state';
  end if;
  if req.review_status not in ('awaiting_signature', 'approved') then
    raise exception 'Contract change must be reviewed before it can be applied';
  end if;

  select s.id into v_primary_subcompany_id
  from public.subcompanies s
  where s.parent_company_id = req.parent_company_id
    and s.is_primary
  order by s.created_at asc, s.id asc
  limit 1;

  if v_primary_subcompany_id is null then
    raise exception 'Primary subcompany not found for parent company %', req.parent_company_id;
  end if;

  select cc.id into v_contract_id
  from public.company_contracts cc
  where cc.parent_company_id = req.parent_company_id
  limit 1;

  if v_contract_id is null then
    insert into public.company_contracts (parent_company_id, status)
    values (req.parent_company_id, 'active')
    returning id into v_contract_id;
  end if;

  update public.companies c
  set
    name = req.proposed_name,
    legal_name = req.proposed_legal_name,
    company_number = req.proposed_company_number,
    registered_address_line1 = req.proposed_registered_address_line1,
    registered_address_line2 = req.proposed_registered_address_line2,
    registered_town = req.proposed_registered_town,
    registered_county = req.proposed_registered_county,
    registered_postcode = req.proposed_registered_postcode,
    country = req.proposed_country,
    primary_contact_first_name = req.proposed_primary_contact_first_name,
    primary_contact_last_name = req.proposed_primary_contact_last_name,
    primary_contact_dob = req.proposed_primary_contact_dob,
    primary_contact_phone = req.proposed_primary_contact_phone,
    primary_contact_email = req.proposed_primary_contact_email,
    notes = req.proposed_notes,
    contract_status = 'active',
    contract_version = coalesce(c.contract_version, 1) + 1
  where c.id = req.parent_company_id;

  select coalesce(max(v.version_number), 0) + 1 into v_next_ver
  from public.company_contract_versions v
  where v.contract_id = v_contract_id;

  v_snapshot := jsonb_build_object(
    'name', req.proposed_name,
    'legal_name', req.proposed_legal_name,
    'company_number', req.proposed_company_number,
    'registered_address_line1', req.proposed_registered_address_line1,
    'registered_address_line2', req.proposed_registered_address_line2,
    'registered_town', req.proposed_registered_town,
    'registered_county', req.proposed_registered_county,
    'registered_postcode', req.proposed_registered_postcode,
    'country', req.proposed_country,
    'primary_contact_first_name', req.proposed_primary_contact_first_name,
    'primary_contact_last_name', req.proposed_primary_contact_last_name,
    'primary_contact_dob', req.proposed_primary_contact_dob,
    'primary_contact_phone', req.proposed_primary_contact_phone,
    'primary_contact_email', req.proposed_primary_contact_email,
    'notes', req.proposed_notes
  );

  insert into public.company_contract_versions (
    contract_id,
    version_number,
    snapshot,
    legal_snapshot,
    version_status,
    signed_at,
    signed_by_customer_at,
    countersigned_at,
    created_by,
    change_reason
  )
  values (
    v_contract_id,
    v_next_ver,
    v_snapshot,
    v_snapshot,
    'active',
    now(),
    now(),
    now(),
    p_signed_by,
    'Legal change request applied'
  )
  returning id into v_new_version_id;

  update public.company_contracts
  set
    current_version_id = v_new_version_id,
    status = 'active',
    contract_signed_at = coalesce(contract_signed_at, now())
  where id = v_contract_id;

  update public.subcompanies s
  set
    name = req.proposed_name,
    primary_contact_first_name = req.proposed_primary_contact_first_name,
    primary_contact_last_name = req.proposed_primary_contact_last_name,
    primary_contact_dob = req.proposed_primary_contact_dob,
    primary_contact_phone = req.proposed_primary_contact_phone,
    primary_contact_email = req.proposed_primary_contact_email
  where s.id = v_primary_subcompany_id;

  update public.company_contract_change_requests
  set
    status = 'signed',
    review_status = 'completed',
    signed_at = now(),
    signed_by = p_signed_by,
    contract_id = v_contract_id,
    updated_at = now()
  where id = p_change_id;
end;
$$;
