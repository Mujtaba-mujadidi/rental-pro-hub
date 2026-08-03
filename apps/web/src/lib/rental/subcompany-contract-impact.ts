import {
  formatSubcompanyAddressLines,
  type SubcompanySnapshotSource,
} from "@/lib/rental/subcompany-legal-snapshot";

export type SubcompanyFieldChange = {
  field: string;
  label: string;
  from: string | null;
  to: string | null;
};

/** Fields that appear on driver-facing hire documents / lessor blocks. */
export const CONTRACT_IMPACT_FIELDS = [
  "logo_storage_path",
  "legal_name",
  "display_name",
  "registered_address_line1",
  "registered_address_line2",
  "registered_town",
  "registered_county",
  "registered_postcode",
  "country",
  "primary_contact_first_name",
  "primary_contact_last_name",
  "primary_contact_phone",
  "primary_contact_email",
] as const;

export type ContractImpactField = (typeof CONTRACT_IMPACT_FIELDS)[number];

const FIELD_LABELS: Record<ContractImpactField, string> = {
  logo_storage_path: "Logo",
  legal_name: "Legal name",
  display_name: "Display name",
  registered_address_line1: "Address line 1",
  registered_address_line2: "Address line 2",
  registered_town: "Town",
  registered_county: "County",
  registered_postcode: "Postcode",
  country: "Country",
  primary_contact_first_name: "Contact first name",
  primary_contact_last_name: "Contact last name",
  primary_contact_phone: "Contact phone",
  primary_contact_email: "Contact email",
};

/** Immutable after registration — rejected by update validation. */
export const IMMUTABLE_SUBCOMPANY_FIELDS = ["name", "company_number"] as const;

export type SubcompanyEditablePatch = {
  display_name?: string | null;
  legal_name?: string | null;
  registered_address_line1?: string | null;
  registered_address_line2?: string | null;
  registered_town?: string | null;
  registered_county?: string | null;
  registered_postcode?: string | null;
  country?: string | null;
  primary_contact_first_name?: string;
  primary_contact_last_name?: string;
  primary_contact_dob?: string;
  primary_contact_phone?: string;
  primary_contact_email?: string;
  status?: "active" | "inactive" | "pending";
  notes?: string | null;
};

function norm(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function valueForField(source: SubcompanySnapshotSource | Record<string, unknown>, field: string): string | null {
  if (field === "logo_storage_path") {
    return norm((source as { logo_storage_path?: string | null }).logo_storage_path) ? "(set)" : null;
  }
  return norm((source as Record<string, unknown>)[field]);
}

/**
 * Compare live subcompany fields to a hire `subcompany_legal_snapshot`.
 * Supports legacy snapshots that only store `legal_name`, `company_number`, `address`.
 */
export function detectSubcompanySnapshotDrift(
  live: SubcompanySnapshotSource,
  snapshot: Record<string, unknown> | null | undefined,
): SubcompanyFieldChange[] {
  const snap = snapshot ?? {};
  const changes: SubcompanyFieldChange[] = [];

  for (const field of CONTRACT_IMPACT_FIELDS) {
    const liveVal = valueForField(live, field);
    let snapVal: string | null;

    if (field.startsWith("registered_") || field === "country") {
      // Legacy: only joined `address` — treat as drift if live address string differs.
      if (
        !("registered_address_line1" in snap) &&
        !("registered_town" in snap) &&
        typeof snap.address === "string"
      ) {
        if (field !== "registered_address_line1") continue;
        const liveAddress = formatSubcompanyAddressLines(live) || null;
        snapVal = norm(snap.address);
        if (liveAddress !== snapVal) {
          changes.push({
            field: "address",
            label: "Registered address",
            from: snapVal,
            to: liveAddress,
          });
        }
        continue;
      }
      snapVal = valueForField(snap, field);
    } else if (field === "logo_storage_path") {
      snapVal = norm(snap.logo_storage_path) ? "(set)" : null;
    } else if (
      (field === "primary_contact_first_name" ||
        field === "primary_contact_last_name" ||
        field === "primary_contact_phone" ||
        field === "primary_contact_email") &&
      !(field in snap)
    ) {
      // Legacy snapshots omitted contacts — skip unless field present.
      continue;
    } else if (field === "display_name" && !("display_name" in snap)) {
      continue;
    } else {
      snapVal = valueForField(snap, field);
    }

    if (liveVal !== snapVal) {
      changes.push({
        field,
        label: FIELD_LABELS[field],
        from: snapVal,
        to: liveVal,
      });
    }
  }

  return changes;
}

export function hasContractImpactDrift(
  live: SubcompanySnapshotSource,
  snapshot: Record<string, unknown> | null | undefined,
): boolean {
  return detectSubcompanySnapshotDrift(live, snapshot).length > 0;
}

/** Strip immutable keys and return a safe DB update patch. */
export function sanitizeSubcompanyUpdatePatch(
  input: Record<string, unknown>,
): { ok: true; patch: SubcompanyEditablePatch } | { ok: false; error: string } {
  if ("name" in input || "company_number" in input) {
    return { ok: false, error: "Subcompany name and company number cannot be changed after registration." };
  }

  const patch: SubcompanyEditablePatch = {};

  if ("display_name" in input) patch.display_name = norm(input.display_name);
  if ("legal_name" in input) patch.legal_name = norm(input.legal_name);
  if ("registered_address_line1" in input) patch.registered_address_line1 = norm(input.registered_address_line1);
  if ("registered_address_line2" in input) patch.registered_address_line2 = norm(input.registered_address_line2);
  if ("registered_town" in input) patch.registered_town = norm(input.registered_town);
  if ("registered_county" in input) patch.registered_county = norm(input.registered_county);
  if ("registered_postcode" in input) {
    const pc = norm(input.registered_postcode);
    patch.registered_postcode = pc ? pc.toUpperCase().replace(/\s+/g, "") : null;
  }
  if ("country" in input) patch.country = norm(input.country) ?? "GB";
  if ("notes" in input) patch.notes = norm(input.notes);

  if ("primary_contact_first_name" in input) {
    const v = norm(input.primary_contact_first_name);
    if (!v) return { ok: false, error: "Primary contact first name is required." };
    patch.primary_contact_first_name = v;
  }
  if ("primary_contact_last_name" in input) {
    const v = norm(input.primary_contact_last_name);
    if (!v) return { ok: false, error: "Primary contact last name is required." };
    patch.primary_contact_last_name = v;
  }
  if ("primary_contact_phone" in input) {
    const v = norm(input.primary_contact_phone);
    if (!v) return { ok: false, error: "Primary contact phone is required." };
    patch.primary_contact_phone = v;
  }
  if ("primary_contact_email" in input) {
    const v = norm(input.primary_contact_email);
    if (!v) return { ok: false, error: "Primary contact email is required." };
    patch.primary_contact_email = v;
  }
  if ("primary_contact_dob" in input) {
    const v = norm(input.primary_contact_dob);
    if (!v) return { ok: false, error: "Primary contact date of birth is required." };
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return { ok: false, error: "Invalid date of birth." };
    patch.primary_contact_dob = d.toISOString().slice(0, 10);
  }
  if ("status" in input) {
    const s = norm(input.status);
    if (s !== "active" && s !== "inactive" && s !== "pending") {
      return { ok: false, error: "Invalid status." };
    }
    patch.status = s;
  }

  return { ok: true, patch };
}

export function diffSubcompanyEditableFields(
  before: SubcompanySnapshotSource & { notes?: string | null; status?: string },
  after: SubcompanySnapshotSource & { notes?: string | null; status?: string },
): SubcompanyFieldChange[] {
  const keys: { field: string; label: string }[] = [
    { field: "display_name", label: "Display name" },
    { field: "legal_name", label: "Legal name" },
    { field: "registered_address_line1", label: "Address line 1" },
    { field: "registered_address_line2", label: "Address line 2" },
    { field: "registered_town", label: "Town" },
    { field: "registered_county", label: "County" },
    { field: "registered_postcode", label: "Postcode" },
    { field: "country", label: "Country" },
    { field: "primary_contact_first_name", label: "Contact first name" },
    { field: "primary_contact_last_name", label: "Contact last name" },
    { field: "primary_contact_phone", label: "Contact phone" },
    { field: "primary_contact_email", label: "Contact email" },
    { field: "notes", label: "Notes" },
    { field: "status", label: "Status" },
    { field: "logo_storage_path", label: "Logo" },
  ];
  const changes: SubcompanyFieldChange[] = [];
  for (const { field, label } of keys) {
    const from = valueForField(before as Record<string, unknown>, field);
    const to = valueForField(after as Record<string, unknown>, field);
    if (from !== to) changes.push({ field, label, from, to });
  }
  return changes;
}

export function buildSubcompanyChangeSummary(changes: SubcompanyFieldChange[]): string {
  if (!changes.length) return "No field changes.";
  if (changes.length === 1) return `Updated ${changes[0].label}.`;
  if (changes.length <= 3) return `Updated ${changes.map((c) => c.label).join(", ")}.`;
  return `Updated ${changes.length} fields (${changes
    .slice(0, 3)
    .map((c) => c.label)
    .join(", ")}…).`;
}
