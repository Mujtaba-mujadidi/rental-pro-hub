export type SubcompanyStatus = "active" | "inactive" | "pending";

/** Full subcompany row used by the workspace shell. */
export type SubcompanyRow = {
  id: string;
  parent_company_id: string;
  is_primary: boolean;
  name: string;
  display_name: string | null;
  legal_name: string | null;
  company_number: string | null;
  registered_address_line1: string | null;
  registered_address_line2: string | null;
  registered_town: string | null;
  registered_county: string | null;
  registered_postcode: string | null;
  country: string | null;
  primary_contact_first_name: string;
  primary_contact_last_name: string;
  primary_contact_dob: string;
  primary_contact_phone: string;
  primary_contact_email: string;
  status: SubcompanyStatus;
  notes: string | null;
  logo_storage_path: string | null;
  created_at: string;
  updated_at: string;
};

export type SubcompanyWorkspaceShell = {
  subcompany: SubcompanyRow;
  canWrite: boolean;
  canDeactivate: boolean;
  openRequirementCount: number;
  logoSignedUrl: string | null;
};

export const SUBCOMPANY_SELECT =
  "id, parent_company_id, is_primary, name, display_name, legal_name, company_number, registered_address_line1, registered_address_line2, registered_town, registered_county, registered_postcode, country, primary_contact_first_name, primary_contact_last_name, primary_contact_dob, primary_contact_phone, primary_contact_email, status, notes, logo_storage_path, created_at, updated_at";

export function mapSubcompanyRow(raw: Record<string, unknown>): SubcompanyRow {
  const statusRaw = String(raw.status ?? "active");
  const status: SubcompanyStatus =
    statusRaw === "inactive" || statusRaw === "pending" ? statusRaw : "active";
  return {
    id: String(raw.id),
    parent_company_id: String(raw.parent_company_id),
    is_primary: Boolean(raw.is_primary),
    name: String(raw.name ?? ""),
    display_name: (raw.display_name as string | null) ?? null,
    legal_name: (raw.legal_name as string | null) ?? null,
    company_number: (raw.company_number as string | null) ?? null,
    registered_address_line1: (raw.registered_address_line1 as string | null) ?? null,
    registered_address_line2: (raw.registered_address_line2 as string | null) ?? null,
    registered_town: (raw.registered_town as string | null) ?? null,
    registered_county: (raw.registered_county as string | null) ?? null,
    registered_postcode: (raw.registered_postcode as string | null) ?? null,
    country: (raw.country as string | null) ?? null,
    primary_contact_first_name: String(raw.primary_contact_first_name ?? ""),
    primary_contact_last_name: String(raw.primary_contact_last_name ?? ""),
    primary_contact_dob: String(raw.primary_contact_dob ?? ""),
    primary_contact_phone: String(raw.primary_contact_phone ?? ""),
    primary_contact_email: String(raw.primary_contact_email ?? ""),
    status,
    notes: (raw.notes as string | null) ?? null,
    logo_storage_path: (raw.logo_storage_path as string | null) ?? null,
    created_at: String(raw.created_at ?? ""),
    updated_at: String(raw.updated_at ?? ""),
  };
}
