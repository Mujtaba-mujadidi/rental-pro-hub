import type { ContractChangeFieldSnapshot } from "@/lib/companies/contract-change-diff";

/** Parent company columns updated for any legal detail save. */
export function companyDetailsUpdateFromSnapshot(proposed: ContractChangeFieldSnapshot) {
  return {
    name: proposed.name,
    legal_name: proposed.legal_name,
    company_number: proposed.company_number,
    registered_address_line1: proposed.registered_address_line1,
    registered_address_line2: proposed.registered_address_line2,
    registered_town: proposed.registered_town,
    registered_county: proposed.registered_county,
    registered_postcode: proposed.registered_postcode,
    country: proposed.country,
    primary_contact_first_name: proposed.primary_contact_first_name,
    primary_contact_last_name: proposed.primary_contact_last_name,
    primary_contact_dob: proposed.primary_contact_dob,
    primary_contact_phone: proposed.primary_contact_phone,
    primary_contact_email: proposed.primary_contact_email,
    notes: proposed.notes,
  };
}

/** Fields mirrored to the primary subcompany after parent company legal updates. */
export function primarySubcompanyMirrorFromSnapshot(proposed: ContractChangeFieldSnapshot) {
  return {
    name: proposed.name,
    primary_contact_first_name: proposed.primary_contact_first_name,
    primary_contact_last_name: proposed.primary_contact_last_name,
    primary_contact_dob: proposed.primary_contact_dob,
    primary_contact_phone: proposed.primary_contact_phone,
    primary_contact_email: proposed.primary_contact_email,
  };
}
