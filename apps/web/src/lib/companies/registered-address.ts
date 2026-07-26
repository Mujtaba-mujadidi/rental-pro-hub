export type RegisteredAddressParts = {
  registered_address_line1?: string | null;
  registered_address_line2?: string | null;
  registered_town?: string | null;
  registered_county?: string | null;
  registered_postcode?: string | null;
};

/** Single-line UK registered address for headers and summaries. */
export function formatRegisteredCompanyAddress(parts: RegisteredAddressParts): string | null {
  const line = [
    parts.registered_address_line1,
    parts.registered_address_line2,
    parts.registered_town,
    parts.registered_county,
    parts.registered_postcode,
  ]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");
  return line || null;
}
