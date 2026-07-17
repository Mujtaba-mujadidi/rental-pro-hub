/** Shared identity matching for company duplicate prevention and draft pruning. */

export type CompanyIdentityFields = {
  name: string;
  primary_contact_email?: string | null;
  company_number?: string | null;
};

export function normalizeCompanyName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeCompanyEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeCompanyNumber(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

/**
 * True when two company identities should be treated as the same organisation.
 * Match on any of: primary contact email, company number (when both set), or company name.
 */
export function companyIdentitiesMatch(a: CompanyIdentityFields, b: CompanyIdentityFields): boolean {
  const emailA = a.primary_contact_email ? normalizeCompanyEmail(a.primary_contact_email) : "";
  const emailB = b.primary_contact_email ? normalizeCompanyEmail(b.primary_contact_email) : "";
  if (emailA && emailB && emailA === emailB) return true;

  const numA = a.company_number ? normalizeCompanyNumber(a.company_number) : "";
  const numB = b.company_number ? normalizeCompanyNumber(b.company_number) : "";
  if (numA && numB && numA === numB) return true;

  const nameA = a.name ? normalizeCompanyName(a.name) : "";
  const nameB = b.name ? normalizeCompanyName(b.name) : "";
  if (nameA && nameB && nameA === nameB) return true;

  return false;
}
