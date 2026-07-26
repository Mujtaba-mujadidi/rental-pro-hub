export type ContractChangeFieldKey =
  | "name"
  | "legal_name"
  | "company_number"
  | "registered_address"
  | "registered_town"
  | "registered_county"
  | "registered_postcode"
  | "country"
  | "primary_contact_name"
  | "primary_contact_dob"
  | "primary_contact_phone"
  | "primary_contact_email"
  | "notes";

export type ContractChangeFieldSnapshot = {
  name: string | null;
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
  primary_contact_dob: string | null;
  primary_contact_phone: string | null;
  primary_contact_email: string | null;
  notes: string | null;
};

export type ContractChangeDiffRow = {
  key: ContractChangeFieldKey;
  label: string;
  before: string;
  after: string;
  /** Substantive change after normalisation (trim, postcode spacing, case). */
  changed: boolean;
  /** Raw or display-string difference — includes spacing-only edits. */
  displayChanged: boolean;
  /** Visible difference that normalises to the same legal value. */
  formattingOnly: boolean;
};

const FIELD_LABELS: Record<ContractChangeFieldKey, string> = {
  name: "Company name",
  legal_name: "Legal name",
  company_number: "Company number",
  registered_address: "Registered address",
  registered_town: "Town / city",
  registered_county: "County",
  registered_postcode: "Postcode",
  country: "Country",
  primary_contact_name: "Primary contact",
  primary_contact_dob: "Primary contact DOB",
  primary_contact_phone: "Primary contact phone",
  primary_contact_email: "Primary contact email",
  notes: "Notes",
};

function display(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "—";
}

/** UK outward + inward spacing for display (e.g. SW1A1AA → SW1A 1AA). */
export function formatUkPostcodeDisplay(value: string | null | undefined): string {
  const compact = value?.replace(/\s/g, "").toUpperCase();
  if (!compact) return "—";
  if (compact.length > 3) return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
  return compact;
}

/** UK postcode for form fields — compact DB values display as outward + inward (e.g. NW118LN → NW11 8LN). */
export function postcodeForForm(value: string | null | undefined): string {
  if (!value?.trim()) return "";
  const formatted = formatUkPostcodeDisplay(value);
  return formatted === "—" ? "" : formatted;
}

function normalizeCompare(value: string | null | undefined): string {
  return display(value).toLowerCase();
}

function normalizePostcodeCompare(value: string | null | undefined): string {
  return value?.replace(/\s/g, "").toUpperCase() ?? "";
}

function valuesEqualForField(key: ContractChangeFieldKey, before: string, after: string): boolean {
  if (key === "registered_postcode") {
    const left = normalizePostcodeCompare(before === "—" ? null : before);
    const right = normalizePostcodeCompare(after === "—" ? null : after);
    return left === right;
  }
  return normalizeCompare(before) === normalizeCompare(after);
}

function formatAddressLines(snapshot: ContractChangeFieldSnapshot): string {
  const parts = [snapshot.registered_address_line1, snapshot.registered_address_line2]
    .map((part) => part?.trim())
    .filter(Boolean);
  return parts.length ? parts.join(", ") : "—";
}

function displayPostcodeRaw(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "—";
}

function formatContactName(snapshot: ContractChangeFieldSnapshot): string {
  const name = [snapshot.primary_contact_first_name, snapshot.primary_contact_last_name]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  return name || "—";
}

function addressLinesRawChanged(current: ContractChangeFieldSnapshot, proposed: ContractChangeFieldSnapshot): boolean {
  return (
    (current.registered_address_line1 ?? "") !== (proposed.registered_address_line1 ?? "") ||
    (current.registered_address_line2 ?? "") !== (proposed.registered_address_line2 ?? "")
  );
}

function fieldDisplayChanged(
  key: ContractChangeFieldKey,
  current: ContractChangeFieldSnapshot,
  proposed: ContractChangeFieldSnapshot,
): boolean {
  if (key === "registered_address") return addressLinesRawChanged(current, proposed);
  if (key === "registered_postcode") {
    return (current.registered_postcode ?? "") !== (proposed.registered_postcode ?? "");
  }
  if (key === "primary_contact_name") {
    const before = `${current.primary_contact_first_name ?? ""}|${current.primary_contact_last_name ?? ""}`;
    const after = `${proposed.primary_contact_first_name ?? ""}|${proposed.primary_contact_last_name ?? ""}`;
    return before !== after;
  }
  const fieldMap: Partial<Record<ContractChangeFieldKey, keyof ContractChangeFieldSnapshot>> = {
    name: "name",
    legal_name: "legal_name",
    company_number: "company_number",
    registered_town: "registered_town",
    registered_county: "registered_county",
    country: "country",
    primary_contact_dob: "primary_contact_dob",
    primary_contact_phone: "primary_contact_phone",
    primary_contact_email: "primary_contact_email",
    notes: "notes",
  };
  const field = fieldMap[key];
  if (!field) return false;
  return (current[field] ?? "") !== (proposed[field] ?? "");
}

function row(
  key: ContractChangeFieldKey,
  current: ContractChangeFieldSnapshot,
  proposed: ContractChangeFieldSnapshot,
  before: string,
  after: string,
): ContractChangeDiffRow {
  const changed = !valuesEqualForField(key, before, after);
  const displayChanged = fieldDisplayChanged(key, current, proposed);
  return {
    key,
    label: FIELD_LABELS[key],
    before,
    after,
    changed,
    displayChanged,
    formattingOnly: displayChanged && !changed,
  };
}

/** Compare current company legal snapshot vs a proposed change request. */
export function buildContractChangeDiff(
  current: ContractChangeFieldSnapshot,
  proposed: ContractChangeFieldSnapshot,
): ContractChangeDiffRow[] {
  return [
    row("name", current, proposed, display(current.name), display(proposed.name)),
    row("legal_name", current, proposed, display(current.legal_name), display(proposed.legal_name)),
    row("company_number", current, proposed, display(current.company_number), display(proposed.company_number)),
    row("registered_address", current, proposed, formatAddressLines(current), formatAddressLines(proposed)),
    row("registered_town", current, proposed, display(current.registered_town), display(proposed.registered_town)),
    row("registered_county", current, proposed, display(current.registered_county), display(proposed.registered_county)),
    row(
      "registered_postcode",
      current,
      proposed,
      displayPostcodeRaw(current.registered_postcode),
      displayPostcodeRaw(proposed.registered_postcode),
    ),
    row("country", current, proposed, display(current.country), display(proposed.country)),
    row("primary_contact_name", current, proposed, formatContactName(current), formatContactName(proposed)),
    row(
      "primary_contact_dob",
      current,
      proposed,
      display(current.primary_contact_dob),
      display(proposed.primary_contact_dob),
    ),
    row(
      "primary_contact_phone",
      current,
      proposed,
      display(current.primary_contact_phone),
      display(proposed.primary_contact_phone),
    ),
    row(
      "primary_contact_email",
      current,
      proposed,
      display(current.primary_contact_email),
      display(proposed.primary_contact_email),
    ),
    row("notes", current, proposed, display(current.notes), display(proposed.notes)),
  ];
}

export function contractChangeDiffHasChanges(rows: ContractChangeDiffRow[]): boolean {
  return rows.some((entry) => entry.changed);
}

export function contractChangeDiffHasDisplayChanges(rows: ContractChangeDiffRow[]): boolean {
  return rows.some((entry) => entry.displayChanged);
}

export function contractChangeDiffHasFormattingOnlyChanges(rows: ContractChangeDiffRow[]): boolean {
  return rows.some((entry) => entry.formattingOnly);
}

/** Rows with a visible before/after difference (includes formatting-only edits). */
export function contractChangeDiffDisplayChangedRows(rows: ContractChangeDiffRow[]): ContractChangeDiffRow[] {
  return rows.filter((entry) => entry.displayChanged);
}

/** Align stored company data with form display for diff checks (e.g. UK postcode spacing). */
export function companySnapshotForChangeDiff(snapshot: ContractChangeFieldSnapshot): ContractChangeFieldSnapshot {
  const formattedPostcode = postcodeForForm(snapshot.registered_postcode);
  return {
    ...snapshot,
    registered_postcode: formattedPostcode || snapshot.registered_postcode,
  };
}

export function proposedSnapshotFromChangeRequest(request: {
  proposed_name: string | null;
  proposed_legal_name: string | null;
  proposed_company_number: string | null;
  proposed_registered_address_line1: string | null;
  proposed_registered_address_line2: string | null;
  proposed_registered_town: string | null;
  proposed_registered_county: string | null;
  proposed_registered_postcode: string | null;
  proposed_country: string | null;
  proposed_primary_contact_first_name: string | null;
  proposed_primary_contact_last_name: string | null;
  proposed_primary_contact_dob: string | null;
  proposed_primary_contact_phone: string | null;
  proposed_primary_contact_email: string | null;
  proposed_notes: string | null;
}): ContractChangeFieldSnapshot {
  return {
    name: request.proposed_name,
    legal_name: request.proposed_legal_name,
    company_number: request.proposed_company_number,
    registered_address_line1: request.proposed_registered_address_line1,
    registered_address_line2: request.proposed_registered_address_line2,
    registered_town: request.proposed_registered_town,
    registered_county: request.proposed_registered_county,
    registered_postcode: request.proposed_registered_postcode,
    country: request.proposed_country,
    primary_contact_first_name: request.proposed_primary_contact_first_name,
    primary_contact_last_name: request.proposed_primary_contact_last_name,
    primary_contact_dob: request.proposed_primary_contact_dob,
    primary_contact_phone: request.proposed_primary_contact_phone,
    primary_contact_email: request.proposed_primary_contact_email,
    notes: request.proposed_notes,
  };
}
