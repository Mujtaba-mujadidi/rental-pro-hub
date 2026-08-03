import type { SubcompanyRow } from "@/lib/rental/subcompany";

/** Versioned lessor snapshot stored on vehicle_hire_groups. */
export const SUBCOMPANY_LEGAL_SNAPSHOT_VERSION = 2;

export type SubcompanyLegalSnapshot = {
  snapshot_version: number;
  name: string | null;
  display_name: string | null;
  legal_name: string | null;
  company_number: string | null;
  registered_address_line1: string | null;
  registered_address_line2: string | null;
  registered_town: string | null;
  registered_county: string | null;
  registered_postcode: string | null;
  country: string | null;
  primary_contact_first_name: string | null;
  primary_contact_last_name: string | null;
  primary_contact_phone: string | null;
  primary_contact_email: string | null;
  logo_storage_path: string | null;
  /** Legacy joined address string (kept for older PDFs). */
  address: string | null;
};

export type SubcompanySnapshotSource = Pick<
  SubcompanyRow,
  | "name"
  | "display_name"
  | "legal_name"
  | "company_number"
  | "registered_address_line1"
  | "registered_address_line2"
  | "registered_town"
  | "registered_county"
  | "registered_postcode"
  | "country"
  | "primary_contact_first_name"
  | "primary_contact_last_name"
  | "primary_contact_phone"
  | "primary_contact_email"
  | "logo_storage_path"
>;

export function formatSubcompanyAddressLines(sub: {
  registered_address_line1?: string | null;
  registered_address_line2?: string | null;
  registered_town?: string | null;
  registered_county?: string | null;
  registered_postcode?: string | null;
}): string {
  return [
    sub.registered_address_line1,
    sub.registered_address_line2,
    sub.registered_town,
    sub.registered_county,
    sub.registered_postcode,
  ]
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean)
    .join(", ");
}

export function buildSubcompanyLegalSnapshot(sub: SubcompanySnapshotSource): SubcompanyLegalSnapshot {
  return {
    snapshot_version: SUBCOMPANY_LEGAL_SNAPSHOT_VERSION,
    name: sub.name ?? null,
    display_name: sub.display_name ?? null,
    legal_name: sub.legal_name ?? null,
    company_number: sub.company_number ?? null,
    registered_address_line1: sub.registered_address_line1 ?? null,
    registered_address_line2: sub.registered_address_line2 ?? null,
    registered_town: sub.registered_town ?? null,
    registered_county: sub.registered_county ?? null,
    registered_postcode: sub.registered_postcode ?? null,
    country: sub.country ?? null,
    primary_contact_first_name: sub.primary_contact_first_name ?? null,
    primary_contact_last_name: sub.primary_contact_last_name ?? null,
    primary_contact_phone: sub.primary_contact_phone ?? null,
    primary_contact_email: sub.primary_contact_email ?? null,
    logo_storage_path: sub.logo_storage_path ?? null,
    address: formatSubcompanyAddressLines(sub) || null,
  };
}

export function snapshotString(
  snap: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  if (!snap) return null;
  const v = snap[key];
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t || null;
}

export function lessorDisplayNameFromSnapshot(snap: Record<string, unknown> | null | undefined): string {
  return (
    snapshotString(snap, "legal_name") ||
    snapshotString(snap, "display_name") ||
    snapshotString(snap, "name") ||
    "Lessor"
  );
}

export function lessorAddressFromSnapshot(snap: Record<string, unknown> | null | undefined): string | null {
  const joined = snapshotString(snap, "address");
  if (joined) return joined;
  if (!snap) return null;
  return (
    formatSubcompanyAddressLines({
      registered_address_line1: snapshotString(snap, "registered_address_line1"),
      registered_address_line2: snapshotString(snap, "registered_address_line2"),
      registered_town: snapshotString(snap, "registered_town"),
      registered_county: snapshotString(snap, "registered_county"),
      registered_postcode: snapshotString(snap, "registered_postcode"),
    }) || null
  );
}
